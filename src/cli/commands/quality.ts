import type { Command } from 'commander';
import path from 'node:path';
import fg from 'fast-glob';
import { createExecutionContext, createProject, handleResult } from '../execute.js';
import { deduplicate } from '../../operations/quality/deduplicate.js';

export function registerQuality(program: Command): void {
  const quality = program
    .command('quality')
    .description('Code quality refactorings');

  const notImpl = (name: string) => () => {
    process.stderr.write(`Error: '${name}' is not yet implemented\n`);
    process.exitCode = 1;
  };

  quality
    .command('deduplicate <name>')
    .description('Replace all duplicate definitions with imports from a canonical source')
    .requiredOption('--canonical <file>', 'File containing the canonical definition')
    .option('--scope <dir>', 'Limit to files in this directory')
    .action((name, opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const ctx = createExecutionContext(globalOpts);
      const canonicalFile = path.resolve(opts.canonical);
      const scopeDir = opts.scope ? path.resolve(opts.scope) : process.cwd();
      const scopeFiles = fg.sync('**/*.{ts,tsx,js,jsx}', { cwd: scopeDir, absolute: true, ignore: ['**/node_modules/**', '**/dist/**'] });
      const project = createProject(ctx, [canonicalFile, ...scopeFiles]);
      const cs = deduplicate(project, {
        symbolName: name,
        canonicalFile,
        scope: opts.scope,
        logger: ctx.logger,
      });
      handleResult(ctx, cs);
    });

  quality.command('find-duplicates').description('Find and refactor duplicate code')
    .option('--scope <path>', 'Limit to directory').action(notImpl('find-duplicates'));

  quality.command('dead-code').description('Find and remove unreferenced exports')
    .option('--scope <path>', 'Limit to directory').action(notImpl('dead-code'));

  quality.command('promises-to-async').description('Convert Promise chains to async/await')
    .option('--scope <path>', 'Limit to directory').action(notImpl('promises-to-async'));

  quality.command('callbacks-to-promises').description('Convert callback patterns to Promises')
    .option('--scope <path>', 'Limit to directory').action(notImpl('callbacks-to-promises'));
}
