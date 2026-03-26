import type { Command } from 'commander';

export function registerClass(program: Command): void {
  const cls = program
    .command('class')
    .description('Class refactorings');

  cls
    .command('to-functions')
    .description('Convert class to standalone functions')
    .requiredOption('--path <file>', 'File containing the class')
    .requiredOption('--class <className>', 'Class to convert')
    .action(() => {});

  cls
    .command('from-functions')
    .description('Group functions into a class')
    .requiredOption('--path <file>', 'File containing the functions')
    .requiredOption('--functions <names>', 'Comma-separated function names')
    .requiredOption('--name <className>', 'Class name')
    .action(() => {});

  cls
    .command('composition')
    .description('Replace inheritance with composition')
    .requiredOption('--path <file>', 'File containing the class')
    .requiredOption('--class <className>', 'Class to refactor')
    .action(() => {});
}
