/**
 * CJS to ESM: convert CommonJS require/module.exports to ESM import/export.
 * Cross-file: processes ALL files in the project (or scoped directory).
 * All mutations via ts-morph API + engine snapshot/diff.
 */
import { Project, Node, SyntaxKind } from 'ts-morph';
import type { ChangeSet } from '../../core/change-set.js';
import type { Logger } from '../../core/logger.js';
import { executeRefactoring, preconditionOk, preconditionFail } from '../engine.js';

export interface CjsToEsmArgs {
  filePath: string;  // single file, or pass empty to do all files
  logger: Logger;
}

export function cjsToEsm(project: Project, args: CjsToEsmArgs): ChangeSet {
  const { filePath, logger } = args;

  const targetFiles = filePath
    ? [project.getSourceFile(filePath)].filter(Boolean) as ReturnType<Project['getSourceFileOrThrow']>[]
    : project.getSourceFiles();

  if (targetFiles.length === 0) {
    return executeRefactoring(project, 'CJS to ESM', () => preconditionFail(['no files found']), () => {}, logger);
  }

  return executeRefactoring(
    project,
    `Convert CJS to ESM${filePath ? ` in '${filePath}'` : ' (all files)'}`,
    () => preconditionOk(),
    () => {
      let totalEdits = 0;

      for (const sf of targetFiles) {
        const editsInFile = convertFileToEsm(sf, logger);
        totalEdits += editsInFile;
      }

      logger.info('cjs-to-esm', 'conversion complete', { totalEdits, fileCount: targetFiles.length });
    },
    logger,
  );
}

function convertFileToEsm(
  sf: ReturnType<Project['getSourceFileOrThrow']>,
  logger: Logger,
): number {
  let edits = 0;

  // 1. Convert require() calls to import declarations
  // Process in reverse to preserve positions
  const varStatements = [...sf.getVariableStatements()].reverse();

  for (const varStmt of varStatements) {
    for (const decl of varStmt.getDeclarations()) {
      const init = decl.getInitializer();
      if (!init || !Node.isCallExpression(init)) continue;

      const expr = init.getExpression();
      if (!Node.isIdentifier(expr) || expr.getText() !== 'require') continue;

      const callArgs = init.getArguments();
      if (callArgs.length !== 1) continue;

      const moduleSpec = callArgs[0].getText().replace(/^['"]|['"]$/g, '');
      const nameNode = decl.getNameNode();

      if (Node.isIdentifier(nameNode)) {
        // const fs = require("fs") → import fs from "fs"
        const localName = nameNode.getText();
        const stmtIndex = sf.getStatements().indexOf(varStmt);
        varStmt.remove();
        sf.insertImportDeclaration(stmtIndex, {
          defaultImport: localName,
          moduleSpecifier: moduleSpec,
        });
        edits++;
      } else if (Node.isObjectBindingPattern(nameNode)) {
        // const { a, b } = require("mod") → import { a, b } from "mod"
        const names = nameNode.getElements().map((e) => e.getName());
        const stmtIndex = sf.getStatements().indexOf(varStmt);
        varStmt.remove();
        sf.insertImportDeclaration(stmtIndex, {
          namedImports: names,
          moduleSpecifier: moduleSpec,
        });
        edits++;
      }
    }
  }

  // 2. Convert module.exports = X to export default X
  // and exports.name = value to export const name = value
  const exprStatements = [...sf.getDescendantsOfKind(SyntaxKind.ExpressionStatement)].reverse();

  for (const exprStmt of exprStatements) {
    const expr = exprStmt.getExpression();
    if (!Node.isBinaryExpression(expr)) continue;

    const left = expr.getLeft();
    const right = expr.getRight();
    const op = expr.getOperatorToken().getText();
    if (op !== '=') continue;

    if (left.getText() === 'module.exports') {
      // module.exports = X → export default X
      const rightText = right.getText();
      exprStmt.replaceWithText(`export default ${rightText};`);
      edits++;
    } else if (Node.isPropertyAccessExpression(left)) {
      const obj = left.getExpression();
      if (Node.isIdentifier(obj) && obj.getText() === 'exports') {
        // exports.name = value → export const name = value
        const propName = left.getName();
        const rightText = right.getText();
        exprStmt.replaceWithText(`export const ${propName} = ${rightText};`);
        edits++;
      }
    }
  }

  return edits;
}
