import { Project, Node } from 'ts-morph';
import type { ChangeSet } from '../../core/change-set.js';
import type { Logger } from '../../core/logger.js';
import { executeRefactoring, preconditionOk, preconditionFail } from '../engine.js';

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
    return executeRefactoring(
      project,
      'To async (no changes)',
      () => preconditionFail(['source file not found']),
      () => {},
      logger,
    );
  }

  const pos = sourceFile.compilerNode.getPositionOfLineAndCharacter(line - 1, col - 1);
  const node = sourceFile.getDescendantAtPos(pos);

  if (!node || !Node.isIdentifier(node)) {
    logger.warn('to-async', 'no identifier at position', { filePath, line, col });
    return executeRefactoring(
      project,
      'To async (no identifier)',
      () => preconditionFail(['no identifier at position']),
      () => {},
      logger,
    );
  }

  const fnName = node.getText();
  const fnDecl = sourceFile.getFunction(fnName);

  return executeRefactoring(
    project,
    `Convert '${fnName}' to async`,
    () => {
      if (!fnDecl) {
        return preconditionFail([`function '${fnName}' not found`]);
      }
      if (fnDecl.isAsync()) {
        logger.info('to-async', 'function is already async', { fnName });
        return preconditionFail([`function '${fnName}' is already async`]);
      }
      return preconditionOk();
    },
    () => {
      logger.info('to-async', 'converting to async', { fnName, filePath });

      // Set async
      fnDecl!.setIsAsync(true);

      // Wrap return type in Promise<> if it has an explicit return type
      const returnTypeNode = fnDecl!.getReturnTypeNode();
      if (returnTypeNode) {
        const currentType = returnTypeNode.getText();
        if (!currentType.startsWith('Promise<')) {
          fnDecl!.setReturnType(`Promise<${currentType}>`);
        }
      }

      logger.info('to-async', 'conversion complete', { fnName });
    },
    logger,
  );
}
