import { Project, Node, SyntaxKind } from 'ts-morph';
import type { ChangeSet, FileChange } from '../../core/change-set.js';
import { createChangeSet } from '../../core/change-set.js';
import type { Logger } from '../../core/logger.js';

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
    return createChangeSet('Safe delete (no changes)', []);
  }

  // Find the declaration by name in the AST
  const decl =
    sourceFile.getFunction(symbolName) ??
    sourceFile.getClass(symbolName) ??
    sourceFile.getInterface(symbolName) ??
    sourceFile.getTypeAlias(symbolName) ??
    sourceFile.getEnum(symbolName) ??
    sourceFile.getVariableDeclaration(symbolName);

  if (!decl) {
    logger.warn('safe-delete', 'symbol not found', { symbolName, filePath });
    return createChangeSet('Safe delete (symbol not found)', []);
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
    return createChangeSet('Safe delete (has references)', []);
  }

  logger.info('safe-delete', 'deleting unreferenced symbol', { symbolName });

  const original = sourceFile.getFullText();

  // Remove the declaration via ts-morph
  if (Node.isVariableDeclaration(decl)) {
    const stmt = decl.getVariableStatement();
    if (stmt && stmt.getDeclarations().length === 1) {
      stmt.remove();
    } else {
      decl.remove();
    }
  } else {
    (decl as Node).asKindOrThrow(decl.getKind()).remove();
  }

  const modified = sourceFile.getFullText();

  const files: FileChange[] = [];
  if (original !== modified) {
    files.push({ path: filePath, original, modified });
  }

  logger.info('safe-delete', 'deletion complete', { symbolName, filesChanged: files.length });

  return createChangeSet(`Safe delete '${symbolName}'`, files);
}
