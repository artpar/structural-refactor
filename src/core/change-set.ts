import { createPatch } from 'diff';

export interface FileChange {
  path: string;
  original: string;
  modified: string;
}

export interface ChangeSet {
  description: string;
  files: FileChange[];
}

export function createChangeSet(description: string, files: FileChange[]): ChangeSet {
  return { description, files };
}

export function reverseChangeSet(cs: ChangeSet): ChangeSet {
  return {
    description: `Undo: ${cs.description}`,
    files: cs.files.map((f) => ({
      path: f.path,
      original: f.modified,
      modified: f.original,
    })),
  };
}

export function renderDiff(cs: ChangeSet): string {
  if (cs.files.length === 0) return '';

  return cs.files
    .map((f) => createPatch(f.path, f.original, f.modified))
    .join('\n');
}

export function renderJson(cs: ChangeSet): { description: string; files: FileChange[] } {
  return { description: cs.description, files: cs.files };
}
