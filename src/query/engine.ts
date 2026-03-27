/**
 * Query engine: unified scan → fingerprint → indexed query.
 * Combines Merkle AST hashing (structural similarity),
 * inverted index (fast candidate retrieval), and lookup maps (O(1) queries).
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseSync } from 'oxc-parser';
import type { Logger } from '../core/logger.js';
import { discoverFiles } from '../indexing/file-index.js';
import { extractAll } from '../scanner/extractors.js';
import { merkleHash, subtreeHashes, diceSimilarity } from '../fingerprint/hasher.js';
import type { CodeUnitRecord, CodeUnitKind, ScanResult } from '../scanner/types.js';

// ─── Public types ───────────────────────────────────────────────

export interface IndexedUnit {
  name: string;
  kind: CodeUnitKind;
  filePath: string;
  line: number;
  exported: boolean;
  isAsync: boolean;
  params: { name: string; type: string }[];
  returnType: string;
  members: { name: string; kind: string }[];
  complexity: number;
  bodyLineCount: number;
  /** Merkle subtree hashes for structural similarity */
  subtreeHashes: number[];
  /** Token bag for SourcererCC-style retrieval: token → count */
  tokenBag: Map<string, number>;
}

export interface SimilarResult {
  unit: IndexedUnit;
  score: number;
  reasons: string[];
}

export interface SignatureQuery {
  paramTypes?: string[];
  paramCount?: number;
  returnType?: string;
}

export interface PatternQuery {
  kind?: CodeUnitKind;
  hasMember?: string;
  isAsync?: boolean;
  namePattern?: string;
}

export interface ListFilter {
  kind?: CodeUnitKind;
  exported?: boolean;
  filePattern?: string;
}

export interface IndexStats {
  totalUnits: number;
  byKind: Record<string, number>;
  fileCount: number;
  exportedCount: number;
}

export interface QueryEngine {
  find(name: string): IndexedUnit[];
  list(filter?: ListFilter): IndexedUnit[];
  similar(name: string, minScore?: number): SimilarResult[];
  searchBySignature(query: SignatureQuery): IndexedUnit[];
  searchByPattern(query: PatternQuery): IndexedUnit[];
  stats(): IndexStats;
}

// ─── Implementation ─────────────────────────────────────────────

