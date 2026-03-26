import type { Command } from 'commander';

export function registerModule(program: Command): void {
  const mod = program
    .command('module')
    .description('Module system refactorings');

  mod
    .command('cjs-to-esm')
    .description('Convert CommonJS requires to ESM imports')
    .option('--scope <path>', 'Limit to directory')
    .action(() => {});

  mod
    .command('esm-to-cjs')
    .description('Convert ESM imports to CommonJS requires')
    .option('--scope <path>', 'Limit to directory')
    .action(() => {});

  mod
    .command('default-to-named')
    .description('Convert default export to named export')
    .requiredOption('--path <file>', 'File to refactor')
    .action(() => {});

  mod
    .command('named-to-default')
    .description('Convert named export to default export')
    .requiredOption('--path <file>', 'File to refactor')
    .requiredOption('--export <name>', 'Name of the export')
    .action(() => {});

  mod
    .command('barrel')
    .description('Generate or update barrel file (index.ts)')
    .requiredOption('--path <dir>', 'Directory to barrel')
    .action(() => {});
}
