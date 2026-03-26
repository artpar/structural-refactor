import { Command } from 'commander';
import { registerRename } from './commands/rename.js';
import { registerExtract } from './commands/extract.js';
import { registerInline } from './commands/inline.js';
import { registerMove } from './commands/move.js';
import { registerMember } from './commands/member.js';
import { registerSignature } from './commands/signature.js';
import { registerType } from './commands/type.js';
import { registerModule } from './commands/module.js';
import { registerQuality } from './commands/quality.js';
import { registerClass } from './commands/class.js';

export function createProgram(): Command {
  const program = new Command();

  program
    .name('sref')
    .description('Structural refactoring CLI for JavaScript/TypeScript')
    .version('0.1.0')
    .option('--dry-run', 'Preview changes without applying', false)
    .option('--json', 'Output as JSON', false)
    .option('--verbose', 'Show detailed operation log', false)
    .option('--tsconfig <path>', 'Path to tsconfig.json')
    .option('--scope <path>', 'Limit to directory subset')
    .option('--no-confirm', 'Skip confirmation prompts');

  registerRename(program);
  registerExtract(program);
  registerInline(program);
  registerMove(program);
  registerMember(program);
  registerSignature(program);
  registerType(program);
  registerModule(program);
  registerQuality(program);
  registerClass(program);

  return program;
}

export function run(argv: string[]): void {
  const program = createProgram();
  program.parse(argv);
}
