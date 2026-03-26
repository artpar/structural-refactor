import { Project, Node, SyntaxKind } from 'ts-morph';
import type { ChangeSet, FileChange } from '../../core/change-set.js';
import { createChangeSet } from '../../core/change-set.js';
import type { Logger } from '../../core/logger.js';

export interface CjsToEsmArgs {
  filePath: string;
  logger: Logger;
}

export function cjsToEsm(project: Project, args: CjsToEsmArgs): ChangeSet {
  const { filePath, logger } = args;

  const sourceFile = project.getSourceFile(filePath);
  if (!sourceFile) {
    logger.warn('cjs-to-esm', 'source file not found', { filePath });
    return createChangeSet('CJS to ESM (no changes)', []);
  }

  const original = sourceFile.getFullText();

  // Collect all transformations as text edits (position, length, replacement)
  const edits: { start: number; end: number; replacement: string }[] = [];

  // 1. Convert require() calls to import declarations
  const callExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);
  for (const call of callExpressions) {
    const expr = call.getExpression();
    if (!Node.isIdentifier(expr) || expr.getText() !== 'require') continue;

    const callArgs = call.getArguments();
    if (callArgs.length !== 1) continue;

    const moduleSpecifier = callArgs[0].getText().replace(/^['"]|['"]$/g, '');

    // Check the parent to determine the import pattern
    const parent = call.getParent();
    if (!parent) continue;

    // const x = require("mod") → import x from "mod"
    if (Node.isVariableDeclaration(parent)) {
      const nameNode = parent.getNameNode();
      const varStatement = parent.getVariableStatement();
      if (!varStatement) continue;

      if (Node.isIdentifier(nameNode)) {
        // Simple: const fs = require("fs")
        const importText = `import ${nameNode.getText()} from "${moduleSpecifier}";`;
        edits.push({
          start: varStatement.getStart(),
          end: varStatement.getEnd(),
          replacement: importText,
        });
      } else if (Node.isObjectBindingPattern(nameNode)) {
        // Destructured: const { a, b } = require("mod")
        const elements = nameNode.getElements();
        const names = elements.map((e) => e.getName());
        const importText = `import { ${names.join(', ')} } from "${moduleSpecifier}";`;
        edits.push({
          start: varStatement.getStart(),
          end: varStatement.getEnd(),
          replacement: importText,
        });
      }
    }
  }

  // 2. Convert module.exports = X to export default X
  const binaryExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.BinaryExpression);
  for (const binExpr of binaryExpressions) {
    const left = binExpr.getLeft();
    const right = binExpr.getRight();

    if (left.getText() === 'module.exports') {
      const stmt = binExpr.getParent();
      if (stmt && Node.isExpressionStatement(stmt)) {
        edits.push({
          start: stmt.getStart(),
          end: stmt.getEnd(),
          replacement: `export default ${right.getText()};`,
        });
      }
    }

    // 3. Convert exports.name = value to export const name = value
    if (Node.isPropertyAccessExpression(left)) {
      const obj = left.getExpression();
      if (Node.isIdentifier(obj) && obj.getText() === 'exports') {
        const propName = left.getName();
        const stmt = binExpr.getParent();
        if (stmt && Node.isExpressionStatement(stmt)) {
          edits.push({
            start: stmt.getStart(),
            end: stmt.getEnd(),
            replacement: `export const ${propName} = ${right.getText()};`,
          });
        }
      }
    }
  }

  if (edits.length === 0) {
    logger.info('cjs-to-esm', 'no CJS patterns found', { filePath });
    return createChangeSet('CJS to ESM (no changes)', []);
  }

  logger.info('cjs-to-esm', 'converting CJS to ESM', {
    filePath, editCount: edits.length,
  });

  // Sort edits from last to first and apply
  edits.sort((a, b) => b.start - a.start);
  let modified = original;
  for (const edit of edits) {
    modified = modified.slice(0, edit.start) + edit.replacement + modified.slice(edit.end);
  }

  const files: FileChange[] = [];
  if (original !== modified) {
    files.push({ path: filePath, original, modified });
  }

  logger.info('cjs-to-esm', 'conversion complete', {
    filePath, editsApplied: edits.length,
  });

  return createChangeSet(`Convert CJS to ESM in '${filePath}'`, files);
}
