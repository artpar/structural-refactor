import type { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { createExecutionContext } from '../execute.js';
import { defaultConfig } from '../../core/config.js';

export function registerInit(program: Command): void {
  program
    .command('init')
    .description('Initialize sref in the current project')
    .action((_opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const ctx = createExecutionContext(globalOpts);
      const cwd = ctx.cwd;

      const srefDir = path.join(cwd, '.sref');
      const configFile = path.join(srefDir, 'config.json');

      // Check for tsconfig.json
      const tsconfigPath = path.resolve(cwd, ctx.tsconfig);
      const hasTsConfig = fs.existsSync(tsconfigPath);

      if (!hasTsConfig) {
        process.stderr.write(
          `Warning: tsconfig.json not found at ${tsconfigPath}\n` +
          `  sref needs a TypeScript config to resolve types and references.\n` +
          `  You can specify one later with --tsconfig or in .sref/config.json\n\n`,
        );
      }

      // Create .sref directory
      if (!fs.existsSync(srefDir)) {
        fs.mkdirSync(srefDir, { recursive: true });
        ctx.logger.debug('init', 'created .sref directory', { path: srefDir });
      }

      // Write config file
      if (fs.existsSync(configFile)) {
        process.stdout.write(`Config already exists: ${configFile}\n`);
      } else {
        const config = defaultConfig();
        fs.writeFileSync(configFile, JSON.stringify(config, null, 2) + '\n', 'utf-8');
        process.stdout.write(`Created ${path.relative(cwd, configFile)}\n`);
      }

      // Offer to add .sref/ to .gitignore
      const gitignorePath = path.join(cwd, '.gitignore');
      if (fs.existsSync(gitignorePath)) {
        const gitignore = fs.readFileSync(gitignorePath, 'utf-8');
        if (!gitignore.includes('.sref')) {
          fs.appendFileSync(gitignorePath, '\n# sref undo history\n.sref/\n');
          process.stdout.write('Added .sref/ to .gitignore\n');
        }
      } else if (fs.existsSync(path.join(cwd, '.git'))) {
        fs.writeFileSync(gitignorePath, '# sref undo history\n.sref/\n', 'utf-8');
        process.stdout.write('Created .gitignore with .sref/ entry\n');
      }

      // Print next steps
      process.stdout.write(`
Ready! Try these commands:

  sref discover list              List all symbols in the project
  sref discover find <name>       Find a specific symbol
  sref rename symbol <n> --to <n> Rename across the project (use --dry-run first)
  sref analyze deps               View dependency tree

`);
    });
}
