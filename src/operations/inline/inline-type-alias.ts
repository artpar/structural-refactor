import { Project, Node, SyntaxKind } from 'ts-morph';
import type { ChangeSet, FileChange } from '../../core/change-set.js';
import { createChangeSet } from '../../core/change-set.js';
import type { Logger } from '../../core/logger.js';

export interface InlineTypeAliasArgs {
  filePath: string;
  line: number;
  col: number;
  logger: Logger;
}

export function inlineTypeAlias(project: Project, args: InlineTypeAliasArgs): ChangeSet {
  const { filePath, line, col, logger } = args;

  const sourceFile = project.getSourceFile(filePath);
  if (!sourceFile) {
    logger.warn('inline-type-alias', 'source file not found', { filePath });
    return createChangeSet('Inline type alias (no changes)', []);
  }

  const original = sourceFile.getFullText();

  const pos = sourceFile.compilerNode.getPositionOfLineAndCharacter(line - 1, col - 1);
  const node = sourceFile.getDescendantAtPos(pos);

  if (!node || !Node.isIdentifier(node)) {
    logger.warn('inline-type-alias', 'no identifier at position', { filePath, line, col });
    return createChangeSet('Inline type alias (no identifier)', []);
  }

  const typeName = node.getText();

  // Find the type alias declaration
  const typeAlias = sourceFile.getTypeAlias(typeName);
  if (!typeAlias) {
    logger.warn('inline-type-alias', 'not a type alias', { typeName });
    return createChangeSet('Inline type alias (not found)', []);
  }

  const typeNode = typeAlias.getTypeNode();
  if (!typeNode) {
    logger.warn('inline-type-alias', 'type alias has no type', { typeName });
    return createChangeSet('Inline type alias (no type)', []);
  }

  const typeText = typeNode.getText();

  logger.info('inline-type-alias', 'inlining type alias', {
    typeName,
    typeText: typeText.slice(0, 50),
  });

  // Find all references to this type alias
  const refs = typeAlias.findReferences();
  const referenceNodes: { start: number; end: number }[] = [];

  for (const refGroup of refs) {
    for (const ref of refGroup.getReferences()) {
      const refNode = ref.getNode();
      // Skip the declaration itself
      if (refNode.getStart() === typeAlias.getNameNode().getStart()) continue;
      referenceNodes.push({ start: refNode.getStart(), end: refNode.getEnd() });
    }
  }

  // Sort last to first
  referenceNodes.sort((a, b) => b.start - a.start);

  // Replace all references with the type definition
  let modified = original;
  for (const ref of referenceNodes) {
    modified = modified.slice(0, ref.start) + typeText + modified.slice(ref.end);
  }

  // Remove the type alias declaration line
  const aliasStart = typeAlias.getFullStart();
  const aliasEnd = typeAlias.getEnd();
  let removeEnd = aliasEnd;
  if (modified[removeEnd] === '\n') removeEnd++;

  modified = modified.slice(0, aliasStart) + modified.slice(removeEnd);

  const files: FileChange[] = [];
  if (original !== modified) {
    files.push({ path: filePath, original, modified });
  }

  logger.info('inline-type-alias', 'inline complete', {
    typeName, referencesInlined: referenceNodes.length, filesChanged: files.length,
  });

  return createChangeSet(`Inline type alias '${typeName}'`, files);
}
