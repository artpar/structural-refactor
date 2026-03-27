/**
 * Inline Variable: replace all usages with the initializer value, remove declaration.
 * Cross-file: uses findReferences() which returns references in ALL project files.
 * All mutations via ts-morph API — no string manipulation.
 */
import { Project, Node, SyntaxKind } from 'ts-morph';
import type { ChangeSet } from '../../core/change-set.js';
import type { Logger } from '../../core/logger.js';
import { executeRefactoring, preconditionOk, preconditionFail } from '../engine.js';

export interface InlineVariableArgs {
  filePath: string;
  line: number;
  col: number;
  logger: Logger;
}

export function inlineVariable(project: Project, args: InlineVariableArgs): ChangeSet {
  const { filePath, line, col, logger } = args;

  const sourceFile = project.getSourceFile(filePath);
  if (!sourceFile) {
    logger.warn('inline-variable', 'source file not found', { filePath });
    return executeRefactoring(project, 'Inline variable', () => preconditionFail(['source file not found']), () => {}, logger);
  }

  // Find the identifier at position
  const pos = sourceFile.compilerNode.getPositionOfLineAndCharacter(line - 1, col - 1);
  const node = sourceFile.getDescendantAtPos(pos);
  if (!node || !Node.isIdentifier(node)) {
    return executeRefactoring(project, 'Inline variable', () => preconditionFail(['no identifier at position']), () => {}, logger);
  }

  const varName = node.getText();

  // Find the variable declaration
  let varDecl = Node.isVariableDeclaration(node.getParent()) ? node.getParent()! : undefined;
  if (!varDecl || !Node.isVariableDeclaration(varDecl)) {
    const symbol = node.getSymbol();
    if (symbol) {
      for (const decl of symbol.getDeclarations()) {
        if (Node.isVariableDeclaration(decl)) { varDecl = decl; break; }
      }
    }
  }

  if (!varDecl || !Node.isVariableDeclaration(varDecl)) {
    return executeRefactoring(project, 'Inline variable', () => preconditionFail(['not a variable declaration']), () => {}, logger);
  }

  const initializer = varDecl.getInitializer();
  if (!initializer) {
    return executeRefactoring(project, 'Inline variable', () => preconditionFail(['variable has no initializer']), () => {}, logger);
  }

  const initText = initializer.getText();

  logger.info('inline-variable', 'inlining variable', { varName, initializerText: initText.slice(0, 50) });

  // Find ALL references across ALL files
  const refs = varDecl.findReferences();
  const refNodes: Node[] = [];
  for (const refGroup of refs) {
    for (const ref of refGroup.getReferences()) {
      if (ref.isDefinition()) continue;
      refNodes.push(ref.getNode());
    }
  }

  logger.debug('inline-variable', 'found references', {
    varName, referenceCount: refNodes.length,
    files: [...new Set(refNodes.map((n) => n.getSourceFile().getFilePath()))],
  });

  const capturedVarDecl = varDecl;

  return executeRefactoring(
    project,
    `Inline variable '${varName}'`,
    () => {
      // Preconditions
      const errors: string[] = [];
      const warnings: string[] = [];

      if (refNodes.length === 0) {
        warnings.push('variable has no usages — will just remove declaration');
      }

      return preconditionOk(warnings);
    },
    () => {
      // Replace all references with initializer text via ts-morph (cross-file!)
      // Process in reverse order within each file to preserve positions
      const byFile = new Map<string, Node[]>();
      for (const ref of refNodes) {
        const fp = ref.getSourceFile().getFilePath();
        const list = byFile.get(fp) ?? [];
        list.push(ref);
        byFile.set(fp, list);
      }

      for (const [, fileRefs] of byFile) {
        // Sort by position descending so replacements don't shift later positions
        fileRefs.sort((a, b) => b.getStart() - a.getStart());
        for (const ref of fileRefs) {
          ref.replaceWithText(initText);
        }
      }

      // Remove the declaration
      const varStatement = capturedVarDecl.getVariableStatement();
      if (varStatement && varStatement.getDeclarations().length === 1) {
        varStatement.remove();
      } else {
        capturedVarDecl.remove();
      }
    },
    logger,
  );
}
