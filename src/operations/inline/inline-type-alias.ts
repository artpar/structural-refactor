/**
 * Inline Type Alias: replace all type references with the alias definition, remove alias.
 * Cross-file: uses findReferences() across ALL project files.
 * All mutations via ts-morph API.
 */
import { Project, Node, SyntaxKind } from 'ts-morph';
import type { ChangeSet } from '../../core/change-set.js';
import type { Logger } from '../../core/logger.js';
import { executeRefactoring, preconditionOk, preconditionFail } from '../engine.js';

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
    return executeRefactoring(project, 'Inline type alias', () => preconditionFail(['source file not found']), () => {}, logger);
  }

  const pos = sourceFile.compilerNode.getPositionOfLineAndCharacter(line - 1, col - 1);
  const node = sourceFile.getDescendantAtPos(pos);
  if (!node || !Node.isIdentifier(node)) {
    return executeRefactoring(project, 'Inline type alias', () => preconditionFail(['no identifier at position']), () => {}, logger);
  }

  const typeName = node.getText();
  const typeAlias = sourceFile.getTypeAlias(typeName);
  if (!typeAlias) {
    return executeRefactoring(project, 'Inline type alias', () => preconditionFail(['not a type alias']), () => {}, logger);
  }

  const typeNode = typeAlias.getTypeNode();
  if (!typeNode) {
    return executeRefactoring(project, 'Inline type alias', () => preconditionFail(['type alias has no type']), () => {}, logger);
  }

  const typeText = typeNode.getText();

  logger.info('inline-type-alias', 'inlining type alias', { typeName, typeText: typeText.slice(0, 50) });

  // Find ALL references across ALL files
  const refs = typeAlias.findReferences();
  const refNodes: Node[] = [];
  for (const refGroup of refs) {
    for (const ref of refGroup.getReferences()) {
      if (ref.isDefinition()) continue;
      refNodes.push(ref.getNode());
    }
  }

  logger.debug('inline-type-alias', 'found references', {
    typeName,
    referenceCount: refNodes.length,
    files: [...new Set(refNodes.map((n) => n.getSourceFile().getFilePath()))],
  });

  return executeRefactoring(
    project,
    `Inline type alias '${typeName}'`,
    () => preconditionOk(),
    () => {
      // Replace all references with the type definition (cross-file!)
      const byFile = new Map<string, Node[]>();
      for (const ref of refNodes) {
        const fp = ref.getSourceFile().getFilePath();
        const list = byFile.get(fp) ?? [];
        list.push(ref);
        byFile.set(fp, list);
      }

      for (const [, fileRefs] of byFile) {
        fileRefs.sort((a, b) => b.getStart() - a.getStart());
        for (const ref of fileRefs) {
          // Replace the TypeReference parent (not just the identifier) to handle
          // node kind changes (e.g., TypeReference → StringKeyword)
          const parent = ref.getParent();
          if (parent && Node.isTypeReference(parent)) {
            parent.replaceWithText(typeText);
          } else {
            ref.replaceWithText(typeText);
          }
        }
      }

      // Remove the type alias declaration
      typeAlias.remove();
    },
    logger,
  );
}
