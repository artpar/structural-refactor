import type { Command } from 'commander';

export function registerMember(program: Command): void {
  const member = program
    .command('member')
    .description('Organize class members');

  member
    .command('pull-up <name>')
    .description('Move member to parent class/interface')
    .requiredOption('--class <className>', 'Class containing the member')
    .action(() => {});

  member
    .command('push-down <name>')
    .description('Move member to subclasses')
    .requiredOption('--class <className>', 'Class containing the member')
    .action(() => {});

  member
    .command('encapsulate <fieldName>')
    .description('Generate getter/setter for a field')
    .requiredOption('--class <className>', 'Class containing the field')
    .action(() => {});
}
