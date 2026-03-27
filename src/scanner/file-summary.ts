/**
 * Lightweight per-file summary extraction.
 * Inspired by Stack Graphs (arxiv:2211.01224) and Sorbet's multi-phase architecture.
 *
 * Level 1: Extract ONLY module-level metadata — imports, exports, top-level names.
 * No recursive AST walking. Cost: ~0.05ms/file (same as parse time).
 * This is what 90% of queries need. Deep analysis (Level 2) is on-demand.
 */
import { parseSync } from 'oxc-parser';

export interface ImportSummary {
  source: string;
  specifiers: string[];
}

export interface FileSummary {
  path: string;
  mtimeMs: number;
  imports: ImportSummary[];
  exports: string[];
  topLevelNames: string[];
  hasDefaultExport: boolean;
  isModule: boolean;  // has ESM import/export syntax
}

/**
 * Extract lightweight file summary. NO recursive AST walking.
 * Only iterates: module.staticImports, module.staticExports, program.body (top-level only).
 */
export function extractFileSummary(filePath: string, sourceText: string): FileSummary {
  const result = parseSync(filePath, sourceText);
  const mod = result.module;

  // Imports — directly from oxc module metadata (no AST walk)
  const imports: ImportSummary[] = [];
  for (const si of mod.staticImports) {
    imports.push({
      source: si.moduleRequest.value,
      specifiers: si.entries.map((e: any) =>
        e.importName.kind === 'Default' ? 'default' :
        e.importName.kind === 'NamespaceObject' ? '*' :
        e.importName.name ?? 'default'
      ),
    });
  }

  // Exports — directly from oxc module metadata (no AST walk)
  const exports: string[] = [];
  let hasDefaultExport = false;
  for (const se of mod.staticExports) {
    for (const entry of se.entries) {
      if (entry.exportName.kind === 'Default') {
        exports.push('default');
        hasDefaultExport = true;
      } else if (entry.exportName.name) {
        exports.push(entry.exportName.name);
      }

      // Re-exports create import dependencies too
      if (entry.moduleRequest) {
        const source = entry.moduleRequest.value;
        if (!imports.some((i) => i.source === source)) {
          const spec = entry.importName.kind === 'Name' ? entry.importName.name : '*';
          imports.push({ source, specifiers: [spec ?? '*'] });
        }
      }
    }
  }

  // Top-level names — iterate ONLY program.body (NOT recursive)
  const topLevelNames = extractTopLevelNames(result.program);

  // CJS: scan top-level for require() and module.exports (shallow only)
  extractCjsTopLevel(result.program, imports, exports, topLevelNames);

  const isModule = mod.staticImports.length > 0 || mod.staticExports.length > 0;

  return {
    path: filePath,
    mtimeMs: 0, // filled by caller
    imports,
    exports,
    topLevelNames,
    hasDefaultExport,
    isModule,
  };
}

/**
 * Extract top-level declaration names. O(n) where n = top-level statements.
 * NOT recursive — does not enter function/class bodies.
 */
function extractTopLevelNames(program: any): string[] {
  const names: string[] = [];
  if (!program.body) return names;

  for (const stmt of program.body) {
    switch (stmt.type) {
      case 'FunctionDeclaration':
        if (stmt.id?.name) names.push(stmt.id.name);
        break;
      case 'ClassDeclaration':
        if (stmt.id?.name) names.push(stmt.id.name);
        break;
      case 'TSInterfaceDeclaration':
        if (stmt.id?.name) names.push(stmt.id.name);
        break;
      case 'TSTypeAliasDeclaration':
        if (stmt.id?.name) names.push(stmt.id.name);
        break;
      case 'TSEnumDeclaration':
        if (stmt.id?.name) names.push(stmt.id.name);
        break;
      case 'VariableDeclaration':
        for (const decl of stmt.declarations ?? []) {
          if (decl.id?.name) names.push(decl.id.name);
        }
        break;
      case 'ExportNamedDeclaration':
        if (stmt.declaration) {
          if (stmt.declaration.id?.name) names.push(stmt.declaration.id.name);
          if (stmt.declaration.declarations) {
            for (const decl of stmt.declaration.declarations) {
              if (decl.id?.name) names.push(decl.id.name);
            }
          }
        }
        break;
      case 'ExportDefaultDeclaration':
        if (stmt.declaration?.id?.name) names.push(stmt.declaration.id.name);
        break;
    }
  }

  return names;
}

/**
 * Shallow CJS extraction — only top-level require() and module.exports.
 * NOT recursive. Only scans program.body direct children.
 */
function extractCjsTopLevel(
  program: any,
  imports: ImportSummary[],
  exports: string[],
  topLevelNames: string[],
): void {
  if (!program.body) return;

  for (const stmt of program.body) {
    // var X = require('Y')
    if (stmt.type === 'VariableDeclaration') {
      for (const decl of stmt.declarations ?? []) {
        const init = decl.init;
        if (init?.type === 'CallExpression' && init.callee?.name === 'require') {
          const arg = init.arguments?.[0];
          if (arg && (arg.type === 'StringLiteral' || arg.type === 'Literal') && typeof arg.value === 'string') {
            if (!imports.some((i) => i.source === arg.value)) {
              imports.push({ source: arg.value, specifiers: ['default'] });
            }
          }
        }
      }
    }

    // module.exports = X or exports.name = X
    if (stmt.type === 'ExpressionStatement' && stmt.expression?.type === 'AssignmentExpression') {
      const left = stmt.expression.left;
      if (left?.type === 'MemberExpression') {
        if (left.object?.name === 'module' && left.property?.name === 'exports') {
          if (!exports.includes('default')) exports.push('default');
        } else if (left.object?.name === 'exports' && left.property?.name) {
          if (!exports.includes(left.property.name)) exports.push(left.property.name);
        }
      }
    }
  }
}
