# structural-refactor

CLI for IntelliJ-style structural refactoring of JavaScript/TypeScript codebases.

## Architecture

Two-tier parser design:
- **Tier 1 (oxc-parser):** Fast AST-based indexing of all files via worker threads. Builds import graph + symbol index.
- **Tier 2 (ts-morph):** Type-aware refactoring on affected files only. Loaded lazily with `skipAddingFilesFromTsConfig: true`.

All code analysis is **AST-based** — no string matching, no regex on code. The tool is called "structural" for a reason.

## Core Principles

- **Values as boundaries** (Gary Bernhardt's "Boundaries"): Pure functions take values in, return values out. Side effects (file I/O, ts-morph mutations) at the edges only. Core logic is pure data transformations.
- **TDD**: Tests first, implement to pass, then refactor. Every module has tests.
- **AST-only**: All code analysis and testing through parsed ASTs. Never grep/regex on source code.
- **Single path**: No dual code paths. One way to do each thing.
- **No unnecessary transforms in glue layers.**

## Stack

- **Runtime:** Node >= 22
- **Package manager:** pnpm 10
- **Language:** TypeScript 5 (ESM, `verbatimModuleSyntax`)
- **CLI:** commander
- **Fast parser:** oxc-parser (AST indexing)
- **Type engine:** ts-morph (refactoring)
- **Module resolution:** oxc-resolver
- **File discovery:** fast-glob
- **Cache:** @msgpack/msgpack + xxhash-wasm
- **Testing:** vitest
- **Dev runner:** tsx

## Commands

```bash
pnpm test          # run tests
pnpm test:watch    # watch mode
pnpm dev           # run CLI in dev mode (tsx)
```

## Project Structure

```
bin/sref.ts              # CLI entry point
src/
  core/                  # Value types and pure functions
    change-set.ts        # FileChange, ChangeSet, reverseChangeSet, renderDiff
    operation.ts         # OperationDescriptor, Registry, ValidationResult
    symbol-resolver.ts   # resolveSymbolAt (ts-morph based)
    project-context.ts   # ProjectContext, ProjectIndex interfaces
    undo.ts              # UndoStack (immutable value operations)
    config.ts            # SrefConfig, mergeConfig
  indexing/              # oxc AST-based project indexing
  analysis/              # Blast radius computation
  operations/            # One dir per refactoring category
  workers/               # Worker thread pool for parallel oxc parsing
  cache/                 # Content-hash based caching (msgpack)
  cli/                   # Commander setup, commands, output renderers
  plugins/               # Plugin system
  utils/                 # Shared utilities (scope analysis, import management)
tests/                   # Mirrors src/ structure
```

## Logging Standard

Logs are the eyes into the project. Every module that does meaningful work must log with the project logger.

```typescript
import type { Logger } from './core/logger.js';

// Every function receives a logger and logs structured data
function buildIndex(logger: Logger, files: string[]) {
  logger.info('indexing', 'starting index build', { fileCount: files.length });
  // ...
  logger.debug('indexing', 'parsed file', { path, importCount, exportCount, durationMs });
}
```

- Use levels: `trace` (internals), `debug` (step details), `info` (operations), `warn` (recoverable), `error` (failures)
- Always include structured `data` — file paths, counts, durations, symbol names
- Scope parameter identifies the module (e.g., `'indexing'`, `'cache'`, `'rename'`, `'cli'`)
- Never use `console.log` — use the logger

## Rules

- Never run linting or type checking commands
- Never build — project runs in hot-reload dev mode (tsx)
- Never maintain dual paths — single source of truth
- Never make unnecessary transforms in glue layers
- All refactoring operations return `ChangeSet` values — never write to disk directly
- Operations are flat (no inheritance hierarchy) — shared logic in `utils/`
- All code analysis is AST-based — no string matching or regex on source code
- TDD: write tests first, then implement
