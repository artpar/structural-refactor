import { Project } from 'ts-morph';
import path from 'node:path';
import fs from 'node:fs';
import type { ChangeSet } from '../core/change-set.js';
import { reverseChangeSet, renderDiff } from '../core/change-set.js';
import type { Logger } from '../core/logger.js';
import { createLogger, consoleSink } from '../core/logger.js';
import { pushUndo, createUndoStack, serializeUndoStack, deserializeUndoStack } from '../core/undo.js';
import type { UndoEntry } from '../core/undo.js';
import { cosmiconfigSync } from 'cosmiconfig';
import type { SrefConfig } from '../core/config.js';
import { defaultConfig, mergeConfig } from '../core/config.js';
import { colorDiff, errorText, warnText, dimText } from './color.js';
import { startSpinner } from './progress.js';

export interface ExecutionContext {
  logger: Logger;
  cwd: string;
  dryRun: boolean;
  json: boolean;
  verbose: boolean;
  tsconfig: string;
  config: SrefConfig;
}

export function loadConfig(cwd: string): SrefConfig {
  const explorer = cosmiconfigSync('sref');
  const result = explorer.search(cwd);
  if (result && !result.isEmpty) {
    return mergeConfig(defaultConfig(), result.config as Partial<SrefConfig>);
  }
  return defaultConfig();
}

export function createExecutionContext(globalOpts: Record<string, unknown>): ExecutionContext {
  const verbose = Boolean(globalOpts['verbose']);
  const logger = createLogger({
    level: verbose ? 'debug' : 'info',
    sink: consoleSink,
  });

  const cwd = process.cwd();
  const config = loadConfig(cwd);

  // CLI flags override config file
  const tsconfig = (globalOpts['tsconfig'] as string) ?? config.tsconfig;

  return {
    logger,
    cwd,
    dryRun: Boolean(globalOpts['dryRun']),
    json: Boolean(globalOpts['json']),
    verbose,
    tsconfig,
    config,
  };
}

export function validateFilePaths(paths: string[]): string | null {
  for (const p of paths) {
    const abs = path.resolve(p);
    if (!fs.existsSync(abs)) {
      return `File not found: ${abs}`;
    }
  }
  return null;
}

export function createProject(ctx: ExecutionContext, filePaths?: string[]): Project {
  const tsconfigPath = path.resolve(ctx.cwd, ctx.tsconfig);
  const hasTsConfig = fs.existsSync(tsconfigPath);

  ctx.logger.debug('execute', 'creating ts-morph project', {
    tsconfig: tsconfigPath,
    hasTsConfig,
    fileCount: filePaths?.length,
  });

  const spinner = ctx.json ? { stop() {} } : startSpinner('Loading project...');

  const project = hasTsConfig
    ? new Project({ tsConfigFilePath: tsconfigPath })
    : new Project({ skipAddingFilesFromTsConfig: true });

  spinner.stop();

  // Ensure explicitly requested files are in the project
  // (they may be outside tsconfig include paths)
  if (filePaths) {
    for (const fp of filePaths) {
      const abs = path.resolve(fp);
      if (!project.getSourceFile(abs) && fs.existsSync(abs)) {
        project.addSourceFileAtPath(abs);
      }
    }
  }

  return project;
}

function suggestFix(description: string): string {
  const msg = description.replace('Precondition failed: ', '');

  if (msg.includes('source file not found')) {
    return '  Hint: check the --path argument. Use an absolute path or relative to cwd.\n';
  }

  const symbolMatch = msg.match(/symbol '([^']+)' not found/);
  if (symbolMatch) {
    return `  Hint: run  sref discover find ${symbolMatch[1]}  to check if it exists.\n`;
  }

  if (msg.includes('not found in')) {
    return '  Hint: verify the file path and symbol name are correct.\n';
  }

  if (msg.includes('no node at position') || msg.includes('no identifier at position')) {
    return '  Hint: the --path file:line:col may be pointing at whitespace or a non-symbol. Check the position.\n';
  }

  return '';
}

export function handleResult(ctx: ExecutionContext, cs: ChangeSet): void {
  // Detect precondition failures — report them as errors, not silent no-ops
  if (cs.description.startsWith('Precondition failed:')) {
    process.stderr.write(errorText(`Error: ${cs.description}`) + '\n');
    const hint = suggestFix(cs.description);
    if (hint) process.stderr.write(dimText(hint));
    process.exitCode = 1;
    return;
  }

  if (cs.files.length === 0) {
    process.stderr.write(warnText(`No changes: ${cs.description}`) + '\n');
    return;
  }

  if (ctx.json) {
    process.stdout.write(JSON.stringify({ description: cs.description, files: cs.files }, null, 2) + '\n');
    return;
  }

  // Show diff
  const diff = renderDiff(cs);
  process.stdout.write(colorDiff(diff) + '\n');

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

