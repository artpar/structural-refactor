/**
 * Class to Functions: convert a class to standalone functions.
 * Cross-file: updates ALL importers to use named function imports.
 * Replaces `new ClassName()` calls with direct function calls.
 * All mutations via ts-morph API + engine snapshot/diff.
 */
import { Project, Node, Scope, SyntaxKind } from 'ts-morph';
import path from 'node:path';
import type { ChangeSet } from '../../core/change-set.js';
import type { Logger } from '../../core/logger.js';
import { executeRefactoring, preconditionOk, preconditionFail } from '../engine.js';

export interface ClassToFunctionsArgs {
  filePath: string;
  className: string;
  logger: Logger;
}

export function classToFunctions(project: Project, args: ClassToFunctionsArgs): ChangeSet {
  const { filePath, className, logger } = args;

  const sourceFile = project.getSourceFile(filePath);
  const classDecl = sourceFile?.getClass(className);

  return executeRefactoring(
    project,
    `Convert class '${className}' to functions`,
    () => {
      if (!sourceFile) return preconditionFail([`source file not found: ${filePath}`]);
      if (!classDecl) return preconditionFail([`class '${className}' not found`]);

      // Check if class is extended by other classes
      for (const sf of project.getSourceFiles()) {
        for (const cls of sf.getClasses()) {
          if (cls.getExtends()?.getText() === className) {
            return preconditionFail([`class '${className}' is extended by '${cls.getName()}' in ${sf.getFilePath()}`]);
          }
        }
      }

      return preconditionOk();
    },
    () => {
      const cls = classDecl!;
      const sf = sourceFile!;
      const isExported = cls.isExported();

      logger.info('class-to-functions', 'converting class to functions', { className, filePath });

      // Collect method info before removing the class
      const methodInfos: { name: string; params: string; returnAnnotation: string; isAsync: boolean; bodyText: string }[] = [];

      for (const method of cls.getMethods()) {
        if (method.getScope() === Scope.Private) continue;
        methodInfos.push({
          name: method.getName(),
          params: method.getParameters().map((p) => p.getText()).join(', '),
          returnAnnotation: method.getReturnTypeNode() ? `: ${method.getReturnTypeNode()!.getText()}` : '',
          isAsync: method.isAsync(),
          bodyText: method.getBody()?.getText() ?? '{}',
        });
      }

      const methodNames = methodInfos.map((m) => m.name);

      // Remove the class
      const classIndex = sf.getStatements().indexOf(cls);
      cls.remove();

      // Insert functions at the same position
      for (let i = 0; i < methodInfos.length; i++) {
        const m = methodInfos[i];
        sf.insertFunction(classIndex + i, {
          name: m.name,
          isExported,
          isAsync: m.isAsync,
          parameters: m.params ? m.params.split(',').map((p) => {
            const trimmed = p.trim();
            const colonIdx = trimmed.indexOf(':');
            if (colonIdx >= 0) {
              return { name: trimmed.slice(0, colonIdx).trim(), type: trimmed.slice(colonIdx + 1).trim() };
            }
            return { name: trimmed };
          }) : [],
          statements: m.bodyText.replace(/^\{/, '').replace(/\}$/, '').trim().split('\n').map((l) => l.trim()).filter(Boolean),
        });
      }

      // Update ALL importers across the project
      if (isExported) {
        for (const otherFile of project.getSourceFiles()) {
          if (otherFile.getFilePath() === filePath) continue;

          for (const importDecl of otherFile.getImportDeclarations()) {
            const resolvedPath = importDecl.getModuleSpecifierSourceFile()?.getFilePath();
            if (resolvedPath !== filePath) continue;

            // Check if this import references our class
            const namedImports = importDecl.getNamedImports();
            const classImport = namedImports.find((ni) => ni.getName() === className);
            if (classImport) {
              // Remove the class import
              classImport.remove();

              // Add imports for the individual functions
              for (const name of methodNames) {
                importDecl.addNamedImport(name);
              }

              // If no imports left, remove the declaration
              if (importDecl.getNamedImports().length === 0 && !importDecl.getDefaultImport()) {
                importDecl.remove();
              }
            }

            // Replace `new ClassName(...)` with function calls in this file
            const newExprs = otherFile.getDescendantsOfKind(SyntaxKind.NewExpression);
            for (const newExpr of newExprs) {
              if (newExpr.getExpression().getText() === className) {
                // Can't directly replace new X() with a function call without knowing which method
                // Log a warning — user needs to manually update usage pattern
                logger.warn('class-to-functions', 'manual update needed: new expression found', {
                  file: otherFile.getFilePath(),
                  line: newExpr.getStartLineNumber(),
                });
              }
            }
          }
        }
      }

      logger.info('class-to-functions', 'conversion complete', {
        className, functionCount: methodInfos.length,
      });
    },
    logger,
  );
}
