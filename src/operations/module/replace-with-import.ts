/**
 * Replace local function/variable with an import from another module.
 * Atomic: deletes the local definition AND adds the import in one ChangeSet.
 * This is the operation needed for deduplication — move duplicate to shared,
 * then replace-with-import in each file that had a local copy.
 */
import { Project, Node, SyntaxKind } from 'ts-morph';
import path from 'node:path';
import type { ChangeSet } from '../../core/change-set.js';
import type { Logger } from '../../core/logger.js';
import { executeRefactoring, preconditionOk, preconditionFail } from '../engine.js';

export interface ReplaceWithImportArgs {
  filePath: string;
  symbolName: string;
  fromModule: string;  // relative import path e.g., './helpers.js'
  logger: Logger;
}

export function replaceWithImport(project: Project, args: ReplaceWithImportArgs): ChangeSet {
  const { filePath, symbolName, fromModule, logger } = args;

  const sourceFile = project.getSourceFile(filePath);
  if (!sourceFile) {
    return executeRefactoring(project, 'Replace with import',
      () => preconditionFail([`source file not found: ${filePath}`]), () => {}, logger);
  }

  // Find the local declaration
  const decl =
    sourceFile.getFunction(symbolName) ??
    sourceFile.getClass(symbolName) ??
    sourceFile.getInterface(symbolName) ??
    sourceFile.getTypeAlias(symbolName) ??
    sourceFile.getEnum(symbolName) ??
    sourceFile.getVariableDeclaration(symbolName);

  if (!decl) {
    return executeRefactoring(project, 'Replace with import',
      () => preconditionFail([`symbol '${symbolName}' not found in ${filePath}`]), () => {}, logger);
  }

  logger.info('replace-with-import', 'replacing local with import', {
    symbolName, filePath, fromModule,
  });

  return executeRefactoring(
    project,
    `Replace local '${symbolName}' with import from '${fromModule}'`,
    () => {
      // Check that the symbol isn't exported (if it is, other files depend on this copy)
      if (Node.isFunctionDeclaration(decl) && decl.isExported()) {
        return preconditionFail([`'${symbolName}' is exported — other files may depend on this copy. Use rename or re-export instead.`]);
      }
      return preconditionOk();
    },
    () => {
      // Delete the local declaration
      if (Node.isFunctionDeclaration(decl)) decl.remove();
      else if (Node.isClassDeclaration(decl)) decl.remove();
      else if (Node.isInterfaceDeclaration(decl)) decl.remove();
      else if (Node.isTypeAliasDeclaration(decl)) decl.remove();
      else if (Node.isEnumDeclaration(decl)) decl.remove();
      else if (Node.isVariableDeclaration(decl)) {
        const stmt = decl.getVariableStatement();
        if (stmt && stmt.getDeclarations().length === 1) stmt.remove();
        else decl.remove();
      }

      // Add import from the target module
      const existingImport = sourceFile.getImportDeclaration(fromModule);
      if (existingImport) {
        // Merge into existing import
        const alreadyHas = existingImport.getNamedImports().some((n) => n.getName() === symbolName);
        if (!alreadyHas) {
          existingImport.addNamedImport(symbolName);
        }
      } else {
        sourceFile.addImportDeclaration({
          moduleSpecifier: fromModule,
          namedImports: [symbolName],
        });
      }
    },
    logger,
  );
}
