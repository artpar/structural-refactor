import { Project, Node, SyntaxKind } from 'ts-morph';
import type { ChangeSet, FileChange } from '../../core/change-set.js';
import { createChangeSet } from '../../core/change-set.js';
import type { Logger } from '../../core/logger.js';

export interface InlineFunctionArgs {
  filePath: string;
  line: number;
  col: number;
  logger: Logger;
}

export function inlineFunction(project: Project, args: InlineFunctionArgs): ChangeSet {
  const { filePath, line, col, logger } = args;

  const sourceFile = project.getSourceFile(filePath);
  if (!sourceFile) {
    logger.warn('inline-function', 'source file not found', { filePath });
    return createChangeSet('Inline function (no changes)', []);
  }

  const original = sourceFile.getFullText();

  const pos = sourceFile.compilerNode.getPositionOfLineAndCharacter(line - 1, col - 1);
  const node = sourceFile.getDescendantAtPos(pos);

  if (!node || !Node.isIdentifier(node)) {
    logger.warn('inline-function', 'no identifier at position', { filePath, line, col });
    return createChangeSet('Inline function (no identifier)', []);
  }

  const fnName = node.getText();

  // Find the function declaration
  const fnDecl = sourceFile.getFunction(fnName);
  if (!fnDecl) {
    logger.warn('inline-function', 'not a function declaration', { fnName });
    return createChangeSet('Inline function (not a function)', []);
  }

  // Get the function body — must have a single return statement for simple inlining
  const body = fnDecl.getBody();
  if (!body || !Node.isBlock(body)) {
    logger.warn('inline-function', 'function has no block body', { fnName });
    return createChangeSet('Inline function (no body)', []);
  }

  const statements = body.getStatements();
  if (statements.length !== 1 || !Node.isReturnStatement(statements[0])) {
    logger.warn('inline-function', 'function must have single return for inlining', { fnName, statementCount: statements.length });
    return createChangeSet('Inline function (complex body)', []);
  }

  const returnExpr = statements[0].getExpression();
  if (!returnExpr) {
    logger.warn('inline-function', 'return has no expression', { fnName });
    return createChangeSet('Inline function (void return)', []);
  }

  const returnText = returnExpr.getText();
  const params = fnDecl.getParameters().map((p) => p.getName());

  logger.info('inline-function', 'inlining function', {
    fnName,
    paramCount: params.length,
    returnExpression: returnText.slice(0, 50),
  });

  // Find all call sites via references
  const refs = fnDecl.findReferences();
  const callSites: { start: number; end: number; args: string[] }[] = [];

  for (const refGroup of refs) {
    for (const ref of refGroup.getReferences()) {
      const refNode = ref.getNode();
      // Skip the declaration itself
      if (refNode.getStart() === fnDecl.getNameNode()!.getStart()) continue;

      // The reference should be in a call expression
      const parent = refNode.getParent();
      if (parent && Node.isCallExpression(parent)) {
        const callArgs = parent.getArguments().map((a) => a.getText());
        callSites.push({
          start: parent.getStart(),
          end: parent.getEnd(),
          args: callArgs,
        });
      }
    }
  }

  logger.debug('inline-function', 'found call sites', {
    fnName, callSiteCount: callSites.length,
  });

  // Sort call sites from last to first
  callSites.sort((a, b) => b.start - a.start);

  // Replace each call site with the inlined expression
  let modified = original;
  for (const site of callSites) {
    // Substitute parameters in the return expression
    let inlinedExpr = returnText;
    for (let i = 0; i < params.length; i++) {
      const arg = site.args[i] ?? 'undefined';
      inlinedExpr = substituteParam(inlinedExpr, params[i], arg);
    }
    modified = modified.slice(0, site.start) + inlinedExpr + modified.slice(site.end);
  }

  // Remove the function declaration
  const fnStart = fnDecl.getFullStart();
  const fnEnd = fnDecl.getEnd();
  // Find the end including trailing newline
  let removeEnd = fnEnd;
  if (modified[removeEnd] === '\n') removeEnd++;

  modified = modified.slice(0, fnStart) + modified.slice(removeEnd);

  const files: FileChange[] = [];
  if (original !== modified) {
    files.push({ path: filePath, original, modified });
  }

  logger.info('inline-function', 'inline complete', {
    fnName, callSitesInlined: callSites.length, filesChanged: files.length,
  });

  return createChangeSet(`Inline function '${fnName}'`, files);
}

/**
 * Replace all occurrences of a parameter name in an expression with the argument value.
 * Uses word-boundary aware replacement to avoid partial matches.
 */
function substituteParam(expression: string, paramName: string, argValue: string): string {
  // Parse the expression to find identifier positions that match the param
  // For simplicity, use word-boundary regex (this works for most cases)
  const regex = new RegExp(`\\b${escapeRegex(paramName)}\\b`, 'g');
  return expression.replace(regex, argValue);
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
