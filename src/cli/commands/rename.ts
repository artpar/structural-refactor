import type { Command } from 'commander';

export function registerRename(program: Command): void {
  const rename = program
    .command('rename')
    .description('Rename symbols, files, or modules');

  rename
    .command('symbol <name>')
    .description('Rename a symbol across all files')
    .requiredOption('--to <newName>', 'New name for the symbol')
    .option('--path <file:line:col>', 'Location of the symbol')
    .action((_name, _opts) => {
      // TODO: implement
    });

  rename
    .command('file <path>')
    .description('Rename/move a file, updating all imports')
    .requiredOption('--to <newPath>', 'New file path')
    .action((_path, _opts) => {
      // TODO: implement
    });
}
