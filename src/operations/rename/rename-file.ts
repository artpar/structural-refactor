import { Project } from 'ts-morph';
import path from 'node:path';
import type { ChangeSet, FileChange } from '../../core/change-set.js';
import { createChangeSet } from '../../core/change-set.js';
import { updateImportPath } from '../../utils/import-manager.js';
import type { Logger } from '../../core/logger.js';

export interface RenameFileArgs {
  oldPath: string;
  newPath: string;
  logger: Logger;
}

function computeNewSpecifier(importingFilePath: string, newTargetPath: string): string {
  const importingDir = path.dirname(importingFilePath);
  let relative = path.relative(importingDir, newTargetPath);

  // Remove extension
  relative = relative.replace(/\.(ts|tsx|js|jsx|mjs|cjs)$/, '');

  // Ensure starts with ./
  if (!relative.startsWith('.')) {
    relative = './' + relative;
  }

  return relative;
}

function computeOldSpecifier(importingFilePath: string, oldTargetPath: string): string {
  const importingDir = path.dirname(importingFilePath);
  let relative = path.relative(importingDir, oldTargetPath);

  relative = relative.replace(/\.(ts|tsx|js|jsx|mjs|cjs)$/, '');

  if (!relative.startsWith('.')) {
    relative = './' + relative;
  }

  return relative;
}

export function renameFile(project: Project, args: RenameFileArgs): ChangeSet {
  const { oldPath, newPath, logger } = args;

  logger.info('rename-file', 'starting file rename', { oldPath, newPath });

  // Capture original content of all files that import the target
  const originalContents = new Map<string, string>();
  for (const sf of project.getSourceFiles()) {
    originalContents.set(sf.getFilePath(), sf.getFullText());
  }

  const startMs = performance.now();

  // Find all files that import the old path and update their import specifiers
  for (const sf of project.getSourceFiles()) {
    const sfPath = sf.getFilePath();
    if (sfPath === oldPath) continue;

    const oldSpecifier = computeOldSpecifier(sfPath, oldPath);
    const newSpecifier = computeNewSpecifier(sfPath, newPath);

    updateImportPath(sf, oldSpecifier, newSpecifier);
  }

  // Collect changes
  const files: FileChange[] = [];
  for (const sf of project.getSourceFiles()) {
    const sfPath = sf.getFilePath();
    const original = originalContents.get(sfPath);
    const modified = sf.getFullText();

    if (original !== undefined && original !== modified) {
      files.push({ path: sfPath, original, modified });
    }
  }

  const durationMs = Math.round(performance.now() - startMs);

  logger.info('rename-file', 'file rename complete', {
    oldPath,
    newPath,
    filesChanged: files.length,
    durationMs,
  });

  return createChangeSet(`Rename file '${oldPath}' to '${newPath}'`, files);
}
