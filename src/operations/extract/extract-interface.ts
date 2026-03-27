import { Project, Scope } from 'ts-morph';
import type { ChangeSet } from '../../core/change-set.js';
import type { Logger } from '../../core/logger.js';
import { executeRefactoring, preconditionOk, preconditionFail } from '../engine.js';

export interface ExtractInterfaceArgs {
  filePath: string;
  className: string;
  interfaceName: string;
  logger: Logger;
}

export function extractInterface(project: Project, args: ExtractInterfaceArgs): ChangeSet {
  const { filePath, className, interfaceName, logger } = args;

  const sourceFile = project.getSourceFile(filePath);
  if (!sourceFile) {
    logger.warn('extract-interface', 'source file not found', { filePath });
    return executeRefactoring(
      project,
      'Extract interface (no changes)',
      () => preconditionFail(['source file not found']),
      () => {},
      logger,
    );
  }

  const classDecl = sourceFile.getClass(className);

  return executeRefactoring(
    project,
    `Extract interface '${interfaceName}' from '${className}'`,
    () => {
      if (!classDecl) {
        return preconditionFail([`class '${className}' not found in ${filePath}`]);
      }
      return preconditionOk();
    },
    () => {
      const cls = classDecl!;

      logger.info('extract-interface', 'extracting interface from class', {
        filePath, className, interfaceName,
      });

      // Build property and method signatures from public members
      const propertySignatures: Array<{ name: string; type: string; hasQuestionToken?: boolean }> = [];
      const methodSignatures: Array<{ name: string; parameters: Array<{ name: string; type: string }>; returnType: string }> = [];

      for (const prop of cls.getProperties()) {
        if (prop.getScope() === Scope.Private || prop.getScope() === Scope.Protected) continue;
        const typeNode = prop.getTypeNode();
        const typeText = typeNode ? typeNode.getText() : prop.getType().getText();
        propertySignatures.push({
          name: prop.getName(),
          type: typeText,
          hasQuestionToken: prop.hasQuestionToken(),
        });
      }

      for (const method of cls.getMethods()) {
        if (method.getScope() === Scope.Private || method.getScope() === Scope.Protected) continue;
        methodSignatures.push({
          name: method.getName(),
          parameters: method.getParameters().map((p) => ({
            name: p.getName(),
            type: p.getTypeNode()?.getText() ?? p.getType().getText(),
          })),
          returnType: method.getReturnTypeNode()?.getText() ?? method.getReturnType().getText(),
        });
      }

      // Insert interface before the class via ts-morph
      const classIndex = sourceFile.getStatements().indexOf(cls);
      sourceFile.insertInterface(classIndex, {
        name: interfaceName,
        properties: propertySignatures,
        methods: methodSignatures,
      });

      // Make the class implement the interface
      cls.addImplements(interfaceName);

      logger.info('extract-interface', 'extraction complete', {
        interfaceName,
        memberCount: propertySignatures.length + methodSignatures.length,
      });
    },
    logger,
  );
}
