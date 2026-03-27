import type { Command } from 'commander';
import { createExecutionContext, createProject, handleResult } from '../execute.js';
import { cjsToEsm } from '../../operations/module/cjs-to-esm.js';
import { defaultToNamed } from '../../operations/module/default-to-named.js';

export function registerModule(program: Command): void {
  const mod = program
    .command('module')
    .description('Module system refactorings');

  mod
    .command('cjs-to-esm')
    .description('Convert CommonJS requires to ESM imports')
    .option('--path <file>', 'Single file (or omit for all)')
    .action((opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const ctx = createExecutionContext(globalOpts);
      const project = createProject(ctx, opts.path ? [opts.path] : undefined);
      const cs = cjsToEsm(project, { filePath: opts.path ?? '', logger: ctx.logger });
      handleResult(ctx, cs);
    });

  mod
    .command('default-to-named')
    .description('Convert default export to named export')
    .requiredOption('--path <file>', 'File to refactor')
    .action((opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const ctx = createExecutionContext(globalOpts);
      const project = createProject(ctx, [opts.path]);
      const cs = defaultToNamed(project, { filePath: opts.path, logger: ctx.logger });
      handleResult(ctx, cs);
    });
}
