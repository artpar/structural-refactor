import { Project, Node, SyntaxKind } from 'ts-morph';
import path from 'node:path';
import type { ChangeSet, FileChange } from '../../core/change-set.js';
import { createChangeSet } from '../../core/change-set.js';
import { addImport, removeImport, updateImportPath } from '../../utils/import-manager.js';
import type { Logger } from '../../core/logger.js';

export interface MoveSymbolArgs {
  symbolName: string;
  fromFile: string;
  toFile: string;
  logger: Logger;
}

function relativeSpecifier(from: string, to: string): string {
  const fromDir = path.dirname(from);
  let rel = path.relative(fromDir, to).replace(/\.(ts|tsx|js|jsx|mjs|cjs)$/, '');
  if (!rel.startsWith('.')) rel = './' + rel;
  return rel;
}

export function moveSymbol(project: Project, args: MoveSymbolArgs): ChangeSet {
  const { symbolName, fromFile, toFile, logger } = args;

  logger.info('move-symbol', 'starting move', { symbolName, fromFile, toFile });

  const sourceSf = project.getSourceFile(fromFile);
  const targetSf = project.getSourceFile(toFile);

  if (!sourceSf || !targetSf) {
    logger.warn('move-symbol', 'source or target file not found', { fromFile, toFile });
    return createChangeSet('Move (file not found)', []);
  }

  // Capture originals
  const originalContents = new Map<string, string>();
  for (const sf of project.getSourceFiles()) {
    originalContents.set(sf.getFilePath(), sf.getFullText());
  }

  const startMs = performance.now();

  // Find the exported declaration by name in source file AST
  const exportedDecl = findExportedDeclaration(sourceSf, symbolName);
  if (!exportedDecl) {
    logger.warn('move-symbol', 'symbol not found in source', { symbolName, fromFile });
    return createChangeSet('Move (symbol not found)', []);
  }

  // Get the full text of the declaration to move
  const declText = exportedDecl.getFullText();

  // Add the declaration to the target file
  targetSf.addStatements(declText);

  // Remove from source
  exportedDecl.remove();

  // Update imports in all files that imported this symbol from the source
  const oldSpecifierFromSource = (importerPath: string) => relativeSpecifier(importerPath, fromFile);
  const newSpecifierToTarget = (importerPath: string) => relativeSpecifier(importerPath, toFile);

  for (const sf of project.getSourceFiles()) {
    const sfPath = sf.getFilePath();
    if (sfPath === fromFile || sfPath === toFile) continue;

    const importDecls = sf.getImportDeclarations();
    for (const decl of importDecls) {
      if (decl.getModuleSpecifierValue() === oldSpecifierFromSource(sfPath)) {
        const namedImport = decl.getNamedImports().find((n) => n.getName() === symbolName);
        if (namedImport) {
          // Remove this specifier from the old import
          namedImport.remove();

          // If no imports left, remove the declaration
          if (decl.getNamedImports().length === 0 && !decl.getDefaultImport() && !decl.getNamespaceImport()) {
            decl.remove();
          }

          // Add import from the new target
          addImport(sf, { moduleSpecifier: newSpecifierToTarget(sfPath), namedImports: [symbolName] });
        }
      }
    }
  }

  // Collect changes
  const files: FileChange[] = [];
  for (const sf of project.getSourceFiles()) {
    const sfPath = sf.getFilePath();
    const original = originalContents.get(sfPath) ?? '';
    const modified = sf.getFullText();
    if (original !== modified) {
      files.push({ path: sfPath, original, modified });
    }
  }

  const durationMs = Math.round(performance.now() - startMs);

  logger.info('move-symbol', 'move complete', {
    symbolName,
    fromFile,
    toFile,
    filesChanged: files.length,
    durationMs,
  });

  return createChangeSet(`Move '${symbolName}' from '${fromFile}' to '${toFile}'`, files);
}

function findExportedDeclaration(sourceFile: ReturnType<Project['getSourceFileOrThrow']>, name: string): Node | undefined {
  // Check function declarations
  const fn = sourceFile.getFunction(name);
  if (fn?.isExported()) return fn;

  // Check variable declarations — need to return the full variable statement
  for (const stmt of sourceFile.getVariableStatements()) {
    if (!stmt.isExported()) continue;
    for (const decl of stmt.getDeclarations()) {
      if (decl.getName() === name) {
        // If statement has only this one declaration, return the whole statement
        if (stmt.getDeclarations().length === 1) {
          return stmt;
        }
        // Otherwise just the declaration (more complex case — punt for now)
        return stmt;
      }
    }
  }

  // Check class declarations
  const cls = sourceFile.getClass(name);
  if (cls?.isExported()) return cls;

  // Check interface declarations
  const iface = sourceFile.getInterface(name);
  if (iface?.isExported()) return iface;

  // Check type aliases
  const typeAlias = sourceFile.getTypeAlias(name);
  if (typeAlias?.isExported()) return typeAlias;

  // Check enum declarations
  const enumDecl = sourceFile.getEnum(name);
  if (enumDecl?.isExported()) return enumDecl;

  return undefined;
}
