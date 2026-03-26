import { Project } from 'ts-morph';
import path from 'node:path';
import fs from 'node:fs';
import type { ChangeSet } from '../core/change-set.js';
import { reverseChangeSet, renderDiff } from '../core/change-set.js';
import type { Logger } from '../core/logger.js';
import { createLogger, consoleSink } from '../core/logger.js';
import { pushUndo, createUndoStack, serializeUndoStack, deserializeUndoStack } from '../core/undo.js';
import type { UndoStack, UndoEntry } from '../core/undo.js';

export interface ExecutionContext {
  logger: Logger;
  cwd: string;
  dryRun: boolean;
  json: boolean;
  verbose: boolean;
  tsconfig: string;
}

export function createExecutionContext(globalOpts: Record<string, unknown>): ExecutionContext {
  const verbose = Boolean(globalOpts['verbose']);
  const logger = createLogger({
    level: verbose ? 'debug' : 'info',
    sink: consoleSink,
  });

  const cwd = process.cwd();
  const tsconfig = (globalOpts['tsconfig'] as string) ?? findTsConfig(cwd);

  return {
    logger,
    cwd,
    dryRun: Boolean(globalOpts['dryRun']),
    json: Boolean(globalOpts['json']),
    verbose,
    tsconfig,
  };
}

export function createProject(ctx: ExecutionContext, filePaths?: string[]): Project {
  const tsconfigPath = path.resolve(ctx.cwd, ctx.tsconfig);
  const hasTsConfig = fs.existsSync(tsconfigPath);

  ctx.logger.debug('execute', 'creating ts-morph project', {
    tsconfig: tsconfigPath,
    hasTsConfig,
    fileCount: filePaths?.length,
  });

  if (hasTsConfig && !filePaths) {
    return new Project({ tsConfigFilePath: tsconfigPath });
  }

  const project = new Project({
    tsConfigFilePath: hasTsConfig ? tsconfigPath : undefined,
    skipAddingFilesFromTsConfig: true,
  });

  if (filePaths) {
    for (const fp of filePaths) {
      project.addSourceFileAtPath(fp);
    }
  }

  return project;
}

export function handleResult(ctx: ExecutionContext, cs: ChangeSet): void {
  if (cs.files.length === 0) {
    ctx.logger.info('execute', 'no changes to apply', { description: cs.description });
    return;
  }

  if (ctx.json) {
    process.stdout.write(JSON.stringify({ description: cs.description, files: cs.files }, null, 2) + '\n');
    return;
  }

  // Show diff
  const diff = renderDiff(cs);
  process.stdout.write(diff + '\n');

  if (ctx.dryRun) {
    ctx.logger.info('execute', 'dry run — no changes written', { fileCount: cs.files.length });
    return;
  }

  // Apply changes
  applyChangeSet(cs, ctx.logger);

  // Save undo
  saveUndoEntry(ctx, cs);
}

export function applyChangeSet(cs: ChangeSet, logger: Logger): void {
  for (const file of cs.files) {
    logger.debug('execute', 'writing file', { path: file.path });
    fs.writeFileSync(file.path, file.modified, 'utf-8');
  }
  logger.info('execute', 'changes applied', { fileCount: cs.files.length });
}

function saveUndoEntry(ctx: ExecutionContext, cs: ChangeSet): void {
  const undoDir = path.join(ctx.cwd, '.sref');
  const undoFile = path.join(undoDir, 'undo-stack.json');

  if (!fs.existsSync(undoDir)) {
    fs.mkdirSync(undoDir, { recursive: true });
  }

  let stack = createUndoStack();
  if (fs.existsSync(undoFile)) {
    stack = deserializeUndoStack(fs.readFileSync(undoFile, 'utf-8'));
  }

  const reversed = reverseChangeSet(cs);
  const entry: UndoEntry = {
    timestamp: new Date().toISOString(),
    description: cs.description,
    files: reversed.files,
  };

  stack = pushUndo(stack, entry);
  fs.writeFileSync(undoFile, serializeUndoStack(stack), 'utf-8');

  ctx.logger.debug('execute', 'undo entry saved', { description: cs.description });
}

function findTsConfig(cwd: string): string {
  const candidate = path.join(cwd, 'tsconfig.json');
  if (fs.existsSync(candidate)) return 'tsconfig.json';
  return 'tsconfig.json'; // fallback, will be handled by createProject
}
