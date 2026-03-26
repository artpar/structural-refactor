import type { Command } from 'commander';
import { createExecutionContext, createProject, handleResult } from '../execute.js';
import { renameSymbol } from '../../operations/rename/rename-symbol.js';
import { renameFile } from '../../operations/rename/rename-file.js';
import { parseTargetLocation } from '../../core/operation.js';

export function registerRename(program: Command): void {
  const rename = program
    .command('rename')
    .description('Rename symbols, files, or modules');

  rename
    .command('symbol <name>')
    .description('Rename a symbol across all files')
    .requiredOption('--to <newName>', 'New name for the symbol')
    .option('--path <file:line:col>', 'Location of the symbol')
    .action((name, opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const ctx = createExecutionContext(globalOpts);

      const loc = opts.path ? parseTargetLocation(opts.path) : undefined;
      if (!loc || loc.line === undefined || loc.col === undefined) {
        ctx.logger.error('rename', 'symbol rename requires --path <file:line:col>', { provided: opts.path });
        process.exitCode = 1;
        return;
      }

      const project = createProject(ctx);
      const cs = renameSymbol(project, {
        filePath: loc.file,
        line: loc.line,
        col: loc.col,
        newName: opts.to,
        logger: ctx.logger,
      });

      handleResult(ctx, cs);
    });

  rename
    .command('file <path>')
    .description('Rename/move a file, updating all imports')
    .requiredOption('--to <newPath>', 'New file path')
    .action((filePath, opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const ctx = createExecutionContext(globalOpts);

      const project = createProject(ctx);
      const cs = renameFile(project, {
        oldPath: filePath,
        newPath: opts.to,
        logger: ctx.logger,
      });

      handleResult(ctx, cs);
    });
}
