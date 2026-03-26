import { Project, Node, Scope } from 'ts-morph';
import type { ChangeSet, FileChange } from '../../core/change-set.js';
import { createChangeSet } from '../../core/change-set.js';
import type { Logger } from '../../core/logger.js';

export interface ClassToFunctionsArgs {
  filePath: string;
  className: string;
  logger: Logger;
}

export function classToFunctions(project: Project, args: ClassToFunctionsArgs): ChangeSet {
  const { filePath, className, logger } = args;

  const sourceFile = project.getSourceFile(filePath);
  if (!sourceFile) {
    logger.warn('class-to-functions', 'source file not found', { filePath });
    return createChangeSet('Class to functions (no changes)', []);
  }

  const classDecl = sourceFile.getClass(className);
  if (!classDecl) {
    logger.warn('class-to-functions', 'class not found', { className, filePath });
    return createChangeSet('Class to functions (class not found)', []);
  }

  logger.info('class-to-functions', 'converting class to functions', { className, filePath });

  const original = sourceFile.getFullText();
  const isExported = classDecl.isExported();
  const exportPrefix = isExported ? 'export ' : '';

  // Build standalone functions from class methods
  const functions: string[] = [];

  for (const method of classDecl.getMethods()) {
    if (method.getScope() === Scope.Private) continue;

    const name = method.getName();
    const params = method.getParameters().map((p) => p.getText()).join(', ');
    const returnType = method.getReturnTypeNode()?.getText();
    const returnAnnotation = returnType ? `: ${returnType}` : '';
    const isAsync = method.isAsync();
    const asyncPrefix = isAsync ? 'async ' : '';
    const body = method.getBody()?.getText() ?? '{}';

    functions.push(`${exportPrefix}${asyncPrefix}function ${name}(${params})${returnAnnotation} ${body}`);
  }

  // Replace the class with the functions
  const classStart = classDecl.getStart();
  const classEnd = classDecl.getEnd();

  const functionsText = functions.join('\n\n');
  const modified = original.slice(0, classStart) + functionsText + original.slice(classEnd);

  const files: FileChange[] = [];
  if (original !== modified) {
    files.push({ path: filePath, original, modified });
  }

  logger.info('class-to-functions', 'conversion complete', {
    className, functionCount: functions.length, filesChanged: files.length,
  });

  return createChangeSet(`Convert class '${className}' to functions`, files);
}
