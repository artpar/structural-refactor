import { Project, Scope } from 'ts-morph';
import type { ChangeSet, FileChange } from '../../core/change-set.js';
import { createChangeSet } from '../../core/change-set.js';
import type { Logger } from '../../core/logger.js';

export interface EncapsulateFieldArgs {
  filePath: string;
  className: string;
  fieldName: string;
  logger: Logger;
}

export function encapsulateField(project: Project, args: EncapsulateFieldArgs): ChangeSet {
  const { filePath, className, fieldName, logger } = args;

  const sourceFile = project.getSourceFile(filePath);
  if (!sourceFile) {
    logger.warn('encapsulate-field', 'source file not found', { filePath });
    return createChangeSet('Encapsulate field (no changes)', []);
  }

  const classDecl = sourceFile.getClass(className);
  if (!classDecl) {
    logger.warn('encapsulate-field', 'class not found', { className, filePath });
    return createChangeSet('Encapsulate field (class not found)', []);
  }

  const field = classDecl.getProperty(fieldName);
  if (!field) {
    logger.warn('encapsulate-field', 'field not found', { fieldName, className });
    return createChangeSet('Encapsulate field (field not found)', []);
  }

  logger.info('encapsulate-field', 'encapsulating field', { className, fieldName, filePath });

  const original = sourceFile.getFullText();

  // Get field info from AST
  const typeNode = field.getTypeNode();
  const typeText = typeNode ? typeNode.getText() : field.getType().getText();
  const initializer = field.getInitializer()?.getText();

  const privateName = `_${fieldName}`;

  // Rename the field to private with underscore
  field.rename(privateName);
  field.setScope(Scope.Private);

  // Add getter
  classDecl.addGetAccessor({
    name: fieldName,
    returnType: typeText,
    statements: [`return this.${privateName};`],
  });

  // Add setter
  classDecl.addSetAccessor({
    name: fieldName,
    parameters: [{ name: 'value', type: typeText }],
    statements: [`this.${privateName} = value;`],
  });

  const modified = sourceFile.getFullText();

  const files: FileChange[] = [];
  if (original !== modified) {
    files.push({ path: filePath, original, modified });
  }

  logger.info('encapsulate-field', 'encapsulation complete', {
    className, fieldName, filesChanged: files.length,
  });

  return createChangeSet(`Encapsulate field '${fieldName}' in '${className}'`, files);
}
