import type { Command } from 'commander';
import path from 'node:path';
import { createExecutionContext, createProject, handleResult } from '../execute.js';
import { renameSymbol } from '../../operations/rename/rename-symbol.js';
import { renameFile } from '../../operations/rename/rename-file.js';
import { parseTargetLocation } from '../../core/operation.js';
import { createQueryEngine } from '../../query/engine.js';

export function registerRename(program: Command): void {
  const rename = program
    .command('rename')
    .description('Rename symbols, files, or modules');

  rename
    .command('symbol <name>')
    .description('Rename a symbol across all files')
    .requiredOption('--to <newName>', 'New name for the symbol')
    .option('--path <file:line:col>', 'Location of the symbol (optional — resolved by name if omitted)')
    .action((name, opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const ctx = createExecutionContext(globalOpts);

      let filePath: string;
      let line: number;
      let col: number;

      if (opts.path) {
        // Explicit location provided
        const loc = parseTargetLocation(opts.path);
        if (!loc.line || !loc.col) {
          ctx.logger.error('rename', '--path requires file:line:col format', { provided: opts.path });
          process.exitCode = 1;
          return;
        }
        filePath = loc.file;
        line = loc.line;
        col = loc.col;
      } else {
        // Resolve by name via discovery index
        ctx.logger.info('rename', 'resolving symbol by name', { name });
        const rootDir = process.cwd();
        const engine = createQueryEngine(rootDir, ctx.logger);
        const matches = engine.find(name);

        if (matches.length === 0) {
          ctx.logger.error('rename', `symbol '${name}' not found in project`, {});
          process.exitCode = 1;
          return;
        }

        if (matches.length > 1) {
          ctx.logger.error('rename', `multiple symbols named '${name}' found — use --path to disambiguate`, {
            matches: matches.map((m) => `${path.relative(rootDir, m.filePath)}:${m.line} (${m.kind})`),
          });
          process.exitCode = 1;
          return;
        }

        filePath = matches[0].filePath;
        line = matches[0].line;
        col = 1; // Start of the declaration line — ts-morph will find the identifier
      }

      const project = createProject(ctx);
      const cs = renameSymbol(project, {
        filePath,
        line,
        col,
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
