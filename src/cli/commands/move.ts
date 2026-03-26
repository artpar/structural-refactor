import type { Command } from 'commander';

export function registerMove(program: Command): void {
  const move = program
    .command('move')
    .description('Move symbols, files, or members');

  move
    .command('symbol <name>')
    .description('Move an exported symbol to another file')
    .requiredOption('--from <file>', 'Source file')
    .requiredOption('--to <file>', 'Target file')
    .action(() => {});

  move
    .command('file <path>')
    .description('Move a file, updating all imports')
    .requiredOption('--to <newPath>', 'New file path')
    .action(() => {});

  move
    .command('member <name>')
    .description('Move a class member to another class')
    .requiredOption('--from <className>', 'Source class')
    .requiredOption('--to <className>', 'Target class')
    .action(() => {});
}
