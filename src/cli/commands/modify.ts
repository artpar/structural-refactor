import type { Command } from 'commander';
import { createExecutionContext, createProject, handleResult } from '../execute.js';
import { modifyDeclaration } from '../../operations/modify/modify-declaration.js';

export function registerModify(program: Command): void {
  program
    .command('modify <name>')
    .description('Modify declaration modifiers, parameters, types, keywords')
    .requiredOption('--path <file>', 'File containing the declaration')
    .option('--export', 'Add export keyword')
    .option('--no-export', 'Remove export keyword')
    .option('--default-export', 'Make default export')
    .option('--async', 'Add async keyword')
    .option('--no-async', 'Remove async keyword')
    .option('--static', 'Add static keyword')
    .option('--no-static', 'Remove static keyword')
    .option('--readonly', 'Add readonly keyword')
    .option('--no-readonly', 'Remove readonly keyword')
    .option('--abstract', 'Add abstract keyword')
    .option('--no-abstract', 'Remove abstract keyword')
    .option('--scope <visibility>', 'Set visibility (public, private, protected)')
    .option('--return-type <type>', 'Set return type')
    .option('--add-param <name:type>', 'Add parameter (repeatable)', (val: string, prev: string[]) => [...(prev || []), val], [])
    .option('--remove-param <name>', 'Remove parameter (repeatable)', (val: string, prev: string[]) => [...(prev || []), val], [])
    .option('--add-decorator <name>', 'Add decorator (repeatable)', (val: string, prev: string[]) => [...(prev || []), val], [])
    .option('--remove-decorator <name>', 'Remove decorator (repeatable)', (val: string, prev: string[]) => [...(prev || []), val], [])
    .option('--kind <const|let|var>', 'Change variable declaration kind')
    .action((name, opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const ctx = createExecutionContext(globalOpts);
      const project = createProject(ctx, [opts.path]);

      const addParams = (opts.addParam as string[])?.map((p: string) => {
        const [pName, pType] = p.split(':');
        return { name: pName, type: pType ?? 'any' };
      });

      const cs = modifyDeclaration(project, {
        filePath: opts.path,
        symbolName: name,
        exported: opts.export === false ? false : opts.export === true ? true : undefined,
        defaultExport: opts.defaultExport ?? undefined,
        isAsync: opts.async === false ? false : opts.async === true ? true : undefined,
        isStatic: opts.static === false ? false : opts.static === true ? true : undefined,
        isReadonly: opts.readonly === false ? false : opts.readonly === true ? true : undefined,
        isAbstract: opts.abstract === false ? false : opts.abstract === true ? true : undefined,
        scope: opts.scope,
        returnType: opts.returnType,
        addParams: addParams?.length ? addParams : undefined,
        removeParams: (opts.removeParam as string[])?.length ? opts.removeParam : undefined,
        addDecorators: (opts.addDecorator as string[])?.length ? opts.addDecorator : undefined,
        removeDecorators: (opts.removeDecorator as string[])?.length ? opts.removeDecorator : undefined,
        declarationKind: opts.kind,
        logger: ctx.logger,
      });

      handleResult(ctx, cs);
    });
}
