import fs from 'node:fs';
import path from 'node:path';
import { parseSync } from 'oxc-parser';
import type { Logger } from '../core/logger.js';
import { discoverFiles } from '../indexing/file-index.js';
import { detectProject } from './project-detector.js';
import { buildProjectIndex, type ProjectIndex } from '../scanner/index-store.js';
import type { FileSummary } from '../scanner/file-summary.js';

export interface ImportEdge {
  source: string;        // module specifier as written
  resolved: string;      // absolute path (empty if external)
  specifiers: string[];
  isExternal: boolean;
}

export interface ModuleNode {
  filePath: string;
  exports: string[];
  internalImports: ImportEdge[];
  externalImports: ImportEdge[];
  importedBy: string[];  // files that import this module
}

export interface GraphStats {
  moduleCount: number;
  externalDependencyCount: number;
  internalEdgeCount: number;
}

export interface DependencyGraph {
  modules: Map<string, ModuleNode>;
  /** Files with no importers (likely entry points) */
  entryPoints: string[];
  /** Files with no imports (leaf modules) */
  leaves: string[];
  stats: GraphStats;
}

/**
 * Fast dependency analysis using Level 1 file summaries.
 * Only reads imports/exports from the pre-built index — no AST walking.
 */
export function analyzeDependenciesFast(rootDir: string, logger: Logger): DependencyGraph {
  logger.info('dependency-analyzer', 'fast analysis from index', { rootDir });
  const startMs = performance.now();

  const projectInfo = detectProject(rootDir, logger);
  const pathAliases = projectInfo.pathAliases ?? {};
  const index = buildProjectIndex(rootDir, logger);

  const modules = new Map<string, ModuleNode>();

  for (const [filePath, summary] of index.summaries) {
    const fileDir = path.dirname(filePath);
    const internalImports: ImportEdge[] = [];
    const externalImports: ImportEdge[] = [];

    for (const imp of summary.imports) {
      const resolved = resolveModulePath(imp.source, fileDir, rootDir, pathAliases);
      const isExternal = resolved === '';
      const edge: ImportEdge = { source: imp.source, resolved, specifiers: imp.specifiers, isExternal };
      if (isExternal) externalImports.push(edge);
      else internalImports.push(edge);
    }

    modules.set(filePath, {
      filePath,
      exports: summary.exports,
      internalImports,
      externalImports,
      importedBy: [],
    });
  }

  // Build reverse edges
  for (const [filePath, mod] of modules) {
    for (const imp of mod.internalImports) {
      const target = modules.get(imp.resolved);
      if (target && !target.importedBy.includes(filePath)) {
        target.importedBy.push(filePath);
      }
    }
  }

  const entryPoints = [...modules.entries()].filter(([, m]) => m.importedBy.length === 0).map(([p]) => p);
  const leaves = [...modules.entries()].filter(([, m]) => m.internalImports.length === 0).map(([p]) => p);

  const externalDeps = new Set<string>();
  let internalEdgeCount = 0;
  for (const mod of modules.values()) {
    internalEdgeCount += mod.internalImports.length;
    for (const ext of mod.externalImports) externalDeps.add(ext.source);
  }

  const durationMs = Math.round(performance.now() - startMs);
  logger.info('dependency-analyzer', 'fast analysis complete', {
    moduleCount: modules.size, internalEdgeCount, externalDeps: externalDeps.size, durationMs,
  });

  return {
    modules, entryPoints, leaves,
    stats: { moduleCount: modules.size, externalDependencyCount: externalDeps.size, internalEdgeCount },
  };
}

/** Main entry point — uses Level 1 fast index */
export function analyzeDependencies(rootDir: string, logger: Logger): DependencyGraph {
  return analyzeDependenciesFast(rootDir, logger);
}

