import type { Command } from 'commander';
import { createExecutionContext, createProject, handleResult } from '../execute.js';
import { changeSignature } from '../../operations/signature/change-signature.js';
import { toArrow } from '../../operations/signature/to-arrow.js';
import { toAsync } from '../../operations/signature/to-async.js';
import { parseTargetLocation } from '../../core/operation.js';

export function registerSignature(program: Command): void {
  const sig = program
    .command('signature')
    .description('Change function signatures');

  sig
    .command('change <fnName>')
    .description('Change function parameters')
    .requiredOption('--path <file>', 'Source file')
    .option('--add-param <name:type>', 'Add a parameter')
    .option('--remove-param <name>', 'Remove a parameter')
    .action((fnName, opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const ctx = createExecutionContext(globalOpts);
      const project = createProject(ctx, [opts.path]);
      const addParams = opts.addParam ? [{ name: opts.addParam.split(':')[0], type: opts.addParam.split(':')[1] ?? 'any' }] : undefined;
      const removeParams = opts.removeParam ? [opts.removeParam] : undefined;
      const cs = changeSignature(project, { filePath: opts.path, functionName: fnName, addParams, removeParams, logger: ctx.logger });
      handleResult(ctx, cs);
    });

  sig
    .command('to-arrow')
    .description('Convert function to arrow function')
    .requiredOption('--path <file:line:col>', 'Location of the function')
    .action((opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const ctx = createExecutionContext(globalOpts);
      const loc = parseTargetLocation(opts.path);
      if (!loc.line || !loc.col) { process.stderr.write('Error: --path requires file:line:col\n'); process.exitCode = 1; return; }
      const project = createProject(ctx, [loc.file]);
      const cs = toArrow(project, { filePath: loc.file, line: loc.line, col: loc.col, logger: ctx.logger });
      handleResult(ctx, cs);
    });

  sig
    .command('to-async')
    .description('Convert function to async')
    .requiredOption('--path <file:line:col>', 'Location of the function')
    .action((opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const ctx = createExecutionContext(globalOpts);
      const loc = parseTargetLocation(opts.path);
      if (!loc.line || !loc.col) { process.stderr.write('Error: --path requires file:line:col\n'); process.exitCode = 1; return; }
      const project = createProject(ctx, [loc.file]);
      const cs = toAsync(project, { filePath: loc.file, line: loc.line, col: loc.col, logger: ctx.logger });
      handleResult(ctx, cs);
    });
}
