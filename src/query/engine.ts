/**
 * Query engine: Level 1 index for list/find, lazy Level 2 for similarity.
 * Single path — all queries go through the persistent file summary index.
 * Deep analysis (extractAll) only invoked on-demand for specific files.
 */
import fs from 'node:fs';
import type { Logger } from '../core/logger.js';
import { extractAll } from '../scanner/extractors.js';
import { diceSimilarity, fnv1a } from '../fingerprint/hasher.js';
import type { CodeUnitRecord, CodeUnitKind } from '../scanner/types.js';
import { buildProjectIndex, type ProjectIndex } from '../scanner/index-store.js';
import type { FileSummary } from '../scanner/file-summary.js';

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
  subtreeHashes: number[];
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

/** Lightweight unit from Level 1 index — no deep analysis needed */
export interface LightUnit {
  name: string;
  kind: string;
  filePath: string;
  exported: boolean;
}

export interface QueryEngine {
  find(name: string): LightUnit[];
  list(filter?: ListFilter): LightUnit[];
  similar(name: string, minScore?: number): SimilarResult[];
  searchBySignature(query: SignatureQuery): IndexedUnit[];
  searchByPattern(query: PatternQuery): LightUnit[];
  stats(): IndexStats;
}

// ─── Implementation ─────────────────────────────────────────────

export function createQueryEngine(rootDir: string, logger: Logger): QueryEngine {
  logger.info('query-engine', 'building from index', { rootDir });
  const startMs = performance.now();

  // Level 1: lightweight index — fast
  const index = buildProjectIndex(rootDir, logger);

  // Build lightweight unit list from summaries
  const allLightUnits: LightUnit[] = [];
  const byName = new Map<string, LightUnit[]>();
  const byFile = new Map<string, LightUnit[]>();
  const fileSet = new Set<string>();

  for (const [filePath, summary] of index.summaries) {
    fileSet.add(filePath);
    // Use nameKinds for kind info, fall back to topLevelNames
    const kindMap = new Map<string, string>();
    if (summary.nameKinds) {
      for (const nk of summary.nameKinds) kindMap.set(nk.name, nk.kind);
    }
    for (const name of summary.topLevelNames) {
      const kind = kindMap.get(name) ?? 'unknown';
      const unit: LightUnit = { name, kind, filePath, exported: summary.exports.includes(name) };
      allLightUnits.push(unit);
      addToMap(byName, name, unit);
      addToMapArr(byFile, filePath, unit);
    }
  }

  // Deep analysis cache — lazy, per-file, computed on-demand
  const deepCache = new Map<string, IndexedUnit[]>();

  function getDeepUnits(filePath: string): IndexedUnit[] {
    let cached = deepCache.get(filePath);
    if (cached) return cached;

    try {
      const sourceText = fs.readFileSync(filePath, 'utf-8');
      const scanResult = extractAll(filePath, sourceText, '');
      cached = scanResult.codeUnits.map((unit) => buildIndexedUnit(unit, filePath));
      deepCache.set(filePath, cached);
      return cached;
    } catch {
      return [];
    }
  }

  const durationMs = Math.round(performance.now() - startMs);
  logger.info('query-engine', 'index ready', {
    files: fileSet.size, names: allLightUnits.length, durationMs,
  });

  return {
    find(name: string): LightUnit[] {
      return byName.get(name) ?? [];
    },

    list(filter?: ListFilter): LightUnit[] {
      let results = allLightUnits;
      if (filter?.exported !== undefined) results = results.filter((u) => u.exported === filter.exported);
      if (filter?.filePattern) results = results.filter((u) => u.filePath.includes(filter.filePattern!));
      // Kind filter uses Level 1 nameKinds — no deep analysis needed
      if (filter?.kind) results = results.filter((u) => u.kind === filter.kind);
      return results;
    },

    similar(name: string, minScore = 0.3): SimilarResult[] {
      const targetFiles = byName.get(name);
      if (!targetFiles || targetFiles.length === 0) return [];

      // Level 2: deep-analyze ONLY the target file
      const targetDeep = getDeepUnits(targetFiles[0].filePath);
      const target = targetDeep.find((u) => u.name === name);
      if (!target) return [];

      // Find candidate files from index (files with similar exports)
      // Deep-analyze only those candidates
      const results: SimilarResult[] = [];
      const seen = new Set<string>();

      for (const [filePath] of index.summaries) {
        const candidates = getDeepUnits(filePath);
        for (const candidate of candidates) {
          // Skip the target itself, not the whole file
          if (candidate.name === target.name && filePath === targetFiles[0].filePath) continue;
          if (candidate.kind !== target.kind) continue;
          if (seen.has(`${filePath}:${candidate.name}`)) continue;
          seen.add(`${filePath}:${candidate.name}`);

          const structuralScore = diceSimilarity(target.subtreeHashes, candidate.subtreeHashes);
          const tokenScore = tokenOverlap(target.tokenBag, candidate.tokenBag);
          const score = 0.6 * structuralScore + 0.4 * tokenScore;

          if (score >= minScore) {
            const reasons: string[] = [];
            if (structuralScore > 0.8) reasons.push('identical structure');
            else if (structuralScore > 0.5) reasons.push('similar structure');
            const tSig = target.params.map((p) => p.type).join(',');
            const cSig = candidate.params.map((p) => p.type).join(',');
            if (tSig === cSig && tSig.length > 0) reasons.push('same param types');
            if (target.returnType === candidate.returnType && target.returnType) reasons.push('same return type');
            if (target.params.length === candidate.params.length) reasons.push('same param count');

            results.push({ unit: candidate, score, reasons });
          }
        }
      }

      results.sort((a, b) => b.score - a.score);
      return results;
    },

    searchBySignature(query: SignatureQuery): IndexedUnit[] {
      // Needs deep analysis — scan all files lazily
      const results: IndexedUnit[] = [];
      for (const [filePath] of index.summaries) {
        const units = getDeepUnits(filePath);
        for (const u of units) {
          if (query.paramTypes && u.params.map((p) => p.type).join(',') !== query.paramTypes.join(',')) continue;
          if (query.paramCount !== undefined && u.params.length !== query.paramCount) continue;
          if (query.returnType && u.returnType !== query.returnType) continue;
          results.push(u);
        }
      }
      return results;
    },

    searchByPattern(query: PatternQuery): LightUnit[] {
      let results = allLightUnits;
      if (query.namePattern) results = results.filter((u) => u.name.includes(query.namePattern!));
      if (query.kind || query.hasMember || query.isAsync !== undefined) {
        // Need deep analysis for these filters
        const deepResults: LightUnit[] = [];
        for (const unit of results) {
          const deep = getDeepUnits(unit.filePath);
          const match = deep.find((d) => {
            if (d.name !== unit.name) return false;
            if (query.kind && d.kind !== query.kind) return false;
            if (query.isAsync !== undefined && d.isAsync !== query.isAsync) return false;
            if (query.hasMember && !d.members.some((m) => m.name === query.hasMember)) return false;
            return true;
          });
          if (match) deepResults.push(unit);
        }
        return deepResults;
      }
      return results;
    },

    stats(): IndexStats {
      const kindCounts: Record<string, number> = {};
      for (const u of allLightUnits) {
        kindCounts[u.kind] = (kindCounts[u.kind] ?? 0) + 1;
      }
      return {
        totalUnits: allLightUnits.length,
        byKind: kindCounts,
        fileCount: fileSet.size,
        exportedCount: allLightUnits.filter((u) => u.exported).length,
      };
    },
  };
}

