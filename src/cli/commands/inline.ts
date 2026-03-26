import type { Command } from 'commander';

export function registerInline(program: Command): void {
  const inline = program
    .command('inline')
    .description('Inline declarations at their usage sites');

  inline
    .command('variable')
    .description('Inline a variable at all usage sites')
    .requiredOption('--path <file:line:col>', 'Location of the variable')
    .action(() => {});

  inline
    .command('function')
    .description('Inline a function at all call sites')
    .requiredOption('--path <file:line:col>', 'Location of the function')
    .action(() => {});

  inline
    .command('type-alias')
    .description('Inline a type alias at all usage sites')
    .requiredOption('--path <file:line:col>', 'Location of the type alias')
    .action(() => {});
}
