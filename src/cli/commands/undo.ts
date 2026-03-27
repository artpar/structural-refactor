import type { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { createExecutionContext } from '../execute.js';
import { deserializeUndoStack, popUndo, serializeUndoStack } from '../../core/undo.js';

export function registerUndo(program: Command): void {
  program
    .command('undo')
    .description('Undo the last refactoring operation')
    .action((_opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const ctx = createExecutionContext(globalOpts);
      const cwd = process.cwd();

      const undoFile = path.join(cwd, '.sref', 'undo-stack.json');

      if (!fs.existsSync(undoFile)) {
        ctx.logger.info('undo', 'no undo history found', {});
        process.stdout.write('Nothing to undo.\n');
        return;
      }

      const stackJson = fs.readFileSync(undoFile, 'utf-8');
      const stack = deserializeUndoStack(stackJson);

      const [entry, newStack] = popUndo(stack);

      if (!entry) {
        ctx.logger.info('undo', 'undo stack is empty', {});
        process.stdout.write('Nothing to undo.\n');
        return;
      }

      ctx.logger.info('undo', 'undoing operation', {
        description: entry.description,
        fileCount: entry.files.length,
      });

      // Apply the reverse changes (entry.files contains the reversed changeset)
      for (const file of entry.files) {
        ctx.logger.debug('undo', 'restoring file', { path: file.path });
        fs.writeFileSync(file.path, file.modified, 'utf-8');
      }

      // Save updated stack
      fs.writeFileSync(undoFile, serializeUndoStack(newStack), 'utf-8');

      process.stdout.write(`Undone: ${entry.description} (${entry.files.length} files restored)\n`);
    });
}
