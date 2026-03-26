// Core value types
export type { FileChange, ChangeSet } from './core/change-set.js';
export { createChangeSet, reverseChangeSet, renderDiff, renderJson } from './core/change-set.js';

export type { TargetLocation, OperationArgs, ValidationResult, OperationDescriptor, OperationRegistry } from './core/operation.js';
export { createRegistry, validationOk, validationError, parseTargetLocation } from './core/operation.js';

export type { ResolvedSymbol, SymbolKind } from './core/symbol-resolver.js';
export { resolveSymbolAt } from './core/symbol-resolver.js';

export type { UndoStack, UndoEntry } from './core/undo.js';
export { createUndoStack, pushUndo, popUndo, peekUndo, serializeUndoStack, deserializeUndoStack } from './core/undo.js';

export type { SrefConfig } from './core/config.js';
export { defaultConfig, mergeConfig } from './core/config.js';

export type {
  ImportRecord,
  ExportRecord,
  FileIndexEntry,
  ProjectIndex,
  GlobalOptions,
  ProjectContext,
} from './core/project-context.js';
