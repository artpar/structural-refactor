import { Project, Node, Scope } from 'ts-morph';
import type { ChangeSet, FileChange } from '../../core/change-set.js';
import { createChangeSet } from '../../core/change-set.js';
import type { Logger } from '../../core/logger.js';

export interface CompositionArgs {
  filePath: string;
  className: string;
  logger: Logger;
}

export function replaceInheritanceWithComposition(project: Project, args: CompositionArgs): ChangeSet {
  const { filePath, className, logger } = args;

  const sourceFile = project.getSourceFile(filePath);
  if (!sourceFile) {
    logger.warn('composition', 'source file not found', { filePath });
    return createChangeSet('Composition (no changes)', []);
  }

  const classDecl = sourceFile.getClass(className);
  if (!classDecl) {
    logger.warn('composition', 'class not found', { className, filePath });
    return createChangeSet('Composition (class not found)', []);
  }

  const extendsExpr = classDecl.getExtends();
  if (!extendsExpr) {
    logger.info('composition', 'class does not extend anything', { className });
    return createChangeSet('Composition (no inheritance)', []);
  }

  const parentName = extendsExpr.getText();
  const parentClass = sourceFile.getClass(parentName);

  logger.info('composition', 'replacing inheritance with composition', {
    className, parentName, filePath,
  });

  const original = sourceFile.getFullText();

  // Collect parent's public methods to create forwarding delegates
  const parentMethods: { name: string; params: string; returnType: string; isAsync: boolean }[] = [];

  if (parentClass) {
    for (const method of parentClass.getMethods()) {
      if (method.getScope() === Scope.Private) continue;
      parentMethods.push({
        name: method.getName(),
        params: method.getParameters().map((p) => p.getText()).join(', '),
        returnType: method.getReturnTypeNode()?.getText() ?? '',
        isAsync: method.isAsync(),
      });
    }
  }

  const delegateFieldName = `_${parentName.charAt(0).toLowerCase()}${parentName.slice(1)}`;

  // Remove extends clause
  classDecl.removeExtends();

  // Add delegate field
  classDecl.insertProperty(0, {
    name: delegateFieldName,
    scope: Scope.Private,
    initializer: `new ${parentName}()`,
  });

  // Add forwarding methods for parent methods (only if not already overridden)
  const existingMethods = new Set(classDecl.getMethods().map((m) => m.getName()));

  for (const pm of parentMethods) {
    if (existingMethods.has(pm.name)) continue;

    const asyncPrefix = pm.isAsync ? 'async ' : '';
    const awaitPrefix = pm.isAsync ? 'await ' : '';
    const paramNames = pm.params
      ? pm.params.split(',').map((p) => p.trim().split(/[:\s]/)[0]).join(', ')
      : '';
    const returnAnnotation = pm.returnType ? `: ${pm.returnType}` : '';

    classDecl.addMethod({
      name: pm.name,
      parameters: pm.params ? pm.params.split(',').map((p) => {
        const parts = p.trim().split(':');
        return { name: parts[0].trim(), type: parts[1]?.trim() };
      }) : [],
      isAsync: pm.isAsync,
      statements: [`return ${awaitPrefix}this.${delegateFieldName}.${pm.name}(${paramNames});`],
    });
  }

  const modified = sourceFile.getFullText();

  const files: FileChange[] = [];
  if (original !== modified) {
    files.push({ path: filePath, original, modified });
  }

  logger.info('composition', 'conversion complete', {
    className, parentName, forwardedMethods: parentMethods.length, filesChanged: files.length,
  });

  return createChangeSet(`Replace inheritance with composition in '${className}'`, files);
}