/** Legacy full analysis — only used when Level 1 misses nested requires */
function _analyzeDependenciesLegacy(rootDir: string, logger: Logger): DependencyGraph {
  logger.info('dependency-analyzer', 'starting analysis', { rootDir });

  const startMs = performance.now();

  // Detect project for path alias resolution
  const projectInfo = detectProject(rootDir, logger);
  const pathAliases = projectInfo.pathAliases ?? {};

  // Discover files
  const files = discoverFiles(rootDir, logger);
  const modules = new Map<string, ModuleNode>();

  // Parse each file with oxc and extract import/export info
  for (const filePath of files) {
    const sourceText = fs.readFileSync(filePath, 'utf-8');
    const node = parseFileImportsExports(filePath, sourceText, rootDir, pathAliases, logger);
    modules.set(filePath, node);
  }

  // Build reverse edges (importedBy)
  for (const [filePath, mod] of modules) {
    for (const imp of mod.internalImports) {
      const target = modules.get(imp.resolved);
      if (target && !target.importedBy.includes(filePath)) {
        target.importedBy.push(filePath);
      }
    }
  }

  // Compute entry points and leaves
  const entryPoints: string[] = [];
  const leaves: string[] = [];

  for (const [filePath, mod] of modules) {
    if (mod.importedBy.length === 0) entryPoints.push(filePath);
    if (mod.internalImports.length === 0) leaves.push(filePath);
  }

  // Compute stats
  const externalDeps = new Set<string>();
  let internalEdgeCount = 0;
  for (const mod of modules.values()) {
    internalEdgeCount += mod.internalImports.length;
    for (const ext of mod.externalImports) {
      externalDeps.add(ext.source);
    }
  }

  const stats: GraphStats = {
    moduleCount: modules.size,
    externalDependencyCount: externalDeps.size,
    internalEdgeCount,
  };

  const durationMs = Math.round(performance.now() - startMs);
  logger.info('dependency-analyzer', 'analysis complete', {
    ...stats,
    entryPointCount: entryPoints.length,
    leafCount: leaves.length,
    durationMs,
  });

  return { modules, entryPoints, leaves, stats };
}

function parseFileImportsExports(
  filePath: string,
  sourceText: string,
  rootDir: string,
  pathAliases: Record<string, string[]>,
  logger: Logger,
): ModuleNode {
  let result;
  try {
    result = parseSync(filePath, sourceText);
  } catch (e) {
    logger.warn('dependency-analyzer', 'parse failed', { filePath, error: String(e) });
    return {
      filePath,
      exports: [],
      internalImports: [],
      externalImports: [],
      importedBy: [],
    };
  }

  const mod = result.module;
  const fileDir = path.dirname(filePath);

  const internalImports: ImportEdge[] = [];
  const externalImports: ImportEdge[] = [];
  const exports: string[] = [];

  // Extract ESM imports
  for (const staticImport of mod.staticImports) {
    const source = staticImport.moduleRequest.value;
    const specifiers: string[] = [];

    for (const entry of staticImport.entries) {
      if (entry.importName.kind === 'Default') specifiers.push('default');
      else if (entry.importName.kind === 'NamespaceObject') specifiers.push('*');
      else if (entry.importName.kind === 'Name') specifiers.push(entry.importName.name!);
    }

    const resolved = resolveModulePath(source, fileDir, rootDir, pathAliases);
    const isExternal = resolved === '';

    const edge: ImportEdge = { source, resolved, specifiers, isExternal };
    if (isExternal) {
      externalImports.push(edge);
    } else {
      internalImports.push(edge);
    }
  }

  // Extract CJS require() calls from AST
  walkCjsRequires(result.program, (source: string) => {
    // Skip if already captured via staticImports
    if (internalImports.some((e) => e.source === source) || externalImports.some((e) => e.source === source)) return;

    const resolved = resolveModulePath(source, fileDir, rootDir, pathAliases);
    const isExternal = resolved === '';
    const edge: ImportEdge = { source, resolved, specifiers: ['default'], isExternal };
    if (isExternal) {
      externalImports.push(edge);
    } else {
      internalImports.push(edge);
    }
  });

  // Extract exports (including re-exports)
  for (const staticExport of mod.staticExports) {
    for (const entry of staticExport.entries) {
      if (entry.exportName.kind === 'Default') {
        exports.push('default');
      } else if (entry.exportName.kind === 'Name' && entry.exportName.name) {
        exports.push(entry.exportName.name);
      }

      // If it's a re-export, also add an import edge
      if (entry.moduleRequest) {
        const source = entry.moduleRequest.value;
        const resolved = resolveModulePath(source, fileDir, rootDir, pathAliases);
        const specifier = entry.importName.kind === 'Name' ? entry.importName.name! : '*';
        const isExternal = resolved === '';

        const edge: ImportEdge = { source, resolved, specifiers: [specifier], isExternal };
        if (isExternal) {
          externalImports.push(edge);
        } else {
          internalImports.push(edge);
        }
      }
    }
  }

  return { filePath, exports, internalImports, externalImports, importedBy: [] };
}

