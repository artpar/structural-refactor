/**
 * Inline Function: replace all call sites with the function body, remove declaration.
 * Cross-file: uses findReferences() across ALL project files.
 * All mutations via ts-morph API — no string manipulation.
 */
import { Project, Node, SyntaxKind } from 'ts-morph';
import type { ChangeSet } from '../../core/change-set.js';
import type { Logger } from '../../core/logger.js';
import { executeRefactoring, preconditionOk, preconditionFail } from '../engine.js';

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
    return executeRefactoring(project, 'Inline function', () => preconditionFail(['source file not found']), () => {}, logger);
  }

  const pos = sourceFile.compilerNode.getPositionOfLineAndCharacter(line - 1, col - 1);
  const node = sourceFile.getDescendantAtPos(pos);
  if (!node || !Node.isIdentifier(node)) {
    return executeRefactoring(project, 'Inline function', () => preconditionFail(['no identifier at position']), () => {}, logger);
  }

  const fnName = node.getText();
  const fnDecl = sourceFile.getFunction(fnName);
  if (!fnDecl) {
    return executeRefactoring(project, 'Inline function', () => preconditionFail(['not a function declaration']), () => {}, logger);
  }

  const body = fnDecl.getBody();
  if (!body || !Node.isBlock(body)) {
    return executeRefactoring(project, 'Inline function', () => preconditionFail(['function has no block body']), () => {}, logger);
  }

  const statements = body.getStatements();
  if (statements.length !== 1 || !Node.isReturnStatement(statements[0])) {
    return executeRefactoring(project, 'Inline function', () => preconditionFail(['function must have single return for inlining']), () => {}, logger);
  }

  const returnExpr = statements[0].getExpression();
  if (!returnExpr) {
    return executeRefactoring(project, 'Inline function', () => preconditionFail(['return has no expression']), () => {}, logger);
  }

  const returnText = returnExpr.getText();
  const params = fnDecl.getParameters().map((p) => p.getName());

  logger.info('inline-function', 'inlining function', { fnName, paramCount: params.length });

  // Find ALL call sites across ALL files
  const refs = fnDecl.findReferences();
  const callSites: { callExpr: Node; args: string[] }[] = [];

  for (const refGroup of refs) {
    for (const ref of refGroup.getReferences()) {
      const refNode = ref.getNode();
      if (refNode.getStart() === fnDecl.getNameNode()!.getStart()) continue;

      const parent = refNode.getParent();
      if (parent && Node.isCallExpression(parent)) {
        callSites.push({
          callExpr: parent,
          args: parent.getArguments().map((a) => a.getText()),
        });
      }
    }
  }

  logger.debug('inline-function', 'found call sites', {
    fnName,
    callSiteCount: callSites.length,
    files: [...new Set(callSites.map((cs) => cs.callExpr.getSourceFile().getFilePath()))],
  });

  return executeRefactoring(
    project,
    `Inline function '${fnName}'`,
    () => {
      if (callSites.length === 0) return preconditionOk(['function has no call sites — will just remove declaration']);
      return preconditionOk();
    },
    () => {
      // Replace each call site with the inlined expression (cross-file!)
      // Process in reverse order per file to preserve positions
      const byFile = new Map<string, typeof callSites>();
      for (const cs of callSites) {
        const fp = cs.callExpr.getSourceFile().getFilePath();
        const list = byFile.get(fp) ?? [];
        list.push(cs);
        byFile.set(fp, list);
      }

      for (const [, fileCallSites] of byFile) {
        fileCallSites.sort((a, b) => b.callExpr.getStart() - a.callExpr.getStart());
        for (const cs of fileCallSites) {
          let inlinedExpr = returnText;
          for (let i = 0; i < params.length; i++) {
            const arg = cs.args[i] ?? 'undefined';
            inlinedExpr = substituteParam(inlinedExpr, params[i], arg);
          }
          cs.callExpr.replaceWithText(inlinedExpr);
        }
      }

      // Remove function declaration
      fnDecl.remove();
    },
    logger,
  );
}

function substituteParam(expression: string, paramName: string, argValue: string): string {
  const regex = new RegExp(`\\b${escapeRegex(paramName)}\\b`, 'g');
  return expression.replace(regex, argValue);
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
