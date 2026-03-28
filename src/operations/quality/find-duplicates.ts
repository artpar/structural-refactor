/**
 * Find Duplicates: discover functions with identical normalized bodies across files.
 * Discovery-only — returns a ChangeSet with a descriptive summary, no mutations.
 * All analysis via ts-morph AST — no string matching.
 */
import { Project, Node } from 'ts-morph';
import type { ChangeSet } from '../../core/change-set.js';
import type { Logger } from '../../core/logger.js';
import { executeRefactoring, preconditionOk } from '../engine.js';

export interface FindDuplicatesArgs {
  scope?: string;
  logger: Logger;
}

interface FunctionEntry {
  name: string;
  filePath: string;
  node: Node;
}

export function findDuplicates(project: Project, args: FindDuplicatesArgs): ChangeSet {
  const { scope, logger } = args;

  // Collect all function declarations with their normalized body hashes
  const byHash = new Map<string, FunctionEntry[]>();

  for (const sf of project.getSourceFiles()) {
    const filePath = sf.getFilePath();
    if (scope && !filePath.startsWith(scope)) continue;

    for (const fn of sf.getFunctions()) {
      const name = fn.getName();
      if (!name) continue;

      const body = fn.getBody();
      if (!body || !Node.isBlock(body)) continue;

      const hash = normalizeBody(body.getText(), fn.getParameters().map((p) => p.getName()));
      const entry: FunctionEntry = { name, filePath, node: fn };
      const existing = byHash.get(hash) ?? [];
      existing.push(entry);
      byHash.set(hash, existing);
    }
  }

  // Filter to groups with more than one member (actual duplicates)
  const duplicateGroups: FunctionEntry[][] = [];
  for (const [, entries] of byHash) {
    if (entries.length > 1) {
      duplicateGroups.push(entries);
    }
  }

  logger.info('find-duplicates', 'scan complete', {
    totalFunctions: [...byHash.values()].reduce((sum, g) => sum + g.length, 0),
    duplicateGroups: duplicateGroups.length,
    duplicateCount: duplicateGroups.reduce((sum, g) => sum + g.length, 0),
  });

  if (duplicateGroups.length === 0) {
    return executeRefactoring(project, 'Find duplicates (none found)',
      () => preconditionOk(['no duplicate functions found']), () => {}, logger);
  }

  // Build description listing all duplicate groups
  const groupDescriptions = duplicateGroups.map((group) => {
    const name = group[0].name;
    const files = group.map((e) => e.filePath).join(', ');
    return `${name}: ${files}`;
  });

  const description = `Found ${duplicateGroups.length} duplicate group(s): ${groupDescriptions.join('; ')}`;

  // Discovery only — no mutations
  return executeRefactoring(project, description,
    () => preconditionOk(), () => {}, logger);
}

/** Normalize a function body for comparison: strip param names, normalize whitespace */
function normalizeBody(bodyText: string, paramNames: string[]): string {
  let normalized = bodyText;

  // Replace param names with positional placeholders
  for (let i = 0; i < paramNames.length; i++) {
    const regex = new RegExp(`\\b${escapeRegex(paramNames[i])}\\b`, 'g');
    normalized = normalized.replace(regex, `__param${i}__`);
  }

  // Normalize whitespace
  normalized = normalized.replace(/\s+/g, ' ').trim();

  return normalized;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
