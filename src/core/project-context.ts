import type { Project } from 'ts-morph';
import type { ResolvedSymbol } from './symbol-resolver.js';

/** AST-parsed import record for a single file */
export interface ImportRecord {
  source: string;
  specifiers: string[];
  resolved: string;
}

/** AST-parsed export record for a single file */
export interface ExportRecord {
  name: string;
  isDefault: boolean;
  isReExport: boolean;
  reExportSource?: string;
}

/** Per-file index entry built from oxc AST parse */
export interface FileIndexEntry {
  path: string;
  contentHash: string;
  imports: ImportRecord[];
  exports: ExportRecord[];
  /** Top-level identifiers found via AST walk */
  identifiers: string[];
}

/** Project-wide index built from oxc AST parsing */
export interface ProjectIndex {
  files: Map<string, FileIndexEntry>;
  /** Get all files that import from the given file path */
  importersOf(filePath: string): string[];
  /** Get all files that the given file imports */
  importsOf(filePath: string): string[];
  /** Get all files that define or reference the given symbol name (AST-based) */
  filesForSymbol(symbolName: string): { definitions: string[]; references: string[] };
}

/** Global flags passed from CLI */
export interface GlobalOptions {
  dryRun: boolean;
  json: boolean;
  verbose: boolean;
  tsconfig: string;
  scope?: string;
  noConfirm: boolean;
}

/** Context available to every refactoring operation */
export interface ProjectContext {
  index: ProjectIndex;
  project: Project;
  options: GlobalOptions;
  /** Load specific files into the ts-morph project for type-aware analysis */
  loadFiles(paths: string[]): void;
  /** Resolve a symbol at a specific location using ts-morph AST */
  resolveSymbolAt(filePath: string, line: number, col: number): ResolvedSymbol | undefined;
}
