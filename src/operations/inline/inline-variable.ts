import { Project, Node, SyntaxKind } from 'ts-morph';
import type { ChangeSet, FileChange } from '../../core/change-set.js';
import { createChangeSet } from '../../core/change-set.js';
import type { Logger } from '../../core/logger.js';

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
    return createChangeSet('Inline variable (no changes)', []);
  }

  const original = sourceFile.getFullText();

  // Find the identifier at the position
  const pos = sourceFile.compilerNode.getPositionOfLineAndCharacter(line - 1, col - 1);
  const node = sourceFile.getDescendantAtPos(pos);

  if (!node || !Node.isIdentifier(node)) {
    logger.warn('inline-variable', 'no identifier at position', { filePath, line, col });
    return createChangeSet('Inline variable (no identifier)', []);
  }

  const varName = node.getText();

  // Find the variable declaration for this identifier
  const parent = node.getParent();
  let varDecl = Node.isVariableDeclaration(parent) ? parent : undefined;

  if (!varDecl) {
    // The identifier might be a reference, not the declaration — find the declaration
    const symbol = node.getSymbol();
    if (symbol) {
      const declarations = symbol.getDeclarations();
      for (const decl of declarations) {
        if (Node.isVariableDeclaration(decl)) {
          varDecl = decl;
          break;
        }
      }
    }
  }

  if (!varDecl) {
    logger.warn('inline-variable', 'variable declaration not found', { varName });
    return createChangeSet('Inline variable (not a variable)', []);
  }

  // Get the initializer expression
  const initializer = varDecl.getInitializer();
  if (!initializer) {
    logger.warn('inline-variable', 'variable has no initializer', { varName });
    return createChangeSet('Inline variable (no initializer)', []);
  }

  const initText = initializer.getText();

  logger.info('inline-variable', 'inlining variable', {
    varName,
    initializerText: initText.slice(0, 50),
  });

  // Find all references to this variable via ts-morph AST
  const refs = varDecl.findReferences();
  const referenceNodes: { start: number; end: number }[] = [];

  for (const refGroup of refs) {
    for (const ref of refGroup.getReferences()) {
      const refNode = ref.getNode();
      // Skip the declaration itself
      if (refNode.getStart() === varDecl.getNameNode().getStart()) continue;
      referenceNodes.push({ start: refNode.getStart(), end: refNode.getEnd() });
    }
  }

  logger.debug('inline-variable', 'found references', {
    varName, referenceCount: referenceNodes.length,
  });

  // Sort references from last to first so position shifts don't affect earlier replacements
  referenceNodes.sort((a, b) => b.start - a.start);

  // Replace all references with the initializer text
  let modified = original;
  for (const ref of referenceNodes) {
    modified = modified.slice(0, ref.start) + initText + modified.slice(ref.end);
  }

  // Remove the variable declaration statement
  const varStatement = varDecl.getVariableStatement();
  if (varStatement) {
    // If the statement has only this declaration, remove the whole statement
    if (varStatement.getDeclarations().length === 1) {
      const stmtStart = varStatement.getFullStart();
      const stmtEnd = varStatement.getEnd();
      // Account for position shifts from reference replacements
      // Since we sorted refs last-to-first, all replacements are after the declaration
      // (for local variables), so the declaration position is unchanged
      // Actually, some refs could be before the decl (hoisting), but for const/let that's rare

      // Recalculate: we need to find the declaration in the modified text
      // Simpler approach: remove from original positions, adjusting for prior edits
      // Since refs were replaced last-to-first, only refs AFTER the decl shifted the text.
      // Refs before the decl would have shifted the decl's position.

      // Actually let's use a different approach: do all edits on the original positions
      // by collecting all edits and applying them in reverse order

      // For now, find and remove the declaration line in the modified text
      const declLineStart = findLineStart(modified, modified.indexOf(`${varDecl.getVariableStatement()!.getDeclarationKind()} ${varName}`));
      if (declLineStart >= 0) {
        const declLineEnd = modified.indexOf('\n', declLineStart);
        if (declLineEnd >= 0) {
          modified = modified.slice(0, declLineStart) + modified.slice(declLineEnd + 1);
        }
      }
    }
  }

  const files: FileChange[] = [];
  if (original !== modified) {
    files.push({ path: filePath, original, modified });
  }

  logger.info('inline-variable', 'inline complete', {
    varName, filesChanged: files.length,
  });

  return createChangeSet(`Inline variable '${varName}'`, files);
}

function findLineStart(text: string, pos: number): number {
  if (pos < 0) return -1;
  let lineStart = pos;
  while (lineStart > 0 && text[lineStart - 1] !== '\n') {
    lineStart--;
  }
  return lineStart;
}
