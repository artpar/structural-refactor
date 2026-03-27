import type { Command } from 'commander';
import { createExecutionContext, createProject, handleResult } from '../execute.js';
import { inlineVariable } from '../../operations/inline/inline-variable.js';
import { inlineFunction } from '../../operations/inline/inline-function.js';
import { inlineTypeAlias } from '../../operations/inline/inline-type-alias.js';
import { parseTargetLocation } from '../../core/operation.js';

export function registerInline(program: Command): void {
  const inline = program
    .command('inline')
    .description('Inline declarations at their usage sites');

  inline
    .command('variable')
    .description('Inline a variable at all usage sites')
    .requiredOption('--path <file:line:col>', 'Location of the variable')
    .action((opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const ctx = createExecutionContext(globalOpts);
      const loc = parseTargetLocation(opts.path);
      if (!loc.line || !loc.col) { process.stderr.write('Error: --path requires file:line:col\n'); process.exitCode = 1; return; }
      const project = createProject(ctx, [loc.file]);
      const cs = inlineVariable(project, { filePath: loc.file, line: loc.line, col: loc.col, logger: ctx.logger });
      handleResult(ctx, cs);
    });

  inline
    .command('function')
    .description('Inline a function at all call sites')
    .requiredOption('--path <file:line:col>', 'Location of the function')
    .action((opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const ctx = createExecutionContext(globalOpts);
      const loc = parseTargetLocation(opts.path);
      if (!loc.line || !loc.col) { process.stderr.write('Error: --path requires file:line:col\n'); process.exitCode = 1; return; }
      const project = createProject(ctx, [loc.file]);
      const cs = inlineFunction(project, { filePath: loc.file, line: loc.line, col: loc.col, logger: ctx.logger });
      handleResult(ctx, cs);
    });

  inline
    .command('type-alias')
    .description('Inline a type alias at all usage sites')
    .requiredOption('--path <file:line:col>', 'Location of the type alias')
    .action((opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const ctx = createExecutionContext(globalOpts);
      const loc = parseTargetLocation(opts.path);
      if (!loc.line || !loc.col) { process.stderr.write('Error: --path requires file:line:col\n'); process.exitCode = 1; return; }
      const project = createProject(ctx, [loc.file]);
      const cs = inlineTypeAlias(project, { filePath: loc.file, line: loc.line, col: loc.col, logger: ctx.logger });
      handleResult(ctx, cs);
    });
}
