import { Project, Node, SyntaxKind, VariableDeclarationKind, type SourceFile } from 'ts-morph';
import type { ChangeSet, FileChange } from '../../core/change-set.js';
import { createChangeSet } from '../../core/change-set.js';
import type { Logger } from '../../core/logger.js';

export interface ExtractVariableArgs {
  filePath: string;
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
  variableName: string;
  kind: 'const' | 'let';
  logger: Logger;
}

export function extractVariable(project: Project, args: ExtractVariableArgs): ChangeSet {
  const { filePath, startLine, startCol, endLine, endCol, variableName, kind, logger } = args;

  const sourceFile = project.getSourceFile(filePath);
  if (!sourceFile) {
    logger.warn('extract-variable', 'source file not found', { filePath });
    return createChangeSet('Extract variable (no changes)', []);
  }

  const original = sourceFile.getFullText();

  // Convert line:col to positions
  let startPos: number;
  let endPos: number;
  try {
    startPos = sourceFile.compilerNode.getPositionOfLineAndCharacter(startLine - 1, startCol - 1);
    endPos = sourceFile.compilerNode.getPositionOfLineAndCharacter(endLine - 1, endCol - 1);
  } catch {
    logger.warn('extract-variable', 'invalid position', { startLine, startCol, endLine, endCol });
    return createChangeSet('Extract variable (invalid range)', []);
  }

  const expressionText = original.slice(startPos, endPos);

  logger.info('extract-variable', 'extracting expression', {
    filePath, variableName, kind,
    expressionText: expressionText.slice(0, 50),
  });

  // Find the smallest expression node that covers the selection
  const nodeAtStart = sourceFile.getDescendantAtPos(startPos);
  if (!nodeAtStart) {
    logger.warn('extract-variable', 'no node at position', { startPos });
    return createChangeSet('Extract variable (no node)', []);
  }

  // Walk up to find the containing statement
  let containingStatement: Node | undefined = nodeAtStart;
  while (containingStatement && !Node.isStatement(containingStatement)) {
    containingStatement = containingStatement.getParent();
  }
  if (!containingStatement) {
    logger.warn('extract-variable', 'no containing statement', { filePath });
    return createChangeSet('Extract variable (no statement)', []);
  }

  const declKind = kind === 'const' ? VariableDeclarationKind.Const : VariableDeclarationKind.Let;

  // Find the index of the containing statement within its parent's statements
  const stmtParent = containingStatement.getParent();
  if (!stmtParent) {
    return createChangeSet('Extract variable (no parent)', []);
  }

  // Use text slicing to build the modified content.
  // We insert a new variable declaration on its own line before the containing statement,
  // and replace the expression within the statement with the variable name.
  const stmtStart = containingStatement.getStart();    // non-trivia start (first real char)
  const stmtEnd = containingStatement.getEnd();

  // Derive indentation from the statement's position on its line
  let lineStart = stmtStart;
  while (lineStart > 0 && original[lineStart - 1] !== '\n') lineStart--;
  const indentation = original.slice(lineStart, stmtStart).match(/^([ \t]*)/)?.[1] ?? '';

  // Build the new variable declaration line
  const varLine = `${indentation}${kind} ${variableName} = ${expressionText};\n`;

  // Replace expression in the original statement text with variable name
  const stmtContent = original.slice(stmtStart, stmtEnd);
  const exprOffsetInStmt = startPos - stmtStart;
  const exprEndInStmt = endPos - stmtStart;
  const modifiedStmt = stmtContent.slice(0, exprOffsetInStmt) + variableName + stmtContent.slice(exprEndInStmt);

  // Assemble: before stmt line + var declaration + modified statement + after
  const beforeLine = original.slice(0, lineStart);
  const afterStmt = original.slice(stmtEnd);

  const modified = beforeLine + varLine + indentation + modifiedStmt + afterStmt;

  const files: FileChange[] = [];
  if (original !== modified) {
    files.push({ path: filePath, original, modified });
  }

  logger.info('extract-variable', 'extraction complete', {
    variableName, filesChanged: files.length,
  });

  return createChangeSet(`Extract variable '${variableName}'`, files);
}
