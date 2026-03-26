import { Project, Node, SyntaxKind } from 'ts-morph';
import type { ChangeSet, FileChange } from '../../core/change-set.js';
import { createChangeSet } from '../../core/change-set.js';
import type { Logger } from '../../core/logger.js';

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
    logger.warn('extract-function', 'source file not found', { filePath });
    return createChangeSet('Extract function (no changes)', []);
  }

  const original = sourceFile.getFullText();

  let startPos: number;
  let endPos: number;
  try {
    startPos = sourceFile.compilerNode.getPositionOfLineAndCharacter(startLine - 1, startCol - 1);
    endPos = sourceFile.compilerNode.getPositionOfLineAndCharacter(endLine - 1, endCol - 1);
  } catch {
    logger.warn('extract-function', 'invalid position', { startLine, startCol, endLine, endCol });
    return createChangeSet('Extract function (invalid range)', []);
  }

  const selectedText = original.slice(startPos, endPos);

  logger.info('extract-function', 'extracting function', {
    filePath, functionName,
    selectedLength: selectedText.length,
  });

  // Find the containing statement for the selection
  const nodeAtStart = sourceFile.getDescendantAtPos(startPos);
  if (!nodeAtStart) {
    return createChangeSet('Extract function (no node)', []);
  }

  let containingStatement: Node | undefined = nodeAtStart;
  while (containingStatement && !Node.isStatement(containingStatement)) {
    containingStatement = containingStatement.getParent();
  }
  if (!containingStatement) {
    return createChangeSet('Extract function (no statement)', []);
  }

  // Find the enclosing function/method scope (to know what variables are in scope)
  let enclosingScope: Node | undefined = containingStatement.getParent();
  while (enclosingScope && !Node.isSourceFile(enclosingScope) &&
         !Node.isFunctionDeclaration(enclosingScope) &&
         !Node.isMethodDeclaration(enclosingScope) &&
         !Node.isArrowFunction(enclosingScope) &&
         !Node.isFunctionExpression(enclosingScope)) {
    enclosingScope = enclosingScope.getParent();
  }

  // Analyze scope: find identifiers in the selected text that reference variables
  // declared before the selection in the enclosing scope
  const params = analyzeRequiredParams(sourceFile, startPos, endPos, enclosingScope);

  logger.debug('extract-function', 'scope analysis', {
    requiredParams: params,
  });

  // Build the extracted function
  const paramList = params.join(', ');
  const argList = params.join(', ');

  // Determine indentation of the insertion point (top-level or enclosing scope level)
  const insertionIndent = '';  // top-level function

  const extractedFn = `\nfunction ${functionName}(${paramList}) {\n  ${selectedText}\n}\n`;

  // Build the replacement call
  const callExpr = `${functionName}(${argList})`;

  // Build the modified text:
  // 1. Replace selected text with call expression
  // 2. Append the new function at the end of the file
  let modified = original.slice(0, startPos) + callExpr + original.slice(endPos);
  modified = modified + extractedFn;

  const files: FileChange[] = [];
  if (original !== modified) {
    files.push({ path: filePath, original, modified });
  }

  logger.info('extract-function', 'extraction complete', {
    functionName, paramCount: params.length, filesChanged: files.length,
  });

  return createChangeSet(`Extract function '${functionName}'`, files);
}

/**
 * AST-based scope analysis: find identifiers in the selection that are
 * declared in the enclosing scope before the selection.
 */
function analyzeRequiredParams(
  sourceFile: ReturnType<Project['getSourceFileOrThrow']>,
  startPos: number,
  endPos: number,
  enclosingScope: Node | undefined,
): string[] {
  if (!enclosingScope) return [];

  // Collect all variable declarations in the enclosing scope that are BEFORE the selection
  const declaredBefore = new Set<string>();

  // If enclosing scope is a function, get its parameters
  if (Node.isFunctionDeclaration(enclosingScope) ||
      Node.isMethodDeclaration(enclosingScope) ||
      Node.isArrowFunction(enclosingScope) ||
      Node.isFunctionExpression(enclosingScope)) {
    for (const param of enclosingScope.getParameters()) {
      if (param.getStart() < startPos) {
        declaredBefore.add(param.getName());
      }
    }
  }

  // Get variable declarations in the enclosing scope's body that come before the selection
  const body = Node.isFunctionDeclaration(enclosingScope) || Node.isMethodDeclaration(enclosingScope)
    ? enclosingScope.getBody()
    : Node.isArrowFunction(enclosingScope) || Node.isFunctionExpression(enclosingScope)
      ? enclosingScope.getBody()
      : enclosingScope;

  if (body) {
    const varDecls = body.getDescendantsOfKind(SyntaxKind.VariableDeclaration);
    for (const decl of varDecls) {
      if (decl.getStart() < startPos) {
        declaredBefore.add(decl.getName());
      }
    }
  }

  // Now find which of these are actually referenced in the selection
  const referenced = new Set<string>();
  const selectedNodes = sourceFile.getDescendants().filter(
    (n) => n.getStart() >= startPos && n.getEnd() <= endPos
  );

  for (const node of selectedNodes) {
    if (Node.isIdentifier(node)) {
      const name = node.getText();
      if (declaredBefore.has(name)) {
        referenced.add(name);
      }
    }
  }

  return [...referenced].sort();
}