// ─── Helpers ────────────────────────────────────────────────────

function buildIndexedUnit(unit: CodeUnitRecord, filePath: string): IndexedUnit {
  const hashes = hashFromNodeTypes(unit.nodeTypes);
  const tokenBag = new Map<string, number>();
  for (const token of unit.typeTokens) {
    tokenBag.set(token, (tokenBag.get(token) ?? 0) + 1);
  }
  return {
    name: unit.name, kind: unit.kind, filePath, line: unit.line,
    exported: unit.exported, isAsync: unit.isAsync,
    params: unit.params, returnType: unit.returnType,
    members: unit.members.map((m) => ({ name: m.name, kind: m.kind })),
    complexity: unit.complexity, bodyLineCount: unit.bodyLineCount,
    subtreeHashes: hashes, tokenBag,
  };
}

function hashFromNodeTypes(nodeTypes: string[]): number[] {
  if (nodeTypes.length === 0) return [];
  const hashes: number[] = [];
  for (let i = 0; i < nodeTypes.length; i++) {
    hashes.push(fnv1a(nodeTypes[i]));
    if (i + 1 < nodeTypes.length) hashes.push(fnv1a(nodeTypes[i] + ':' + nodeTypes[i + 1]));
    if (i + 2 < nodeTypes.length) hashes.push(fnv1a(nodeTypes[i] + ':' + nodeTypes[i + 1] + ':' + nodeTypes[i + 2]));
  }
  return hashes;
}

function tokenOverlap(a: Map<string, number>, b: Map<string, number>): number {
  if (a.size === 0 && b.size === 0) return 1.0;
  if (a.size === 0 || b.size === 0) return 0.0;
  let intersection = 0, totalA = 0, totalB = 0;
  for (const [token, count] of a) { totalA += count; intersection += Math.min(count, b.get(token) ?? 0); }
  for (const [, count] of b) totalB += count;
  return (2 * intersection) / (totalA + totalB);
}

function addToMap(map: Map<string, LightUnit[]>, key: string, unit: LightUnit): void {
  const list = map.get(key);
  if (list) list.push(unit);
  else map.set(key, [unit]);
}

function addToMapArr(map: Map<string, LightUnit[]>, key: string, unit: LightUnit): void {
  const list = map.get(key);
  if (list) list.push(unit);
  else map.set(key, [unit]);
}
