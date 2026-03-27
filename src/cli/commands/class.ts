import type { Command } from 'commander';
import { createExecutionContext, createProject, handleResult } from '../execute.js';
import { classToFunctions } from '../../operations/class/to-functions.js';
import { replaceInheritanceWithComposition } from '../../operations/class/composition.js';

export function registerClass(program: Command): void {
  const cls = program
    .command('class')
    .description('Class refactorings');

  cls
    .command('to-functions')
    .description('Convert class to standalone functions')
    .requiredOption('--path <file>', 'File containing the class')
    .requiredOption('--class <className>', 'Class to convert')
    .action((opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const ctx = createExecutionContext(globalOpts);
      const project = createProject(ctx, [opts.path]);
      const cs = classToFunctions(project, { filePath: opts.path, className: opts.class, logger: ctx.logger });
      handleResult(ctx, cs);
    });

  cls
    .command('composition')
    .description('Replace inheritance with composition')
    .requiredOption('--path <file>', 'File containing the class')
    .requiredOption('--class <className>', 'Class to refactor')
    .action((opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const ctx = createExecutionContext(globalOpts);
      const project = createProject(ctx, [opts.path]);
      const cs = replaceInheritanceWithComposition(project, { filePath: opts.path, className: opts.class, logger: ctx.logger });
      handleResult(ctx, cs);
    });
}
