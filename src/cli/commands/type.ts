import type { Command } from 'commander';
import { createExecutionContext, createProject, handleResult } from '../execute.js';
import { safeDelete } from '../../operations/type/safe-delete.js';
import { convertTypeInterface } from '../../operations/type/convert-type-interface.js';
import { parseTargetLocation } from '../../core/operation.js';

export function registerType(program: Command): void {
  const type = program
    .command('type')
    .description('Type refactorings');

  type
    .command('safe-delete <name>')
    .description('Delete symbol only if unreferenced')
    .requiredOption('--path <file>', 'File containing the symbol')
    .action((name, opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const ctx = createExecutionContext(globalOpts);
      const project = createProject(ctx, [opts.path]);
      const cs = safeDelete(project, { filePath: opts.path, symbolName: name, logger: ctx.logger });
      handleResult(ctx, cs);
    });

  type
    .command('convert')
    .description('Toggle between type alias and interface')
    .requiredOption('--path <file:line:col>', 'Location of the type/interface')
    .action((opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const ctx = createExecutionContext(globalOpts);
      const loc = parseTargetLocation(opts.path);
      if (!loc.line || !loc.col) { process.stderr.write('Error: --path requires file:line:col\n'); process.exitCode = 1; return; }
      const project = createProject(ctx, [loc.file]);
      const cs = convertTypeInterface(project, { filePath: loc.file, line: loc.line, col: loc.col, logger: ctx.logger });
      handleResult(ctx, cs);
    });
}
