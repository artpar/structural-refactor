import type { Command } from 'commander';

export function registerType(program: Command): void {
  const type = program
    .command('type')
    .description('Type refactorings');

  type
    .command('migrate')
    .description('Change a type across the codebase')
    .requiredOption('--from <type>', 'Current type')
    .requiredOption('--to <type>', 'New type')
    .option('--scope <path>', 'Limit to directory')
    .action(() => {});

  type
    .command('safe-delete <name>')
    .description('Delete symbol only if unreferenced')
    .requiredOption('--path <file>', 'File containing the symbol')
    .action(() => {});

  type
    .command('convert')
    .description('Toggle between type alias and interface')
    .requiredOption('--path <file:line:col>', 'Location of the type/interface')
    .action(() => {});
}