export function createQueryEngine(rootDir: string, logger: Logger): QueryEngine {
  logger.info('query-engine', 'building index', { rootDir });
  const startMs = performance.now();

  const files = discoverFiles(rootDir, logger);
  const allUnits: IndexedUnit[] = [];

  // Lookup indexes
  const byName = new Map<string, IndexedUnit[]>();
  const byKind = new Map<string, IndexedUnit[]>();
  const byParamSig = new Map<string, IndexedUnit[]>();
  const byReturnType = new Map<string, IndexedUnit[]>();
  const byParamCount = new Map<number, IndexedUnit[]>();
  const byMember = new Map<string, IndexedUnit[]>();
  const fileSet = new Set<string>();

  for (const filePath of files) {
    const sourceText = fs.readFileSync(filePath, 'utf-8');
    let scanResult: ScanResult;
    try {
      scanResult = extractAll(filePath, sourceText, '');
    } catch {
      logger.warn('query-engine', 'scan failed, skipping', { filePath });
      continue;
    }

    fileSet.add(filePath);

    // For each code unit, compute fingerprints and build indexed unit
    for (const unit of scanResult.codeUnits) {
      const indexed = buildIndexedUnit(unit, filePath, sourceText, logger);
      allUnits.push(indexed);

      // Populate lookup indexes
      addToMap(byName, indexed.name, indexed);
      addToMap(byKind, indexed.kind, indexed);

      if (indexed.params.length > 0) {
        const sigKey = indexed.params.map((p) => p.type).join(',');
        addToMap(byParamSig, sigKey, indexed);
        addToMapNum(byParamCount, indexed.params.length, indexed);
      }

      if (indexed.returnType) {
        addToMap(byReturnType, indexed.returnType, indexed);
      }

      for (const member of indexed.members) {
        addToMap(byMember, member.name, indexed);
      }
    }
  }

  // Build inverted token index for fast similarity candidate retrieval
  const tokenIndex = buildTokenIndex(allUnits);

  const durationMs = Math.round(performance.now() - startMs);
  logger.info('query-engine', 'index built', {
    unitCount: allUnits.length, fileCount: fileSet.size, durationMs,
  });

  return {
    find(name: string): IndexedUnit[] {
      return byName.get(name) ?? [];
    },

    list(filter?: ListFilter): IndexedUnit[] {
      let results = allUnits;
      if (filter?.kind) results = byKind.get(filter.kind) ?? [];
      if (filter?.exported !== undefined) results = results.filter((u) => u.exported === filter.exported);
      if (filter?.filePattern) results = results.filter((u) => u.filePath.includes(filter.filePattern!));
      return results;
    },

    similar(name: string, minScore = 0.3): SimilarResult[] {
      const targets = byName.get(name);
      if (!targets || targets.length === 0) return [];
      const target = targets[0];

      // Use inverted token index for candidate retrieval (SourcererCC approach)
      const candidates = getCandidates(target, tokenIndex, allUnits);

      const results: SimilarResult[] = [];
      for (const candidate of candidates) {
        if (candidate === target) continue;
        if (candidate.kind !== target.kind) continue;

        // Dice similarity on Merkle subtree hashes (structural)
        const structuralScore = diceSimilarity(target.subtreeHashes, candidate.subtreeHashes);

        // Token overlap score
        const tokenScore = tokenOverlap(target.tokenBag, candidate.tokenBag);

        // Combined score (weighted)
        const score = 0.6 * structuralScore + 0.4 * tokenScore;

        if (score >= minScore) {
          const reasons: string[] = [];
          if (structuralScore > 0.8) reasons.push('identical structure');
          else if (structuralScore > 0.5) reasons.push('similar structure');

          const targetSig = target.params.map((p) => p.type).join(',');
          const candSig = candidate.params.map((p) => p.type).join(',');
          if (targetSig === candSig && targetSig.length > 0) reasons.push('same param types');
          if (target.returnType === candidate.returnType && target.returnType) reasons.push('same return type');
          if (target.params.length === candidate.params.length) reasons.push('same param count');

          results.push({ unit: candidate, score, reasons });
        }
      }

      results.sort((a, b) => b.score - a.score);
      return results;
    },

    searchBySignature(query: SignatureQuery): IndexedUnit[] {
      let candidates: IndexedUnit[] | undefined;

      // Use indexes for fast lookup
      if (query.paramTypes) {
        const key = query.paramTypes.join(',');
        candidates = byParamSig.get(key);
      } else if (query.paramCount !== undefined) {
        candidates = byParamCount.get(query.paramCount);
      } else if (query.returnType) {
        candidates = byReturnType.get(query.returnType);
      }

      if (!candidates) candidates = allUnits;

      return candidates.filter((u) => {
        if (query.paramTypes && u.params.map((p) => p.type).join(',') !== query.paramTypes.join(',')) return false;
        if (query.paramCount !== undefined && u.params.length !== query.paramCount) return false;
        if (query.returnType && u.returnType !== query.returnType) return false;
        return true;
      });
    },

    searchByPattern(query: PatternQuery): IndexedUnit[] {
      let results = query.kind ? (byKind.get(query.kind) ?? []) : allUnits;
      if (query.hasMember) {
        const withMember = byMember.get(query.hasMember) ?? [];
        results = query.kind ? results.filter((u) => withMember.includes(u)) : withMember;
      }
      if (query.isAsync !== undefined) results = results.filter((u) => u.isAsync === query.isAsync);
      if (query.namePattern) results = results.filter((u) => u.name.includes(query.namePattern!));
      return results;
    },

    stats(): IndexStats {
      const kindCounts: Record<string, number> = {};
      for (const u of allUnits) {
        kindCounts[u.kind] = (kindCounts[u.kind] ?? 0) + 1;
      }
      return {
        totalUnits: allUnits.length,
        byKind: kindCounts,
        fileCount: fileSet.size,
        exportedCount: allUnits.filter((u) => u.exported).length,
      };
    },
  };
}

// ─── Internal helpers ───────────────────────────────────────────

