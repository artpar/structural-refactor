import { Project, Node } from 'ts-morph';
import type { ChangeSet } from '../../core/change-set.js';
import type { Logger } from '../../core/logger.js';
import { executeRefactoring, preconditionOk, preconditionFail } from '../engine.js';

export interface SafeDeleteArgs {
  filePath: string;
  symbolName: string;
  logger: Logger;
}

export function safeDelete(project: Project, args: SafeDeleteArgs): ChangeSet {
  const { filePath, symbolName, logger } = args;

  const sourceFile = project.getSourceFile(filePath);
  if (!sourceFile) {
    logger.warn('safe-delete', 'source file not found', { filePath });
    return executeRefactoring(
      project,
      'Safe delete (no changes)',
      () => preconditionFail(['source file not found']),
      () => {},
      logger,
    );
  }

  // Find the declaration by name in the AST
  const decl =
    sourceFile.getFunction(symbolName) ??
    sourceFile.getClass(symbolName) ??
    sourceFile.getInterface(symbolName) ??
    sourceFile.getTypeAlias(symbolName) ??
    sourceFile.getEnum(symbolName) ??
    sourceFile.getVariableDeclaration(symbolName);

  return executeRefactoring(
    project,
    `Safe delete '${symbolName}'`,
    () => {
      if (!decl) {
        return preconditionFail([`symbol '${symbolName}' not found in ${filePath}`]);
      }

      logger.info('safe-delete', 'checking references', { symbolName, filePath });

      // Check if the symbol has any references (beyond its own declaration)
      const refs = decl.findReferences();
      let refCount = 0;
      for (const refGroup of refs) {
        for (const ref of refGroup.getReferences()) {
          if (!ref.isDefinition()) {
            refCount++;
          }
        }
      }

      if (refCount > 0) {
        logger.info('safe-delete', 'symbol has references, cannot delete', {
          symbolName, referenceCount: refCount,
        });
        return preconditionFail([`symbol '${symbolName}' has ${refCount} references`]);
      }

      return preconditionOk();
    },
    () => {
      logger.info('safe-delete', 'deleting unreferenced symbol', { symbolName });

      // Remove the declaration via ts-morph — dispatch by concrete type
      if (Node.isVariableDeclaration(decl!)) {
        const stmt = decl.getVariableStatement();
        if (stmt && stmt.getDeclarations().length === 1) {
          stmt.remove();
        } else {
          decl.remove();
        }
      } else if (Node.isFunctionDeclaration(decl!)) {
        decl!.remove();
      } else if (Node.isClassDeclaration(decl!)) {
        decl!.remove();
      } else if (Node.isInterfaceDeclaration(decl!)) {
        decl!.remove();
      } else if (Node.isTypeAliasDeclaration(decl!)) {
        decl!.remove();
      } else if (Node.isEnumDeclaration(decl!)) {
        decl!.remove();
      }

      logger.info('safe-delete', 'deletion complete', { symbolName });
    },
    logger,
  );
}
