import type { Command } from 'commander';
import path from 'node:path';
import { createExecutionContext, createProject, handleResult } from '../execute.js';
import { moveSymbol } from '../../operations/move/move-symbol.js';
import { renameFile } from '../../operations/rename/rename-file.js';

export function registerMove(program: Command): void {
  const move = program
    .command('move')
    .description('Move symbols, files, or members');

  move
    .command('symbol <name>')
    .description('Move an exported symbol to another file')
    .requiredOption('--from <file>', 'Source file')
    .requiredOption('--to <file>', 'Target file')
    .action((name, opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const ctx = createExecutionContext(globalOpts);
      const project = createProject(ctx);

      const cs = moveSymbol(project, {
        symbolName: name,
        fromFile: path.resolve(opts.from),
        toFile: path.resolve(opts.to),
        logger: ctx.logger,
      });

      handleResult(ctx, cs);
    });

  move
    .command('file <path>')
    .description('Move a file, updating all imports')
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

  move
    .command('member <name>')
    .description('Move a class member to another class')
    .requiredOption('--from <className>', 'Source class')
    .requiredOption('--to <className>', 'Target class')
    .action((_name, _opts, _cmd) => {
      // TODO: implement in Phase 5
      console.error('move member: not yet implemented');
      process.exitCode = 1;
    });
}