function buildIndexedUnit(
  unit: CodeUnitRecord,
  filePath: string,
  sourceText: string,
  logger: Logger,
): IndexedUnit {
  // Compute Merkle subtree hashes from the raw AST
  let hashes: number[] = [];
  try {
    const result = parseSync(filePath, sourceText);
    // Find the AST node for this unit
    const astNode = findUnitAstNode(result.program, unit.name, unit.kind);
    if (astNode) {
      hashes = subtreeHashes(astNode);
    }
  } catch {
    // Parsing may fail for some files, that's ok
  }

  // Build token bag from typeTokens
  const tokenBag = new Map<string, number>();
  for (const token of unit.typeTokens) {
    tokenBag.set(token, (tokenBag.get(token) ?? 0) + 1);
  }

  return {
    name: unit.name,
    kind: unit.kind,
    filePath,
    line: unit.line,
    exported: unit.exported,
    isAsync: unit.isAsync,
    params: unit.params,
    returnType: unit.returnType,
    members: unit.members.map((m) => ({ name: m.name, kind: m.kind })),
    complexity: unit.complexity,
    bodyLineCount: unit.bodyLineCount,
    subtreeHashes: hashes,
    tokenBag,
  };
}

function findUnitAstNode(program: any, name: string, kind: CodeUnitKind): any | undefined {
  let found: any;
  walkAst(program, (node: any) => {
    if (found) return;
    if (node.type === 'FunctionDeclaration' && node.id?.name === name && (kind === 'function')) {
      found = node;
    }
    if (node.type === 'VariableDeclarator' && node.id?.name === name && node.init &&
        (node.init.type === 'ArrowFunctionExpression' || node.init.type === 'FunctionExpression')) {
      found = node.init;
    }
    if (node.type === 'ClassDeclaration' && node.id?.name === name) found = node;
    if (node.type === 'TSInterfaceDeclaration' && node.id?.name === name) found = node;
  });
  return found;
}

/** Inverted token index: token → list of unit indices */
interface TokenIndex {
  index: Map<string, number[]>;     // token → unit indices
  globalFreq: Map<string, number>;  // token → total frequency across all units
}

function buildTokenIndex(units: IndexedUnit[]): TokenIndex {
  const index = new Map<string, number[]>();
  const globalFreq = new Map<string, number>();

  for (let i = 0; i < units.length; i++) {
    for (const [token, count] of units[i].tokenBag) {
      const list = index.get(token);
      if (list) list.push(i);
      else index.set(token, [i]);
      globalFreq.set(token, (globalFreq.get(token) ?? 0) + count);
    }
  }

  return { index, globalFreq };
}

/** Get candidate units that share tokens with the target (SourcererCC-style) */
function getCandidates(target: IndexedUnit, tokenIndex: TokenIndex, allUnits: IndexedUnit[]): IndexedUnit[] {
  const candidateScores = new Map<number, number>();

  // Sort tokens by rarity (global frequency ascending) — rare tokens first
  const sortedTokens = [...target.tokenBag.entries()]
    .sort((a, b) => (tokenIndex.globalFreq.get(a[0]) ?? 0) - (tokenIndex.globalFreq.get(b[0]) ?? 0));

  for (const [token] of sortedTokens) {
    const unitIndices = tokenIndex.index.get(token) ?? [];
    for (const idx of unitIndices) {
      candidateScores.set(idx, (candidateScores.get(idx) ?? 0) + 1);
    }
  }

  // Return units with at least 1 shared token, sorted by overlap
  return [...candidateScores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([idx]) => allUnits[idx]);
}

function tokenOverlap(a: Map<string, number>, b: Map<string, number>): number {
  if (a.size === 0 && b.size === 0) return 1.0;
  if (a.size === 0 || b.size === 0) return 0.0;

  let intersection = 0;
  let totalA = 0;
  let totalB = 0;

  for (const [token, count] of a) {
    totalA += count;
    const bCount = b.get(token) ?? 0;
    intersection += Math.min(count, bCount);
  }
  for (const [, count] of b) totalB += count;

  return (2 * intersection) / (totalA + totalB);
}

function addToMap(map: Map<string, IndexedUnit[]>, key: string, unit: IndexedUnit): void {
  const list = map.get(key);
  if (list) list.push(unit);
  else map.set(key, [unit]);
}

function addToMapNum(map: Map<number, IndexedUnit[]>, key: number, unit: IndexedUnit): void {
  const list = map.get(key);
  if (list) list.push(unit);
  else map.set(key, [unit]);
}

function walkAst(node: any, visitor: (node: any) => void): void {
  if (!node || typeof node !== 'object') return;
  if (node.type) visitor(node);
  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'start' || key === 'end') continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child) walkAst(item, visitor);
    } else if (child && typeof child === 'object' && child.type) {
      walkAst(child, visitor);
    }
  }
}
