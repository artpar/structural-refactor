/**
 * Modify Declaration: change any modifier, parameter, type, or keyword on a declaration.
 * Covers: export, async, static, readonly, abstract, scope, return type,
 * parameters, decorators, declaration kind (const/let/var).
 * All via ts-morph API + executeRefactoring (cross-file snapshot/diff).
 */
import { Project, Node, Scope, VariableDeclarationKind } from 'ts-morph';
import type { ChangeSet } from '../../core/change-set.js';
import type { Logger } from '../../core/logger.js';
import { executeRefactoring, preconditionOk, preconditionFail } from '../engine.js';

export interface ModifyArgs {
  filePath: string;
  symbolName: string;
  exported?: boolean;
  defaultExport?: boolean;
  isAsync?: boolean;
  isStatic?: boolean;
  isReadonly?: boolean;
  isAbstract?: boolean;
  scope?: 'public' | 'private' | 'protected';
  returnType?: string;
  addParams?: { name: string; type: string; defaultValue?: string }[];
  removeParams?: string[];
  addDecorators?: string[];
  removeDecorators?: string[];
  declarationKind?: 'const' | 'let' | 'var';
  logger: Logger;
}

export function modifyDeclaration(project: Project, args: ModifyArgs): ChangeSet {
  const { filePath, symbolName, logger } = args;

  const sourceFile = project.getSourceFile(filePath);
  if (!sourceFile) {
    return executeRefactoring(project, 'Modify declaration',
      () => preconditionFail([`source file not found: ${filePath}`]), () => {}, logger);
  }

  // Find the declaration by name
  const decl =
    sourceFile.getFunction(symbolName) ??
    sourceFile.getClass(symbolName) ??
    sourceFile.getInterface(symbolName) ??
    sourceFile.getTypeAlias(symbolName) ??
    sourceFile.getEnum(symbolName) ??
    sourceFile.getVariableDeclaration(symbolName);

  if (!decl) {
    return executeRefactoring(project, 'Modify declaration',
      () => preconditionFail([`symbol '${symbolName}' not found in ${filePath}`]), () => {}, logger);
  }

  const changes: string[] = [];

  return executeRefactoring(
    project,
    `Modify '${symbolName}' in ${filePath}`,
    () => preconditionOk(),
    () => {
      // Export
      if (args.exported !== undefined && 'setIsExported' in decl) {
        (decl as any).setIsExported(args.exported);
        changes.push(args.exported ? 'add export' : 'remove export');
      }

      // Default export
      if (args.defaultExport !== undefined && 'setIsDefaultExport' in decl) {
        (decl as any).setIsDefaultExport(args.defaultExport);
        changes.push(args.defaultExport ? 'set default export' : 'remove default export');
      }

      // Async
      if (args.isAsync !== undefined && 'setIsAsync' in decl) {
        (decl as any).setIsAsync(args.isAsync);
        changes.push(args.isAsync ? 'add async' : 'remove async');
      }

      // Static (class members)
      if (args.isStatic !== undefined && 'setIsStatic' in decl) {
        (decl as any).setIsStatic(args.isStatic);
        changes.push(args.isStatic ? 'add static' : 'remove static');
      }

      // Readonly
      if (args.isReadonly !== undefined && 'setIsReadonly' in decl) {
        (decl as any).setIsReadonly(args.isReadonly);
        changes.push(args.isReadonly ? 'add readonly' : 'remove readonly');
      }

      // Abstract
      if (args.isAbstract !== undefined && 'setIsAbstract' in decl) {
        (decl as any).setIsAbstract(args.isAbstract);
        changes.push(args.isAbstract ? 'add abstract' : 'remove abstract');
      }

      // Scope (visibility)
      if (args.scope !== undefined && 'setScope' in decl) {
        const scopeMap = { public: Scope.Public, private: Scope.Private, protected: Scope.Protected };
        (decl as any).setScope(scopeMap[args.scope]);
        changes.push(`set scope ${args.scope}`);
      }

      // Return type
      if (args.returnType !== undefined && 'setReturnType' in decl) {
        (decl as any).setReturnType(args.returnType);
        changes.push(`set return type ${args.returnType}`);
      }

      // Add parameters
      if (args.addParams && 'addParameter' in decl) {
        for (const param of args.addParams) {
          (decl as any).addParameter({
            name: param.name,
            type: param.type,
            initializer: param.defaultValue,
          });
          changes.push(`add param ${param.name}: ${param.type}`);
        }
      }

      // Remove parameters
      if (args.removeParams && 'getParameters' in decl) {
        for (const paramName of args.removeParams) {
          const param = (decl as any).getParameter(paramName);
          if (param) {
            param.remove();
            changes.push(`remove param ${paramName}`);
          }
        }
      }

      // Add decorators
      if (args.addDecorators && 'addDecorator' in decl) {
        for (const name of args.addDecorators) {
          (decl as any).addDecorator({ name });
          changes.push(`add decorator @${name}`);
        }
      }

      // Remove decorators
      if (args.removeDecorators && 'getDecorators' in decl) {
        for (const name of args.removeDecorators) {
          const decs = (decl as any).getDecorators();
          const target = decs.find((d: any) => d.getName() === name);
          if (target) {
            target.remove();
            changes.push(`remove decorator @${name}`);
          }
        }
      }

      // Declaration kind (const/let/var)
      if (args.declarationKind !== undefined && Node.isVariableDeclaration(decl)) {
        const stmt = decl.getVariableStatement();
        if (stmt) {
          const kindMap = { const: VariableDeclarationKind.Const, let: VariableDeclarationKind.Let, var: VariableDeclarationKind.Var };
          stmt.setDeclarationKind(kindMap[args.declarationKind]);
          changes.push(`set kind ${args.declarationKind}`);
        }
      }

      logger.info('modify', 'applied modifications', { symbolName, changes });
    },
    logger,
  );
}
