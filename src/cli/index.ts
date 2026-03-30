import { Command } from 'commander';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

function readVersion(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  while (dir !== path.dirname(dir)) {
    const candidate = path.join(dir, 'package.json');
    if (fs.existsSync(candidate)) {
      const pkg = JSON.parse(fs.readFileSync(candidate, 'utf-8'));
      if (pkg.name === 'structural-refactor') return pkg.version;
    }
    dir = path.dirname(dir);
  }
  return '0.0.0';
}
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
import { registerAnalyze } from './commands/analyze.js';
import { registerDiscover } from './commands/discover.js';
import { registerPatterns } from './commands/patterns.js';
import { registerUndo } from './commands/undo.js';
import { registerModify } from './commands/modify.js';
import { registerInit } from './commands/init.js';

export function createProgram(): Command {
  const program = new Command();

  program
    .name('sref')
    .description('Structural refactoring CLI for JavaScript/TypeScript')
    .version(readVersion())
    .option('--dry-run', 'Preview changes without applying', false)
    .option('--json', 'Output as JSON', false)
    .option('--verbose', 'Show detailed operation log', false)
    .option('--tsconfig <path>', 'Path to tsconfig.json')
    .option('--scope <path>', 'Limit to directory subset')
    .option('--no-confirm', 'Skip confirmation prompts')
    .option('--no-color', 'Disable colored output')
    .hook('preAction', (_thisCommand, actionCommand) => {
      const opts = actionCommand.optsWithGlobals();
      if (opts['color'] === false) {
        process.env['NO_COLOR'] = '1';
      }
    });

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
  registerAnalyze(program);
  registerDiscover(program);
  registerPatterns(program);
  registerUndo(program);
  registerModify(program);
  registerInit(program);

  program.addHelpText('after', `
Examples:
  $ sref init                                    Set up sref in your project
  $ sref discover list                           List all symbols
  $ sref discover find createUser                Find a specific symbol
  $ sref rename symbol Foo --to Bar --dry-run    Preview a rename
  $ sref analyze deps                            View dependency tree
  $ sref undo                                    Undo last operation
`);

  return program;
}

export function run(argv: string[]): void {
  const program = createProgram();
  program.parse(argv);
}
