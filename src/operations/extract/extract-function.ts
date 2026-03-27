/**
 * Extract Function: extract code into a new function.
 * Cross-file: finds ALL structurally identical code blocks across the project
 * and replaces them with calls to the extracted function. Adds exports/imports as needed.
 * All mutations via ts-morph API + engine snapshot/diff.
 */
import { Project, Node, SyntaxKind } from 'ts-morph';
import type { ChangeSet } from '../../core/change-set.js';
import type { Logger } from '../../core/logger.js';
import { executeRefactoring, preconditionOk, preconditionFail } from '../engine.js';

export interface ExtractFunctionArgs {
  filePath: string;
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
  functionName: string;
  logger: Logger;
}

export function extractFunction(project: Project, args: ExtractFunctionArgs): ChangeSet {
  const { filePath, startLine, startCol, endLine, endCol, functionName, logger } = args;

  const sourceFile = project.getSourceFile(filePath);
  if (!sourceFile) {
    return executeRefactoring(project, 'Extract function', () => preconditionFail(['source file not found']), () => {}, logger);
  }

  let startPos: number;
  let endPos: number;
  try {
    startPos = sourceFile.compilerNode.getPositionOfLineAndCharacter(startLine - 1, startCol - 1);
    endPos = sourceFile.compilerNode.getPositionOfLineAndCharacter(endLine - 1, endCol - 1);
  } catch {
    return executeRefactoring(project, 'Extract function', () => preconditionFail(['invalid position']), () => {}, logger);
  }

  const fullText = sourceFile.getFullText();
  const selectedText = fullText.slice(startPos, endPos);

  const nodeAtStart = sourceFile.getDescendantAtPos(startPos);
  if (!nodeAtStart) {
    return executeRefactoring(project, 'Extract function', () => preconditionFail(['no node at position']), () => {}, logger);
  }

  // Find containing statement
  let containingStatement: Node | undefined = nodeAtStart;
  while (containingStatement && !Node.isStatement(containingStatement)) {
    containingStatement = containingStatement.getParent();
  }
  if (!containingStatement) {
    return executeRefactoring(project, 'Extract function', () => preconditionFail(['no containing statement']), () => {}, logger);
  }

  // Find enclosing scope for parameter analysis
  let enclosingScope: Node | undefined = containingStatement.getParent();
  while (enclosingScope && !Node.isSourceFile(enclosingScope) &&
         !Node.isFunctionDeclaration(enclosingScope) && !Node.isMethodDeclaration(enclosingScope) &&
         !Node.isArrowFunction(enclosingScope) && !Node.isFunctionExpression(enclosingScope)) {
    enclosingScope = enclosingScope.getParent();
  }

  const params = analyzeRequiredParams(sourceFile, startPos, endPos, enclosingScope);

  logger.info('extract-function', 'extracting function', {
    filePath, functionName, selectedLength: selectedText.length, params,
  });

  // Find duplicate code blocks across ALL files
  const duplicateLocations: { filePath: string; text: string }[] = [];
  for (const sf of project.getSourceFiles()) {
    if (sf.getFilePath() === filePath) continue;
    if (sf.getFullText().includes(selectedText)) {
      duplicateLocations.push({ filePath: sf.getFilePath(), text: selectedText });
    }
  }

  logger.info('extract-function', 'found duplicates in other files', { count: duplicateLocations.length });

  const hasDuplicates = duplicateLocations.length > 0;
  const capturedStatement = containingStatement;

  return executeRefactoring(
    project,
    `Extract function '${functionName}'`,
    () => preconditionOk(),
    () => {
      const paramList = params.join(', ');
      const argList = params.join(', ');
      const callExpr = `${functionName}(${argList})`;

      // Add the new function at the end of the source file
      // Export it if there are duplicates in other files
      const exportKw = hasDuplicates ? 'export ' : '';
      sourceFile.addFunction({
        name: functionName,
        isExported: hasDuplicates,
        parameters: params.map((p) => ({ name: p })),
        statements: [selectedText],
      });

      // Replace the original selected code with the function call
      // Find the statement again and replace its content
      const origStatements = sourceFile.getStatements();
      for (const stmt of origStatements) {
        if (stmt.getText().includes(selectedText) && stmt !== sourceFile.getFunction(functionName)) {
          stmt.replaceWithText(callExpr + ';');
          break;
        }
      }

      // Replace duplicates in other files
      for (const dup of duplicateLocations) {
        const dupFile = project.getSourceFile(dup.filePath);
        if (!dupFile) continue;

        // Add import for the extracted function
        const relativePath = getRelativeImportPath(dup.filePath, filePath);
        dupFile.addImportDeclaration({
          moduleSpecifier: relativePath,
          namedImports: [functionName],
        });

        // Replace the duplicate code with the function call
        const dupStatements = dupFile.getStatements();
        for (const stmt of dupStatements) {
          if (stmt.getText().includes(selectedText)) {
            stmt.replaceWithText(callExpr + ';');
            break;
          }
        }
      }
    },
    logger,
  );
}

function analyzeRequiredParams(
  sourceFile: ReturnType<Project['getSourceFileOrThrow']>,
  startPos: number,
  endPos: number,
  enclosingScope: Node | undefined,
): string[] {
  if (!enclosingScope) return [];

  const declaredBefore = new Set<string>();

  if (Node.isFunctionDeclaration(enclosingScope) || Node.isMethodDeclaration(enclosingScope) ||
      Node.isArrowFunction(enclosingScope) || Node.isFunctionExpression(enclosingScope)) {
    for (const param of enclosingScope.getParameters()) {
      if (param.getStart() < startPos) declaredBefore.add(param.getName());
    }
  }

  const body = (Node.isFunctionDeclaration(enclosingScope) || Node.isMethodDeclaration(enclosingScope))
    ? enclosingScope.getBody()
    : (Node.isArrowFunction(enclosingScope) || Node.isFunctionExpression(enclosingScope))
      ? enclosingScope.getBody()
      : enclosingScope;

  if (body) {
    for (const decl of body.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
      if (decl.getStart() < startPos) declaredBefore.add(decl.getName());
    }
  }

  const referenced = new Set<string>();
  for (const node of sourceFile.getDescendants()) {
    if (node.getStart() >= startPos && node.getEnd() <= endPos && Node.isIdentifier(node)) {
      if (declaredBefore.has(node.getText())) referenced.add(node.getText());
    }
  }

  return [...referenced].sort();
}

function getRelativeImportPath(fromFile: string, toFile: string): string {
  const path = require('node:path') as typeof import('node:path');
  const fromDir = path.dirname(fromFile);
  let relative = path.relative(fromDir, toFile).replace(/\.(ts|tsx|js|jsx)$/, '');
  if (!relative.startsWith('.')) relative = './' + relative;
  return relative;
}
