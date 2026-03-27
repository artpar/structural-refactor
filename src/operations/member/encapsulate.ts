import { Project, Scope } from 'ts-morph';
import type { ChangeSet } from '../../core/change-set.js';
import type { Logger } from '../../core/logger.js';
import { executeRefactoring, preconditionOk, preconditionFail } from '../engine.js';

export interface EncapsulateFieldArgs {
  filePath: string;
  className: string;
  fieldName: string;
  logger: Logger;
}

export function encapsulateField(project: Project, args: EncapsulateFieldArgs): ChangeSet {
  const { filePath, className, fieldName, logger } = args;

  const sourceFile = project.getSourceFile(filePath);
  const classDecl = sourceFile?.getClass(className);
  const field = classDecl?.getProperty(fieldName);

  return executeRefactoring(
    project,
    `Encapsulate field '${fieldName}' in '${className}'`,
    () => {
      if (!sourceFile) {
        return preconditionFail([`source file not found: ${filePath}`]);
      }
      if (!classDecl) {
        return preconditionFail([`class '${className}' not found in ${filePath}`]);
      }
      if (!field) {
        return preconditionFail([`field '${fieldName}' not found in class '${className}'`]);
      }
      return preconditionOk();
    },
    () => {
      logger.info('encapsulate-field', 'encapsulating field', { className, fieldName, filePath });

      // Get field info from AST
      const typeNode = field!.getTypeNode();
      const typeText = typeNode ? typeNode.getText() : field!.getType().getText();

      const privateName = `_${fieldName}`;

      // Rename the field to private with underscore
      field!.rename(privateName);
      field!.setScope(Scope.Private);

      // Add getter
      classDecl!.addGetAccessor({
        name: fieldName,
        returnType: typeText,
        statements: [`return this.${privateName};`],
      });

      // Add setter
      classDecl!.addSetAccessor({
        name: fieldName,
        parameters: [{ name: 'value', type: typeText }],
        statements: [`this.${privateName} = value;`],
      });

      logger.info('encapsulate-field', 'encapsulation complete', { className, fieldName });
    },
    logger,
  );
}
