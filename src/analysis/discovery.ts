import fs from 'node:fs';
import path from 'node:path';
import { parseSync } from 'oxc-parser';
import type { Logger } from '../core/logger.js';
import { discoverFiles } from '../indexing/file-index.js';

export type CodeUnitKind = 'function' | 'class' | 'interface' | 'type' | 'enum' | 'variable' | 'arrow';

export interface ParamInfo {
  name: string;
  type: string;
}

export interface MemberInfo {
  name: string;
  kind: 'property' | 'method' | 'getter' | 'setter';
  type?: string;
  isAsync?: boolean;
  paramCount?: number;
}

export interface SignatureInfo {
  params: ParamInfo[];
  returnType?: string;
}

export interface StructuralFingerprint {
  kind: CodeUnitKind;
  paramCount: number;
  paramTypes: string[];
  returnType: string;
  memberCount: number;
  statementCount: number;
  hasAsync: boolean;
  hasExport: boolean;
  bodyComplexity: number;  // rough measure: branches + loops
}

export interface CodeUnit {
  name: string;
  kind: CodeUnitKind;
  filePath: string;
  line: number;
  exported: boolean;
  isAsync: boolean;
  signature?: SignatureInfo;
  members?: MemberInfo[];
  fingerprint: StructuralFingerprint;
}

export interface CodeIndex {
  rootDir: string;
  units: CodeUnit[];
}

