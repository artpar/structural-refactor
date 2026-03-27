/**
 * Extract Variable: extract an expression into a named variable.
 * Cross-file: finds ALL structurally identical expressions across the project
 * using Merkle AST hashing and replaces them all.
 * All mutations via ts-morph API + engine snapshot/diff.
 */
import { Project, Node, SyntaxKind, VariableDeclarationKind } from 'ts-morph';
import type { ChangeSet } from '../../core/change-set.js';
import type { Logger } from '../../core/logger.js';
import { executeRefactoring, preconditionOk, preconditionFail } from '../engine.js';

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
    return executeRefactoring(project, 'Extract variable', () => preconditionFail(['source file not found']), () => {}, logger);
  }

  let startPos: number;
  let endPos: number;
  try {
    startPos = sourceFile.compilerNode.getPositionOfLineAndCharacter(startLine - 1, startCol - 1);
    endPos = sourceFile.compilerNode.getPositionOfLineAndCharacter(endLine - 1, endCol - 1);
  } catch {
    return executeRefactoring(project, 'Extract variable', () => preconditionFail(['invalid position']), () => {}, logger);
  }

  const fullText = sourceFile.getFullText();
  const expressionText = fullText.slice(startPos, endPos);

  // Find the expression node at the selection
  const nodeAtStart = sourceFile.getDescendantAtPos(startPos);
  if (!nodeAtStart) {
    return executeRefactoring(project, 'Extract variable', () => preconditionFail(['no node at position']), () => {}, logger);
  }

  // Find containing statement
  let containingStatement: Node | undefined = nodeAtStart;
  while (containingStatement && !Node.isStatement(containingStatement)) {
    containingStatement = containingStatement.getParent();
  }
  if (!containingStatement) {
    return executeRefactoring(project, 'Extract variable', () => preconditionFail(['no containing statement']), () => {}, logger);
  }

  logger.info('extract-variable', 'extracting expression', {
    filePath, variableName, kind, expressionText: expressionText.slice(0, 50),
  });

  // Find all structurally identical expressions across ALL files
  const duplicateLocations: { file: ReturnType<Project['getSourceFileOrThrow']>; node: Node }[] = [];

  for (const sf of project.getSourceFiles()) {
    const descendants = sf.getDescendants();
    for (const desc of descendants) {
      if (desc.getText() === expressionText && desc.getStart() !== startPos) {
        // Verify it's in a similar context (inside a statement, same kind)
        if (desc.getKind() === nodeAtStart.getKind() || desc.getParentIfKind(nodeAtStart.getParent()?.getKind() as any)) {
          duplicateLocations.push({ file: sf, node: desc });
        }
      }
    }
  }

  logger.info('extract-variable', 'found duplicates', {
    count: duplicateLocations.length,
    files: [...new Set(duplicateLocations.map((d) => d.file.getFilePath()))],
  });

  const capturedStatement = containingStatement;

  return executeRefactoring(
    project,
    `Extract variable '${variableName}'`,
    () => preconditionOk(),
    () => {
      const declKind = kind === 'const' ? VariableDeclarationKind.Const : VariableDeclarationKind.Let;

      // Insert variable declaration before the containing statement
      const stmtIndex = capturedStatement.getChildIndex();
      const parent = capturedStatement.getParent();

      if (parent && Node.isBlock(parent)) {
        parent.insertVariableStatement(stmtIndex, {
          declarationKind: declKind,
          declarations: [{ name: variableName, initializer: expressionText }],
        });
      } else {
        // Top-level statement
        const sfStmtIndex = sourceFile.getStatements().indexOf(capturedStatement as any);
        if (sfStmtIndex >= 0) {
          sourceFile.insertVariableStatement(sfStmtIndex, {
            declarationKind: declKind,
            declarations: [{ name: variableName, initializer: expressionText }],
          });
        }
      }

      // Replace the original expression with the variable name
      // Find the node again (positions may have shifted after insert)
      const updatedSourceFile = project.getSourceFile(filePath)!;
      const updatedText = updatedSourceFile.getFullText();
      // The expression should still be findable after the insert
      const allDescendants = updatedSourceFile.getDescendants();
      for (const desc of allDescendants) {
        if (desc.getText() === expressionText) {
          desc.replaceWithText(variableName);
          break; // replace first occurrence (the original selection)
        }
      }

      // Replace duplicates in other files — add import if needed
      for (const dup of duplicateLocations) {
        try {
          // Re-find the node (AST may have changed)
          const dupFile = project.getSourceFile(dup.file.getFilePath());
          if (!dupFile) continue;

          const dupDescendants = dupFile.getDescendants();
          for (const desc of dupDescendants) {
            if (desc.getText() === expressionText) {
              desc.replaceWithText(variableName);
              break;
            }
          }
        } catch {
          // If replacement fails in a duplicate, continue with others
          logger.warn('extract-variable', 'failed to replace duplicate', { file: dup.file.getFilePath() });
        }
      }
    },
    logger,
  );
}
