import { Project, Node, SyntaxKind } from 'ts-morph';
import type { ChangeSet } from '../../core/change-set.js';
import type { Logger } from '../../core/logger.js';
import { executeRefactoring, preconditionOk, preconditionFail } from '../engine.js';

export interface ToArrowArgs {
  filePath: string;
  line: number;
  col: number;
  logger: Logger;
}

export function toArrow(project: Project, args: ToArrowArgs): ChangeSet {
  const { filePath, line, col, logger } = args;

  const sourceFile = project.getSourceFile(filePath);
  if (!sourceFile) {
    logger.warn('to-arrow', 'source file not found', { filePath });
    return executeRefactoring(
      project,
      'To arrow (no changes)',
      () => preconditionFail(['source file not found']),
      () => {},
      logger,
    );
  }

  const pos = sourceFile.compilerNode.getPositionOfLineAndCharacter(line - 1, col - 1);
  const node = sourceFile.getDescendantAtPos(pos);

  if (!node || !Node.isIdentifier(node)) {
    logger.warn('to-arrow', 'no identifier at position', { filePath, line, col });
    return executeRefactoring(
      project,
      'To arrow (no identifier)',
      () => preconditionFail(['no identifier at position']),
      () => {},
      logger,
    );
  }

  const fnName = node.getText();
  const fnDecl = sourceFile.getFunction(fnName);

  return executeRefactoring(
    project,
    `Convert '${fnName}' to arrow function`,
    () => {
      if (!fnDecl) {
        return preconditionFail([`function '${fnName}' not found`]);
      }

      // Check for `this` usage — arrow functions bind `this` lexically
      const body = fnDecl.getBody();
      if (body) {
        const thisKeywords = body.getDescendantsOfKind(SyntaxKind.ThisKeyword);
        if (thisKeywords.length > 0) {
          return preconditionFail([`function '${fnName}' uses 'this' keyword — cannot safely convert to arrow`]);
        }
      }

      return preconditionOk();
    },
    () => {
      logger.info('to-arrow', 'converting to arrow function', { fnName, filePath });

      // Build arrow function text from the AST
      const params = fnDecl!.getParameters().map((p) => p.getText()).join(', ');
      const returnType = fnDecl!.getReturnTypeNode()?.getText();
      const returnTypeAnnotation = returnType ? `: ${returnType}` : '';
      const isExported = fnDecl!.isExported();
      const isAsync = fnDecl!.isAsync();

      // Get the body
      const body = fnDecl!.getBody();
      let bodyText: string;

      if (body && Node.isBlock(body)) {
        const statements = body.getStatements();
        // If single return statement, use concise body
        if (statements.length === 1 && Node.isReturnStatement(statements[0])) {
          const returnExpr = statements[0].getExpression();
          if (returnExpr) {
            bodyText = returnExpr.getText();
          } else {
            bodyText = '{}';
          }
        } else {
          bodyText = body.getText();
        }
      } else {
        bodyText = '{}';
      }

      const asyncPrefix = isAsync ? 'async ' : '';
      const exportPrefix = isExported ? 'export ' : '';

      // Determine if body needs block or can be expression
      const isExpression = !bodyText.startsWith('{');
      const arrowBody = isExpression ? bodyText : ` ${bodyText}`;
      const arrow = `${exportPrefix}const ${fnName} = ${asyncPrefix}(${params})${returnTypeAnnotation} =>${isExpression ? ' ' : ''}${arrowBody};`;

      // Replace the function declaration via ts-morph replaceWithText
      fnDecl!.replaceWithText(arrow);

      logger.info('to-arrow', 'conversion complete', { fnName });
    },
    logger,
  );
}
