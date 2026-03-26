import type { Command } from 'commander';

export function registerSignature(program: Command): void {
  const sig = program
    .command('signature')
    .description('Change function signatures');

  sig
    .command('change <fnName>')
    .description('Change function parameters')
    .requiredOption('--path <file>', 'Source file')
    .option('--add-param <name:type>', 'Add a parameter')
    .option('--remove-param <name>', 'Remove a parameter')
    .option('--reorder <names>', 'Comma-separated parameter order')
    .action(() => {});

  sig
    .command('to-arrow')
    .description('Convert function to arrow function')
    .requiredOption('--path <file:line:col>', 'Location of the function')
    .action(() => {});

  sig
    .command('to-function')
    .description('Convert arrow function to function declaration')
    .requiredOption('--path <file:line:col>', 'Location of the arrow function')
    .action(() => {});

  sig
    .command('to-async')
    .description('Convert function to async')
    .requiredOption('--path <file:line:col>', 'Location of the function')
    .action(() => {});

  sig
    .command('toggle-optional')
    .description('Toggle a parameter between required and optional')
    .requiredOption('--path <file>', 'Source file')
    .requiredOption('--function <fnName>', 'Function name')
    .requiredOption('--param <paramName>', 'Parameter name')
    .action(() => {});
}