export interface SimilarityResult {
  unit: CodeUnit;
  score: number;  // 0.0 to 1.0
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

// ─── Build Index ────────────────────────────────────────────────

export function buildCodeIndex(rootDir: string, logger: Logger): CodeIndex {
  logger.info('discovery', 'building code index', { rootDir });
  const startMs = performance.now();

  const files = discoverFiles(rootDir, logger);
  const units: CodeUnit[] = [];

  for (const filePath of files) {
    const sourceText = fs.readFileSync(filePath, 'utf-8');
    let result;
    try {
      result = parseSync(filePath, sourceText);
    } catch {
      logger.warn('discovery', 'parse failed, skipping', { filePath });
      continue;
    }

    const exportedNames = new Set<string>();
    for (const exp of result.module.staticExports) {
      for (const entry of exp.entries) {
        if (entry.exportName.kind === 'Name' && entry.exportName.name) {
          exportedNames.add(entry.exportName.name);
        }
      }
    }

    extractUnits(result.program, filePath, sourceText, exportedNames, units, logger);
  }

  const durationMs = Math.round(performance.now() - startMs);
  logger.info('discovery', 'code index built', { unitCount: units.length, durationMs });

  return { rootDir, units };
}

// ─── Queries ────────────────────────────────────────────────────

export function listAll(index: CodeIndex, filter?: ListFilter): CodeUnit[] {
  let results = index.units;

  if (filter?.kind) {
    results = results.filter((u) => u.kind === filter.kind);
  }
  if (filter?.exported !== undefined) {
    results = results.filter((u) => u.exported === filter.exported);
  }
  if (filter?.filePattern) {
    results = results.filter((u) => u.filePath.includes(filter.filePattern!));
  }

  return results;
}

export function querySimilar(index: CodeIndex, targetName: string): SimilarityResult[] {
  const target = index.units.find((u) => u.name === targetName);
  if (!target) return [];

  const results: SimilarityResult[] = [];

  for (const unit of index.units) {
    if (unit === target) continue;
    if (unit.kind !== target.kind) continue;

    const { score, reasons } = computeSimilarity(target.fingerprint, unit.fingerprint);
    if (score > 0.3) {
      results.push({ unit, score, reasons });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results;
}

export function queryBySignature(index: CodeIndex, query: SignatureQuery): CodeUnit[] {
  return index.units.filter((unit) => {
    if (!unit.signature) return false;

    if (query.paramCount !== undefined && unit.signature.params.length !== query.paramCount) return false;

    if (query.paramTypes) {
      if (unit.signature.params.length !== query.paramTypes.length) return false;
      for (let i = 0; i < query.paramTypes.length; i++) {
        if (unit.signature.params[i].type !== query.paramTypes[i]) return false;
      }
    }

    if (query.returnType && unit.signature.returnType !== query.returnType) return false;

    return true;
  });
}

export function queryByPattern(index: CodeIndex, query: PatternQuery): CodeUnit[] {
  return index.units.filter((unit) => {
    if (query.kind && unit.kind !== query.kind) return false;
    if (query.isAsync !== undefined && unit.isAsync !== query.isAsync) return false;
    if (query.namePattern && !unit.name.includes(query.namePattern)) return false;
    if (query.hasMember) {
      if (!unit.members) return false;
      if (!unit.members.some((m) => m.name === query.hasMember)) return false;
    }
    return true;
  });
}

// ─── Similarity Scoring ─────────────────────────────────────────

function computeSimilarity(a: StructuralFingerprint, b: StructuralFingerprint): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let totalWeight = 0;
  let matchWeight = 0;

  // Param count match (weight 3)
  totalWeight += 3;
  if (a.paramCount === b.paramCount) {
    matchWeight += 3;
    reasons.push('same param count');
  }

  // Param types match (weight 4)
  if (a.paramTypes.length === b.paramTypes.length && a.paramTypes.length > 0) {
    totalWeight += 4;
    let typeMatches = 0;
    for (let i = 0; i < a.paramTypes.length; i++) {
      if (a.paramTypes[i] === b.paramTypes[i]) typeMatches++;
    }
    const typeScore = 4 * (typeMatches / a.paramTypes.length);
    matchWeight += typeScore;
    if (typeMatches === a.paramTypes.length) reasons.push('identical param types');
    else if (typeMatches > 0) reasons.push('similar param types');
  }

  // Return type match (weight 3)
  totalWeight += 3;
  if (a.returnType && b.returnType && a.returnType === b.returnType) {
    matchWeight += 3;
    reasons.push('same return type');
  }

  // Statement count similarity (weight 2)
  totalWeight += 2;
  if (a.statementCount > 0 && b.statementCount > 0) {
    const ratio = Math.min(a.statementCount, b.statementCount) / Math.max(a.statementCount, b.statementCount);
    matchWeight += 2 * ratio;
    if (ratio > 0.8) reasons.push('similar body size');
  }

  // Complexity similarity (weight 2)
  totalWeight += 2;
  if (a.bodyComplexity === b.bodyComplexity) {
    matchWeight += 2;
    reasons.push('same complexity');
  } else {
    const maxC = Math.max(a.bodyComplexity, b.bodyComplexity, 1);
    const ratio = 1 - Math.abs(a.bodyComplexity - b.bodyComplexity) / maxC;
    matchWeight += 2 * ratio;
  }

  // Async match (weight 1)
  totalWeight += 1;
  if (a.hasAsync === b.hasAsync) {
    matchWeight += 1;
  }

  // Member count similarity for classes/interfaces (weight 2)
  if (a.memberCount > 0 || b.memberCount > 0) {
    totalWeight += 2;
    if (a.memberCount === b.memberCount) {
      matchWeight += 2;
      reasons.push('same member count');
    } else if (a.memberCount > 0 && b.memberCount > 0) {
      const ratio = Math.min(a.memberCount, b.memberCount) / Math.max(a.memberCount, b.memberCount);
      matchWeight += 2 * ratio;
    }
  }

  const score = totalWeight > 0 ? matchWeight / totalWeight : 0;
  return { score, reasons };
}

// ─── AST Extraction ─────────────────────────────────────────────

function extractUnits(
  program: any,
  filePath: string,
  sourceText: string,
  exportedNames: Set<string>,
  units: CodeUnit[],
  logger: Logger,
): void {
  walkAst(program, (node: any) => {
    // Function declarations
    if (node.type === 'FunctionDeclaration' && node.id?.name) {
      const name = node.id.name;
      const params = extractParams(node.params);
      const returnType = node.returnType?.typeAnnotation ? extractTypeText(node.returnType.typeAnnotation, sourceText) : undefined;
      const stmtCount = countStatements(node.body);
      const complexity = countComplexity(node.body);

      units.push({
        name,
        kind: 'function',
        filePath,
        line: getLine(sourceText, node.start),
        exported: exportedNames.has(name),
        isAsync: node.async ?? false,
        signature: { params, returnType },
        fingerprint: {
          kind: 'function',
          paramCount: params.length,
          paramTypes: params.map((p) => p.type),
          returnType: returnType ?? '',
          memberCount: 0,
          statementCount: stmtCount,
          hasAsync: node.async ?? false,
          hasExport: exportedNames.has(name),
          bodyComplexity: complexity,
        },
      });
    }

    // Arrow functions assigned to variables
    if (node.type === 'VariableDeclarator' && node.id?.name && node.init) {
      const initType = node.init.type;
      if (initType === 'ArrowFunctionExpression' || initType === 'FunctionExpression') {
        const name = node.id.name;
        const params = extractParams(node.init.params);
        const returnType = node.init.returnType?.typeAnnotation ? extractTypeText(node.init.returnType.typeAnnotation, sourceText) : undefined;
        const stmtCount = countStatements(node.init.body);
        const complexity = countComplexity(node.init.body);

        units.push({
          name,
          kind: initType === 'ArrowFunctionExpression' ? 'arrow' : 'function',
          filePath,
          line: getLine(sourceText, node.start),
          exported: exportedNames.has(name),
          isAsync: node.init.async ?? false,
          signature: { params, returnType },
          fingerprint: {
            kind: 'arrow',
            paramCount: params.length,
            paramTypes: params.map((p) => p.type),
            returnType: returnType ?? '',
            memberCount: 0,
            statementCount: stmtCount,
            hasAsync: node.init.async ?? false,
            hasExport: exportedNames.has(name),
            bodyComplexity: complexity,
          },
        });
      }

      // Constants (non-function)
      if (initType !== 'ArrowFunctionExpression' && initType !== 'FunctionExpression') {
        const name = node.id.name;
        const typeAnnotation = node.id.typeAnnotation?.typeAnnotation
          ? extractTypeText(node.id.typeAnnotation.typeAnnotation, sourceText)
          : undefined;

        // Only index exported constants or those with type annotations
        if (exportedNames.has(name)) {
          units.push({
            name,
            kind: 'variable',
            filePath,
            line: getLine(sourceText, node.start),
            exported: true,
            isAsync: false,
            fingerprint: {
              kind: 'variable',
              paramCount: 0,
              paramTypes: [],
              returnType: typeAnnotation ?? '',
              memberCount: 0,
              statementCount: 0,
              hasAsync: false,
              hasExport: true,
              bodyComplexity: 0,
            },
          });
        }
      }
    }

    // Class declarations
    if (node.type === 'ClassDeclaration' && node.id?.name) {
      const name = node.id.name;
      const members = extractClassMembers(node.body, sourceText);

      units.push({
        name,
        kind: 'class',
        filePath,
        line: getLine(sourceText, node.start),
        exported: exportedNames.has(name),
        isAsync: false,
        members,
        fingerprint: {
          kind: 'class',
          paramCount: 0,
          paramTypes: [],
          returnType: '',
          memberCount: members.length,
          statementCount: 0,
          hasAsync: members.some((m) => m.isAsync),
          hasExport: exportedNames.has(name),
          bodyComplexity: 0,
        },
      });
    }

    // Interface declarations (TSInterfaceDeclaration in oxc)
    if (node.type === 'TSInterfaceDeclaration' && node.id?.name) {
      const name = node.id.name;
      const members = extractInterfaceMembers(node.body, sourceText);

      units.push({
        name,
        kind: 'interface',
        filePath,
        line: getLine(sourceText, node.start),
        exported: exportedNames.has(name),
        isAsync: false,
        members,
        fingerprint: {
          kind: 'interface',
          paramCount: 0,
          paramTypes: [],
          returnType: '',
          memberCount: members.length,
          statementCount: 0,
          hasAsync: false,
          hasExport: exportedNames.has(name),
          bodyComplexity: 0,
        },
      });
    }

    // Type alias declarations
    if (node.type === 'TSTypeAliasDeclaration' && node.id?.name) {
      const name = node.id.name;

      units.push({
        name,
        kind: 'type',
        filePath,
        line: getLine(sourceText, node.start),
        exported: exportedNames.has(name),
        isAsync: false,
        fingerprint: {
          kind: 'type',
          paramCount: 0,
          paramTypes: [],
          returnType: '',
          memberCount: 0,
          statementCount: 0,
          hasAsync: false,
          hasExport: exportedNames.has(name),
          bodyComplexity: 0,
        },
      });
    }

    // Enum declarations
    if (node.type === 'TSEnumDeclaration' && node.id?.name) {
      const name = node.id.name;
      const memberCount = node.members?.length ?? 0;

      units.push({
        name,
        kind: 'enum',
        filePath,
        line: getLine(sourceText, node.start),
        exported: exportedNames.has(name),
        isAsync: false,
        fingerprint: {
          kind: 'enum',
          paramCount: 0,
          paramTypes: [],
          returnType: '',
          memberCount,
          statementCount: 0,
          hasAsync: false,
          hasExport: exportedNames.has(name),
          bodyComplexity: 0,
        },
      });
    }
  });
}

function extractParams(params: any[]): ParamInfo[] {
  if (!params) return [];
  return params.map((p: any) => ({
    name: p.name ?? p.argument?.name ?? p.left?.name ?? '?',
    type: p.typeAnnotation?.typeAnnotation?.typeName?.name
      ?? p.typeAnnotation?.typeAnnotation?.type?.replace('TS', '').replace('Keyword', '').toLowerCase()
      ?? 'unknown',
  }));
}

function extractTypeText(typeNode: any, sourceText: string): string {
  if (typeNode.start !== undefined && typeNode.end !== undefined) {
    return sourceText.slice(typeNode.start, typeNode.end);
  }
  return typeNode.typeName?.name ?? typeNode.type?.replace('TS', '').replace('Keyword', '').toLowerCase() ?? 'unknown';
}

function extractClassMembers(body: any, sourceText: string): MemberInfo[] {
  if (!body?.body) return [];
  const members: MemberInfo[] = [];

  for (const member of body.body) {
    if (member.type === 'MethodDefinition' && member.key?.name) {
      members.push({
        name: member.key.name,
        kind: member.kind === 'get' ? 'getter' : member.kind === 'set' ? 'setter' : 'method',
        isAsync: member.value?.async ?? false,
        paramCount: member.value?.params?.length ?? 0,
      });
    }
    if (member.type === 'PropertyDefinition' && member.key?.name) {
      members.push({
        name: member.key.name,
        kind: 'property',
        type: member.typeAnnotation?.typeAnnotation ? extractTypeText(member.typeAnnotation.typeAnnotation, sourceText) : undefined,
      });
    }
  }

  return members;
}

function extractInterfaceMembers(body: any, sourceText: string): MemberInfo[] {
  if (!body?.body) return [];
  const members: MemberInfo[] = [];

  for (const member of body.body) {
    if (member.type === 'TSPropertySignature' && member.key?.name) {
      members.push({
        name: member.key.name,
        kind: 'property',
        type: member.typeAnnotation?.typeAnnotation ? extractTypeText(member.typeAnnotation.typeAnnotation, sourceText) : undefined,
      });
    }
    if (member.type === 'TSMethodSignature' && member.key?.name) {
      members.push({
        name: member.key.name,
        kind: 'method',
        paramCount: member.params?.length ?? 0,
      });
    }
  }

  return members;
}

function countStatements(body: any): number {
  if (!body) return 0;
  if (body.type === 'BlockStatement') return body.body?.length ?? 0;
  return 1; // expression body (arrow)
}

function countComplexity(body: any): number {
  if (!body) return 0;
  let complexity = 0;
  walkAst(body, (node: any) => {
    if (node.type === 'IfStatement') complexity++;
    if (node.type === 'ForStatement' || node.type === 'ForOfStatement' || node.type === 'ForInStatement') complexity++;
    if (node.type === 'WhileStatement' || node.type === 'DoWhileStatement') complexity++;
    if (node.type === 'SwitchStatement') complexity++;
    if (node.type === 'TryStatement') complexity++;
    if (node.type === 'ConditionalExpression') complexity++;
  });
  return complexity;
}

function getLine(sourceText: string, pos: number): number {
  let line = 1;
  for (let i = 0; i < pos && i < sourceText.length; i++) {
    if (sourceText[i] === '\n') line++;
  }
  return line;
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
