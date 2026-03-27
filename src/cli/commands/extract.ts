import type { Command } from 'commander';
import { createExecutionContext, createProject, handleResult } from '../execute.js';
import { extractVariable } from '../../operations/extract/extract-variable.js';
import { extractFunction } from '../../operations/extract/extract-function.js';
import { extractInterface } from '../../operations/extract/extract-interface.js';
import { parseTargetLocation } from '../../core/operation.js';

export function registerExtract(program: Command): void {
  const extract = program
    .command('extract')
    .description('Extract code into new declarations');

  extract
    .command('variable')
    .description('Extract expression into a variable')
    .requiredOption('--path <file>', 'Source file')
    .requiredOption('--start <line:col>', 'Start of selection')
    .requiredOption('--end <line:col>', 'End of selection')
    .requiredOption('--name <name>', 'Name for extracted variable')
    .option('--kind <const|let>', 'Declaration kind', 'const')
    .action((opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const ctx = createExecutionContext(globalOpts);
      const start = parseTargetLocation(`x:${opts.start}`);
      const end = parseTargetLocation(`x:${opts.end}`);
      const project = createProject(ctx, [opts.path]);
      const cs = extractVariable(project, {
        filePath: opts.path, startLine: start.line!, startCol: start.col!,
        endLine: end.line!, endCol: end.col!, variableName: opts.name,
        kind: opts.kind as 'const' | 'let', logger: ctx.logger,
      });
      handleResult(ctx, cs);
    });

  extract
    .command('function')
    .description('Extract selection into a function')
    .requiredOption('--path <file>', 'Source file')
    .requiredOption('--start <line:col>', 'Start of selection')
    .requiredOption('--end <line:col>', 'End of selection')
    .requiredOption('--name <name>', 'Function name')
    .action((opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const ctx = createExecutionContext(globalOpts);
      const start = parseTargetLocation(`x:${opts.start}`);
      const end = parseTargetLocation(`x:${opts.end}`);
      const project = createProject(ctx, [opts.path]);
      const cs = extractFunction(project, {
        filePath: opts.path, startLine: start.line!, startCol: start.col!,
        endLine: end.line!, endCol: end.col!, functionName: opts.name, logger: ctx.logger,
      });
      handleResult(ctx, cs);
    });

  extract
    .command('interface')
    .description('Extract interface from class')
    .requiredOption('--path <file>', 'Source file')
    .requiredOption('--class <className>', 'Class to extract from')
    .requiredOption('--name <name>', 'Interface name')
    .action((opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const ctx = createExecutionContext(globalOpts);
      const project = createProject(ctx, [opts.path]);
      const cs = extractInterface(project, {
        filePath: opts.path, className: opts.class, interfaceName: opts.name, logger: ctx.logger,
      });
      handleResult(ctx, cs);
    });
}
