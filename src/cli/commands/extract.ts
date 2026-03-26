import type { Command } from 'commander';

export function registerExtract(program: Command): void {
  const extract = program
    .command('extract')
    .description('Extract code into new declarations');

  const rangeOpts = (cmd: Command) =>
    cmd
      .requiredOption('--path <file>', 'Source file')
      .requiredOption('--start <line:col>', 'Start of selection')
      .requiredOption('--end <line:col>', 'End of selection')
      .requiredOption('--name <name>', 'Name for extracted declaration');

  rangeOpts(extract.command('function').description('Extract selection into a function'))
    .action(() => {});

  rangeOpts(extract.command('variable').description('Extract expression into a variable'))
    .action(() => {});

  rangeOpts(extract.command('constant').description('Extract expression into a constant'))
    .action(() => {});

  rangeOpts(extract.command('parameter').description('Extract expression into a parameter'))
    .action(() => {});

  extract
    .command('interface')
    .description('Extract interface from class')
    .requiredOption('--path <file>', 'Source file')
    .requiredOption('--class <className>', 'Class to extract from')
    .requiredOption('--name <name>', 'Interface name')
    .action(() => {});

  rangeOpts(extract.command('type-alias').description('Extract type into a type alias'))
    .action(() => {});

  rangeOpts(extract.command('component').description('Extract JSX into a React component'))
    .action(() => {});

  extract
    .command('parameter-object')
    .description('Group parameters into an object')
    .requiredOption('--path <file>', 'Source file')
    .requiredOption('--function <fnName>', 'Function name')
    .requiredOption('--params <names>', 'Comma-separated parameter names')
    .requiredOption('--name <name>', 'Name for parameter object type')
    .action(() => {});
}
