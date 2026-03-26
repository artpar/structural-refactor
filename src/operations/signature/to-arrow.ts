import { Project, Node, SyntaxKind } from 'ts-morph';
import type { ChangeSet, FileChange } from '../../core/change-set.js';
import { createChangeSet } from '../../core/change-set.js';
import type { Logger } from '../../core/logger.js';

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
    return createChangeSet('To arrow (no changes)', []);
  }

  const original = sourceFile.getFullText();

  const pos = sourceFile.compilerNode.getPositionOfLineAndCharacter(line - 1, col - 1);
  const node = sourceFile.getDescendantAtPos(pos);

  if (!node || !Node.isIdentifier(node)) {
    logger.warn('to-arrow', 'no identifier at position', { filePath, line, col });
    return createChangeSet('To arrow (no identifier)', []);
  }

  const fnName = node.getText();
  const fnDecl = sourceFile.getFunction(fnName);

  if (!fnDecl) {
    logger.warn('to-arrow', 'not a function declaration', { fnName });
    return createChangeSet('To arrow (not a function)', []);
  }

  logger.info('to-arrow', 'converting to arrow function', { fnName, filePath });

  // Build arrow function text from the AST
  const params = fnDecl.getParameters().map((p) => p.getText()).join(', ');
  const returnType = fnDecl.getReturnTypeNode()?.getText();
  const returnTypeAnnotation = returnType ? `: ${returnType}` : '';
  const isExported = fnDecl.isExported();
  const isAsync = fnDecl.isAsync();

  // Get the body
  const body = fnDecl.getBody();
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

  // Replace the function declaration
  const fnStart = fnDecl.getStart();
  const fnEnd = fnDecl.getEnd();

  const modified = original.slice(0, fnStart) + arrow + original.slice(fnEnd);

  const files: FileChange[] = [];
  if (original !== modified) {
    files.push({ path: filePath, original, modified });
  }

  logger.info('to-arrow', 'conversion complete', { fnName, filesChanged: files.length });

  return createChangeSet(`Convert '${fnName}' to arrow function`, files);
}
