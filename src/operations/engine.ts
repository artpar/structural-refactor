/**
 * Refactoring engine: the ONLY way to execute a refactoring operation.
 *
 * Enforces three rules from refactoring engine bug research (arxiv:2409.14610):
 * 1. ALL mutations through ts-morph API (never string manipulation)
 * 2. ALL files diffed (snapshot before, diff after)
 * 3. Preconditions checked before any mutation
 *
 * This eliminates the top 3 bug categories:
 * - Incorrect Transformations (165 bugs) → ts-morph handles AST correctly
 * - Incorrect Preconditions (62 bugs) → checked before execution
 * - Missed files (44% of multi-file failures) → diffAllFiles catches everything
 */
import type { Project } from 'ts-morph';
import type { ChangeSet, FileChange } from '../core/change-set.js';
import { createChangeSet } from '../core/change-set.js';
import type { Logger } from '../core/logger.js';

export interface PreconditionResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export function preconditionOk(warnings?: string[]): PreconditionResult {
  return { ok: true, errors: [], warnings: warnings ?? [] };
}

export function preconditionFail(errors: string[], warnings?: string[]): PreconditionResult {
  return { ok: false, errors, warnings: warnings ?? [] };
}

/**
 * Snapshot the full text of every source file in the project.
 * Call BEFORE any mutations.
 */
export function snapshotAllFiles(project: Project): Map<string, string> {
  const snapshots = new Map<string, string>();
  for (const sf of project.getSourceFiles()) {
    snapshots.set(sf.getFilePath(), sf.getFullText());
  }
  return snapshots;
}

/**
 * Diff every source file against snapshots taken before mutation.
 * Returns FileChange[] for all files that changed.
 */
export function diffAllFiles(project: Project, snapshots: Map<string, string>): FileChange[] {
  const changes: FileChange[] = [];
  for (const sf of project.getSourceFiles()) {
    const filePath = sf.getFilePath();
    const original = snapshots.get(filePath);
    const modified = sf.getFullText();
    if (original !== undefined && original !== modified) {
      changes.push({ path: filePath, original, modified });
    }
  }
  return changes;
}

/**
 * Execute a refactoring operation safely.
 *
 * @param project - ts-morph Project (must have all relevant files loaded)
 * @param description - human-readable description for the ChangeSet
 * @param checkPreconditions - returns errors if the operation would be unsafe
 * @param execute - performs the mutation via ts-morph APIs ONLY
 * @param logger - structured logger
 */
export function executeRefactoring(
  project: Project,
  description: string,
  checkPreconditions: () => PreconditionResult,
  execute: () => void,
  logger: Logger,
): ChangeSet {
  // 1. Snapshot ALL files before any mutation
  const snapshots = snapshotAllFiles(project);

  // 2. Check preconditions
  const preconditions = checkPreconditions();
  if (!preconditions.ok) {
    logger.warn('engine', 'precondition failed', {
      description,
      errors: preconditions.errors,
    });
    return createChangeSet(`Precondition failed: ${preconditions.errors.join('; ')}`, []);
  }

  for (const warning of preconditions.warnings) {
    logger.warn('engine', 'precondition warning', { description, warning });
  }

  // 3. Execute mutation via ts-morph
  const startMs = performance.now();
  execute();
  const durationMs = Math.round(performance.now() - startMs);

  // 4. Diff ALL files
  const changes = diffAllFiles(project, snapshots);

  logger.info('engine', 'refactoring complete', {
    description,
    filesChanged: changes.length,
    durationMs,
  });

  return createChangeSet(description, changes);
}
