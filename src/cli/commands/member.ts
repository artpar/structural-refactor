import type { Command } from 'commander';
import { createExecutionContext, createProject, handleResult } from '../execute.js';
import { encapsulateField } from '../../operations/member/encapsulate.js';

export function registerMember(program: Command): void {
  const member = program
    .command('member')
    .description('Organize class members');

  member
    .command('encapsulate <fieldName>')
    .description('Generate getter/setter for a field')
    .requiredOption('--class <className>', 'Class containing the field')
    .requiredOption('--path <file>', 'File containing the class')
    .action((fieldName, opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const ctx = createExecutionContext(globalOpts);
      const project = createProject(ctx, [opts.path]);
      const cs = encapsulateField(project, { filePath: opts.path, className: opts.class, fieldName, logger: ctx.logger });
      handleResult(ctx, cs);
    });
}
