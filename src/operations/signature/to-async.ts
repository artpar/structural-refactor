import { Project, Node } from 'ts-morph';
import type { ChangeSet, FileChange } from '../../core/change-set.js';
import { createChangeSet } from '../../core/change-set.js';
import type { Logger } from '../../core/logger.js';

export interface ToAsyncArgs {
  filePath: string;
  line: number;
  col: number;
  logger: Logger;
}

export function toAsync(project: Project, args: ToAsyncArgs): ChangeSet {
  const { filePath, line, col, logger } = args;

  const sourceFile = project.getSourceFile(filePath);
  if (!sourceFile) {
    logger.warn('to-async', 'source file not found', { filePath });
    return createChangeSet('To async (no changes)', []);
  }

  const original = sourceFile.getFullText();

  const pos = sourceFile.compilerNode.getPositionOfLineAndCharacter(line - 1, col - 1);
  const node = sourceFile.getDescendantAtPos(pos);

  if (!node || !Node.isIdentifier(node)) {
    logger.warn('to-async', 'no identifier at position', { filePath, line, col });
    return createChangeSet('To async (no identifier)', []);
  }

  const fnName = node.getText();
  const fnDecl = sourceFile.getFunction(fnName);

  if (!fnDecl) {
    logger.warn('to-async', 'not a function declaration', { fnName });
    return createChangeSet('To async (not a function)', []);
  }

  if (fnDecl.isAsync()) {
    logger.info('to-async', 'function is already async', { fnName });
    return createChangeSet('To async (already async)', []);
  }

  logger.info('to-async', 'converting to async', { fnName, filePath });

  // Set async
  fnDecl.setIsAsync(true);

  // Wrap return type in Promise<> if it has an explicit return type
  const returnTypeNode = fnDecl.getReturnTypeNode();
  if (returnTypeNode) {
    const currentType = returnTypeNode.getText();
    if (!currentType.startsWith('Promise<')) {
      fnDecl.setReturnType(`Promise<${currentType}>`);
    }
  }

  const modified = sourceFile.getFullText();

  const files: FileChange[] = [];
  if (original !== modified) {
    files.push({ path: filePath, original, modified });
  }

  logger.info('to-async', 'conversion complete', { fnName, filesChanged: files.length });

  return createChangeSet(`Convert '${fnName}' to async`, files);
}
