import type { Command } from 'commander';

export function registerQuality(program: Command): void {
  const quality = program
    .command('quality')
    .description('Code quality refactorings');

  const notImpl = (name: string) => () => {
    process.stderr.write(`Error: '${name}' is not yet implemented\n`);
    process.exitCode = 1;
  };

  quality.command('find-duplicates').description('Find and refactor duplicate code')
    .option('--scope <path>', 'Limit to directory').action(notImpl('find-duplicates'));

  quality.command('dead-code').description('Find and remove unreferenced exports')
    .option('--scope <path>', 'Limit to directory').action(notImpl('dead-code'));

  quality.command('promises-to-async').description('Convert Promise chains to async/await')
    .option('--scope <path>', 'Limit to directory').action(notImpl('promises-to-async'));

  quality.command('callbacks-to-promises').description('Convert callback patterns to Promises')
    .option('--scope <path>', 'Limit to directory').action(notImpl('callbacks-to-promises'));
}
