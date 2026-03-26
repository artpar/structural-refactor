export interface TargetLocation {
  file: string;
  line: number | undefined;
  col: number | undefined;
}

export interface OperationArgs {
  [key: string]: unknown;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export interface OperationDescriptor {
  name: string;
  category: string;
  /** Determine which files are affected (AST-based, from the project index) */
  analyzeScope?: AnalyzeScopeFn;
  /** Check preconditions before refactoring */
  validate?: ValidateFn;
  /** Compute the changes (returns a value — no side effects) */
  computeChanges?: ComputeChangesFn;
}

/** Function types for operation phases — values in, values out */
export type AnalyzeScopeFn = (ctx: OperationContext, args: OperationArgs) => string[];
export type ValidateFn = (ctx: OperationContext, args: OperationArgs) => ValidationResult;
export type ComputeChangesFn = (ctx: OperationContext, args: OperationArgs) => ChangeSetValue;

/** Minimal context passed to operations — subset of ProjectContext as a value boundary */
export interface OperationContext {
  /** Get the import graph entry for a file */
  getFileIndex: (filePath: string) => FileIndexEntry | undefined;
  /** Get all importers of a file */
  importersOf: (filePath: string) => string[];
  /** Get files defining/referencing a symbol */
  filesForSymbol: (symbolName: string) => { definitions: string[]; references: string[] };
}

/** Import from peer modules for the value types */
import type { ChangeSet as ChangeSetValue } from './change-set.js';
import type { FileIndexEntry } from './project-context.js';

export interface OperationRegistry {
  register(op: OperationDescriptor): void;
  get(category: string, name: string): OperationDescriptor | undefined;
  list(): OperationDescriptor[];
  listByCategory(category: string): OperationDescriptor[];
}

export function createRegistry(): OperationRegistry {
  const ops: OperationDescriptor[] = [];

  return {
    register(op) {
      ops.push(op);
    },
    get(category, name) {
      return ops.find((o) => o.category === category && o.name === name);
    },
    list() {
      return [...ops];
    },
    listByCategory(category) {
      return ops.filter((o) => o.category === category);
    },
  };
}

export function validationOk(): ValidationResult {
  return { ok: true, errors: [] };
}

export function validationError(errors: string[]): ValidationResult {
  return { ok: false, errors };
}

export function parseTargetLocation(input: string): TargetLocation {
  // Handle Windows paths (C:\...) — the drive letter colon is not a separator
  const hasWindowsDrive = /^[A-Za-z]:\\/.test(input);
  const startIndex = hasWindowsDrive ? 2 : 0;

  const lastColon2 = input.lastIndexOf(':');
  const lastColon1 = input.lastIndexOf(':', lastColon2 - 1);

  // No colons after the path portion
  if (lastColon2 <= startIndex) {
    return { file: input, line: undefined, col: undefined };
  }

  const afterLastColon = input.slice(lastColon2 + 1);
  const col = Number(afterLastColon);

  // Check if we have file:line:col
  if (lastColon1 > startIndex && !Number.isNaN(col) && afterLastColon.length > 0) {
    const betweenColons = input.slice(lastColon1 + 1, lastColon2);
    const line = Number(betweenColons);
    if (!Number.isNaN(line) && betweenColons.length > 0) {
      return { file: input.slice(0, lastColon1), line, col };
    }
  }

  // Check if we have file:line
  if (!Number.isNaN(col) && afterLastColon.length > 0) {
    return { file: input.slice(0, lastColon2), line: col, col: undefined };
  }

  return { file: input, line: undefined, col: undefined };
}
