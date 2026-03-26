import type { FileChange } from './change-set.js';

export interface UndoEntry {
  timestamp: string;
  description: string;
  files: FileChange[];
}

export interface UndoStack {
  entries: UndoEntry[];
}

export function createUndoStack(): UndoStack {
  return { entries: [] };
}

export function pushUndo(stack: UndoStack, entry: UndoEntry): UndoStack {
  return { entries: [...stack.entries, entry] };
}

export function popUndo(stack: UndoStack): [UndoEntry | undefined, UndoStack] {
  if (stack.entries.length === 0) {
    return [undefined, stack];
  }
  const entry = stack.entries[stack.entries.length - 1];
  return [entry, { entries: stack.entries.slice(0, -1) }];
}

export function peekUndo(stack: UndoStack): UndoEntry | undefined {
  return stack.entries[stack.entries.length - 1];
}

export function serializeUndoStack(stack: UndoStack): string {
  return JSON.stringify(stack);
}

export function deserializeUndoStack(json: string): UndoStack {
  return JSON.parse(json) as UndoStack;
}
