import { Project, Node, SyntaxKind } from 'ts-morph';
import type { ChangeSet, FileChange } from '../../core/change-set.js';
import { createChangeSet } from '../../core/change-set.js';
import type { Logger } from '../../core/logger.js';

export interface ConvertTypeInterfaceArgs {
  filePath: string;
  line: number;
  col: number;
  logger: Logger;
}

export function convertTypeInterface(project: Project, args: ConvertTypeInterfaceArgs): ChangeSet {
  const { filePath, line, col, logger } = args;

  const sourceFile = project.getSourceFile(filePath);
  if (!sourceFile) {
    logger.warn('convert-type-interface', 'source file not found', { filePath });
    return createChangeSet('Convert type/interface (no changes)', []);
  }

  const original = sourceFile.getFullText();

  const pos = sourceFile.compilerNode.getPositionOfLineAndCharacter(line - 1, col - 1);
  const node = sourceFile.getDescendantAtPos(pos);

  if (!node || !Node.isIdentifier(node)) {
    logger.warn('convert-type-interface', 'no identifier at position', { filePath, line, col });
    return createChangeSet('Convert type/interface (no identifier)', []);
  }

  const name = node.getText();

  // Check if it's a type alias
  const typeAlias = sourceFile.getTypeAlias(name);
  if (typeAlias) {
    return typeAliasToInterface(sourceFile, typeAlias, name, original, logger);
  }

  // Check if it's an interface
  const iface = sourceFile.getInterface(name);
  if (iface) {
    return interfaceToTypeAlias(sourceFile, iface, name, original, logger);
  }

  logger.warn('convert-type-interface', 'not a type alias or interface', { name });
  return createChangeSet('Convert type/interface (not found)', []);
}

function typeAliasToInterface(
  sourceFile: ReturnType<Project['getSourceFileOrThrow']>,
  typeAlias: ReturnType<ReturnType<Project['getSourceFileOrThrow']>['getTypeAliasOrThrow']>,
  name: string,
  original: string,
  logger: Logger,
): ChangeSet {
  logger.info('convert-type-interface', 'converting type alias to interface', { name });

  const typeNode = typeAlias.getTypeNode();
  if (!typeNode) {
    return createChangeSet('Convert type/interface (no type node)', []);
  }

  // Get the type literal body — works for object literal types
  const typeText = typeNode.getText();
  const isExported = typeAlias.isExported();
  const exportPrefix = isExported ? 'export ' : '';

  // Build interface text from the type literal
  // For `type X = { a: number; b: string; }`, we want `interface X { a: number; b: string; }`
  let bodyText = typeText;
  // If it's wrapped in { }, use it directly as the interface body
  if (bodyText.startsWith('{')) {
    // Already an object literal shape
  } else {
    // Not an object type — can't convert
    logger.warn('convert-type-interface', 'type is not an object literal', { name, typeText });
    return createChangeSet('Convert type/interface (not an object type)', []);
  }

  const interfaceText = `${exportPrefix}interface ${name} ${bodyText}`;

  // Replace the type alias with the interface
  const start = typeAlias.getStart();
  const end = typeAlias.getEnd();

  const modified = original.slice(0, start) + interfaceText + original.slice(end);

  const files: FileChange[] = [];
  if (original !== modified) {
    files.push({ path: sourceFile.getFilePath(), original, modified });
  }

  logger.info('convert-type-interface', 'conversion complete', { name, direction: 'type→interface' });
  return createChangeSet(`Convert type '${name}' to interface`, files);
}

function interfaceToTypeAlias(
  sourceFile: ReturnType<Project['getSourceFileOrThrow']>,
  iface: ReturnType<ReturnType<Project['getSourceFileOrThrow']>['getInterfaceOrThrow']>,
  name: string,
  original: string,
  logger: Logger,
): ChangeSet {
  logger.info('convert-type-interface', 'converting interface to type alias', { name });

  const isExported = iface.isExported();
  const exportPrefix = isExported ? 'export ' : '';

  // Build the object literal from interface members
  const members = iface.getMembers().map((m) => m.getText()).join('\n  ');
  const typeBody = `{\n  ${members}\n}`;

  const typeAliasText = `${exportPrefix}type ${name} = ${typeBody};`;

  const start = iface.getStart();
  const end = iface.getEnd();

  const modified = original.slice(0, start) + typeAliasText + original.slice(end);

  const files: FileChange[] = [];
  if (original !== modified) {
    files.push({ path: sourceFile.getFilePath(), original, modified });
  }

  logger.info('convert-type-interface', 'conversion complete', { name, direction: 'interface→type' });
  return createChangeSet(`Convert interface '${name}' to type`, files);
}