const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

function resolveModulePath(
  specifier: string,
  fromDir: string,
  rootDir: string,
  pathAliases: Record<string, string[]>,
): string {
  // Try path alias resolution first
  for (const [pattern, targets] of Object.entries(pathAliases)) {
    const prefix = pattern.replace(/\*$/, '');
    if (specifier.startsWith(prefix)) {
      const remainder = specifier.slice(prefix.length);
      for (const target of targets) {
        const targetPrefix = target.replace(/\*$/, '');
        const resolved = path.join(rootDir, targetPrefix, remainder);
        const found = tryResolveFile(resolved);
        if (found) return found;
      }
    }
  }

  // Relative import
  if (specifier.startsWith('.')) {
    const resolved = path.resolve(fromDir, specifier);
    return tryResolveFile(resolved) ?? '';
  }

  // Bare specifier = external package
  return '';
}

/** Extension mapping: .js imports may resolve to .ts files (ESM convention) */
const EXTENSION_MAP: Record<string, string[]> = {
  '.js': ['.ts', '.tsx', '.js', '.jsx'],
  '.mjs': ['.mts', '.mjs'],
  '.cjs': ['.cts', '.cjs'],
  '.jsx': ['.tsx', '.jsx'],
};

function tryResolveFile(basePath: string): string | undefined {
  // Direct match
  if (fs.existsSync(basePath) && fs.statSync(basePath).isFile()) return basePath;

  // If the path has an extension, try swapping it (e.g., .js → .ts)
  const ext = path.extname(basePath);
  if (ext && EXTENSION_MAP[ext]) {
    const withoutExt = basePath.slice(0, -ext.length);
    for (const tryExt of EXTENSION_MAP[ext]) {
      const candidate = withoutExt + tryExt;
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
    }
  }

  // Try appending extensions (for extensionless imports)
  for (const tryExt of EXTENSIONS) {
    const withExt = basePath + tryExt;
    if (fs.existsSync(withExt)) return withExt;
  }

  // Try index files
  for (const tryExt of EXTENSIONS) {
    const indexPath = path.join(basePath, `index${tryExt}`);
    if (fs.existsSync(indexPath)) return indexPath;
  }

  // Try stripping extension and resolving as directory with index
  if (ext) {
    const withoutExt = basePath.slice(0, -ext.length);
    for (const tryExt of EXTENSIONS) {
      const indexPath = path.join(withoutExt, `index${tryExt}`);
      if (fs.existsSync(indexPath)) return indexPath;
    }
  }

  return undefined;
}

/** Walk AST to find CJS require() calls and invoke callback with each source string */
function walkCjsRequires(node: any, onRequire: (source: string) => void): void {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'CallExpression' && node.callee?.type === 'Identifier' && node.callee.name === 'require') {
    const args = node.arguments;
    if (args?.length === 1 && (args[0].type === 'StringLiteral' || args[0].type === 'Literal') && typeof args[0].value === 'string') {
      onRequire(args[0].value);
    }
  }
  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'start' || key === 'end') continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child) walkCjsRequires(item, onRequire);
    } else if (child && typeof child === 'object' && child.type) {
      walkCjsRequires(child, onRequire);
    }
  }
}
