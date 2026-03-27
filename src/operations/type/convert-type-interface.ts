import { Project, Node, SyntaxKind } from 'ts-morph';
import type { ChangeSet } from '../../core/change-set.js';
import type { Logger } from '../../core/logger.js';
import { executeRefactoring, preconditionOk, preconditionFail } from '../engine.js';

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
    return executeRefactoring(
      project,
      'Convert type/interface (no changes)',
      () => preconditionFail(['source file not found']),
      () => {},
      logger,
    );
  }

  const pos = sourceFile.compilerNode.getPositionOfLineAndCharacter(line - 1, col - 1);
  const node = sourceFile.getDescendantAtPos(pos);

  if (!node || !Node.isIdentifier(node)) {
    logger.warn('convert-type-interface', 'no identifier at position', { filePath, line, col });
    return executeRefactoring(
      project,
      'Convert type/interface (no identifier)',
      () => preconditionFail(['no identifier at position']),
      () => {},
      logger,
    );
  }

  const name = node.getText();
  const typeAlias = sourceFile.getTypeAlias(name);
  const iface = sourceFile.getInterface(name);

  if (typeAlias) {
    return typeAliasToInterface(project, sourceFile, typeAlias, name, logger);
  }

  if (iface) {
    return interfaceToTypeAlias(project, sourceFile, iface, name, logger);
  }

  logger.warn('convert-type-interface', 'not a type alias or interface', { name });
  return executeRefactoring(
    project,
    'Convert type/interface (not found)',
    () => preconditionFail([`'${name}' is not a type alias or interface`]),
    () => {},
    logger,
  );
}

function typeAliasToInterface(
  project: Project,
  sourceFile: ReturnType<Project['getSourceFileOrThrow']>,
  typeAlias: ReturnType<ReturnType<Project['getSourceFileOrThrow']>['getTypeAliasOrThrow']>,
  name: string,
  logger: Logger,
): ChangeSet {
  return executeRefactoring(
    project,
    `Convert type '${name}' to interface`,
    () => {
      const typeNode = typeAlias.getTypeNode();
      if (!typeNode) {
        return preconditionFail(['type alias has no type node']);
      }
      // Must be an object literal type (starts with '{')
      if (!typeNode.getText().startsWith('{')) {
        logger.warn('convert-type-interface', 'type is not an object literal', { name, typeText: typeNode.getText() });
        return preconditionFail([`type '${name}' is not an object literal type`]);
      }
      return preconditionOk();
    },
    () => {
      logger.info('convert-type-interface', 'converting type alias to interface', { name });

      const typeNode = typeAlias.getTypeNode()!;
      const isExported = typeAlias.isExported();

      // Extract members from the type literal node
      const members: Array<{ name: string; type: string; hasQuestionToken?: boolean }> = [];

      // Get property signatures from the type literal
      if (Node.isTypeLiteral(typeNode)) {
        for (const member of typeNode.getMembers()) {
          if (Node.isPropertySignature(member)) {
            const memberName = member.getName();
            const memberType = member.getTypeNode()?.getText() ?? member.getType().getText();
            members.push({
              name: memberName,
              type: memberType,
              hasQuestionToken: member.hasQuestionToken(),
            });
          }
        }
      }

      // Get the index of the type alias in the source file statements
      const stmtIndex = sourceFile.getStatements().indexOf(typeAlias);

      // Remove the type alias
      typeAlias.remove();

      // Insert interface at same position
      sourceFile.insertInterface(stmtIndex, {
        name,
        isExported,
        properties: members,
      });

      logger.info('convert-type-interface', 'conversion complete', { name, direction: 'type->interface' });
    },
    logger,
  );
}

function interfaceToTypeAlias(
  project: Project,
  sourceFile: ReturnType<Project['getSourceFileOrThrow']>,
  iface: ReturnType<ReturnType<Project['getSourceFileOrThrow']>['getInterfaceOrThrow']>,
  name: string,
  logger: Logger,
): ChangeSet {
  return executeRefactoring(
    project,
    `Convert interface '${name}' to type`,
    () => preconditionOk(),
    () => {
      logger.info('convert-type-interface', 'converting interface to type alias', { name });

      const isExported = iface.isExported();

      // Build the object literal from interface members
      const membersText = iface.getMembers().map((m) => m.getText()).join('\n  ');
      const typeBody = `{\n  ${membersText}\n}`;

      // Get the index of the interface in the source file statements
      const stmtIndex = sourceFile.getStatements().indexOf(iface);

      // Remove the interface
      iface.remove();

      // Insert type alias at same position
      sourceFile.insertTypeAlias(stmtIndex, {
        name,
        isExported,
        type: typeBody,
      });

      logger.info('convert-type-interface', 'conversion complete', { name, direction: 'interface->type' });
    },
    logger,
  );
}
