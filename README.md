# sref — Structural Refactoring CLI

IntelliJ-style structural refactoring for JavaScript and TypeScript codebases, from the command line.

`sref` performs **AST-based** refactoring — no regex, no string matching. It parses your code into an abstract syntax tree, understands the structure, and makes precise transformations that update every reference across your entire project.

## Why sref?

Most code transformation tools work on text. `sref` works on **structure**. When you rename a symbol, it finds every import, every usage, every re-export — not by searching for strings, but by resolving the actual dependency graph. This means:

- Renames that update all imports across 200 files in one command
- Safe deletes that refuse to remove code that's still referenced
- Extract/inline operations that understand scope, closures, and types
- Module conversions that rewrite `require()` to `import` with correct specifiers
- An undo stack that can reverse any operation

## Installation

```bash
# Requires Node >= 18
npm install -g structural-refactor

# Or use directly with npx
npx structural-refactor <command>

# Or in a project with pnpm
pnpm add -D structural-refactor
```

## Quick Start

```bash
# See what's in your project
sref discover list --dir .

# Find a specific symbol
sref discover find createUser

# Rename it everywhere
sref rename symbol createUser --to createAccount --dry-run
sref rename symbol createUser --to createAccount

# Oops, undo that
sref undo
```

Every destructive command supports `--dry-run` to preview changes as a diff before applying them.

## Global Options

These flags work with any command:

| Flag | Description |
|------|-------------|
| `--dry-run` | Preview changes without writing to disk |
| `--json` | Output results as JSON (for scripting/piping) |
| `--verbose` | Show detailed operation logs |
| `--tsconfig <path>` | Path to tsconfig.json (auto-detected by default) |
| `--scope <path>` | Limit operations to a directory subset |
| `--no-confirm` | Skip confirmation prompts |

---

## Commands

### `rename` — Rename symbols, files, or modules

#### `rename symbol <name> --to <newName>`

Renames a symbol across the entire project. Updates the declaration, all usages, all imports, and all re-exports.

```bash
# Rename by name (auto-resolved from project index)
sref rename symbol UserService --to AccountService

# Rename with explicit location (for disambiguation)
sref rename symbol handler --to requestHandler --path src/server.ts:42:10
```

The `--path` flag uses `file:line:col` format. If omitted, `sref` searches the project index and resolves the symbol by name. If multiple symbols share the same name, it will ask you to disambiguate with `--path`.

#### `rename file <path> --to <newPath>`

Moves/renames a file and updates every import pointing to it.

```bash
sref rename file src/utils/helpers.ts --to src/utils/string-helpers.ts
```

---

### `extract` — Extract code into new declarations

#### `extract variable --path <file> --start <line:col> --end <line:col> --name <name>`

Extracts an expression into a `const` (or `let`) variable.

```bash
sref extract variable \
  --path src/api.ts \
  --start 15:5 --end 15:48 \
  --name baseUrl \
  --kind const
```

#### `extract function --path <file> --start <line:col> --end <line:col> --name <name>`

Extracts a selection of code into a new function. Automatically detects parameters (variables used but not declared in the selection) and return values.

```bash
sref extract function \
  --path src/handlers.ts \
  --start 20:3 --end 35:4 \
  --name validateInput
```

#### `extract interface --path <file> --class <className> --name <name>`

Extracts a TypeScript interface from a class's public methods and properties.

```bash
sref extract interface --path src/service.ts --class UserService --name IUserService
```

---

### `inline` — Inline declarations at their usage sites

The inverse of `extract`. Replaces a declaration with its value/body at every usage site, then removes the declaration.

#### `inline variable --path <file:line:col>`

```bash
sref inline variable --path src/config.ts:10:7
```

#### `inline function --path <file:line:col>`

Inlines a function body at every call site, substituting arguments for parameters.

```bash
sref inline function --path src/utils.ts:25:17
```

#### `inline type-alias --path <file:line:col>`

Replaces a type alias with its definition at every usage site.

```bash
sref inline type-alias --path src/types.ts:5:6
```

---

### `move` — Move symbols or files

#### `move symbol <name> --from <file> --to <file>`

Moves an exported symbol from one file to another. Updates all imports across the project to point to the new location.

```bash
sref move symbol parseConfig --from src/utils.ts --to src/config/parser.ts
```

#### `move file <path> --to <newPath>`

Alias for `rename file` — moves a file and rewrites all import paths.

```bash
sref move file src/old-location.ts --to src/new-location.ts
```

---

### `signature` — Change function signatures

#### `signature change <fnName> --path <file>`

Add or remove parameters from a function. Updates the declaration and all call sites.

```bash
# Add a parameter
sref signature change processOrder --path src/orders.ts --add-param logger:Logger

# Remove a parameter
sref signature change processOrder --path src/orders.ts --remove-param verbose
```

#### `signature to-arrow --path <file:line:col>`

Converts a `function` declaration to an arrow function expression.

```bash
sref signature to-arrow --path src/handlers.ts:10:1
```

#### `signature to-async --path <file:line:col>`

Adds the `async` keyword to a function and wraps the return type in `Promise<>`.

```bash
sref signature to-async --path src/api.ts:30:1
```

---

### `type` — Type refactorings

#### `type safe-delete <name> --path <file>`

Deletes a symbol **only if** nothing references it. If the symbol is still imported or used, the operation fails with a clear error showing where the references are.

```bash
sref type safe-delete oldHelper --path src/utils.ts --dry-run
sref type safe-delete oldHelper --path src/utils.ts
```

#### `type convert --path <file:line:col>`

Toggles between `type` alias and `interface`. Converts the declaration and adjusts syntax accordingly (`=` vs `{}`).

```bash
sref type convert --path src/types.ts:8:1
```

---

### `modify` — Modify declaration modifiers and keywords

A Swiss army knife for changing declaration attributes without rewriting code manually.

```bash
# Add export keyword
sref modify UserConfig --path src/config.ts --export

# Remove export keyword
sref modify InternalHelper --path src/utils.ts --no-export

# Make a function async
sref modify fetchData --path src/api.ts --async

# Set visibility on a class member
sref modify password --path src/user.ts --scope private

# Add readonly
sref modify id --path src/entity.ts --readonly

# Change return type
sref modify getUser --path src/service.ts --return-type "Promise<User | null>"

# Add a parameter
sref modify handleRequest --path src/server.ts --add-param ctx:Context

# Remove a parameter
sref modify handleRequest --path src/server.ts --remove-param legacy

# Change variable declaration kind
sref modify count --path src/state.ts --kind let

# Add/remove decorators
sref modify UserController --path src/controllers.ts --add-decorator Injectable
sref modify UserController --path src/controllers.ts --remove-decorator Deprecated
```

Options are composable — you can combine multiple modifications in a single command:

```bash
sref modify fetchUser --path src/api.ts --async --export --return-type "Promise<User>"
```

---

### `member` — Class member operations

#### `member encapsulate <fieldName> --class <className> --path <file>`

Generates getter/setter methods for a class field and makes it private.

```bash
sref member encapsulate name --class User --path src/user.ts
```

---

### `class` — Class refactorings

#### `class to-functions --path <file> --class <className>`

Converts a class into standalone functions. Each method becomes a function, the constructor becomes a factory function.

```bash
sref class to-functions --path src/calculator.ts --class Calculator
```

#### `class composition --path <file> --class <className>`

Replaces class inheritance (`extends`) with composition. Creates a delegate field and forwards method calls.

```bash
sref class composition --path src/admin.ts --class AdminUser
```

---

### `module` — Module system refactorings

#### `module cjs-to-esm`

Converts CommonJS `require()`/`module.exports` to ESM `import`/`export` syntax.

```bash
# Convert a single file
sref module cjs-to-esm --path src/legacy.js

# Convert all files in the project
sref module cjs-to-esm
```

#### `module default-to-named --path <file>`

Converts a default export to a named export and updates all import sites.

```bash
sref module default-to-named --path src/utils.ts
```

#### `module replace-with-import <name> --from <module> --path <file>`

Replaces a local function/variable definition with an import from another module. Useful for deduplicating code — when the same function exists locally but is already available from a shared module.

```bash
sref module replace-with-import formatDate --from ./helpers.js --path src/utils.ts
```

---

### `quality` — Code quality refactorings

#### `quality deduplicate <name> --canonical <file>`

Finds all duplicate definitions of a symbol across the project and replaces them with imports from a single canonical source.

```bash
# Find and replace all duplicate `formatDate` definitions,
# keeping the one in src/utils/date.ts
sref quality deduplicate formatDate --canonical src/utils/date.ts

# Limit scope to a specific directory
sref quality deduplicate formatDate --canonical src/utils/date.ts --scope src/features
```

---

### `discover` — Explore your codebase

Discovery commands use a fast oxc-parser-based index (no ts-morph overhead) to query your project.

#### `discover list`

Lists all functions, classes, interfaces, types, and enums in the project.

```bash
sref discover list --dir .
sref discover list --kind function --exported
sref discover list --kind class --file "src/services/**"
```

| Flag | Description |
|------|-------------|
| `--kind <type>` | Filter by `function`, `class`, `interface`, `type`, `enum`, `arrow` |
| `--exported` | Only show exported symbols |
| `--file <pattern>` | Filter by file path pattern |

#### `discover find <name>`

Finds all code units with a specific name.

```bash
sref discover find createUser
```

#### `discover similar <name>`

Finds structurally similar code — functions with similar parameter signatures, similar body patterns, or similar names.

```bash
sref discover similar handleRequest --min-score 0.5 --limit 10
```

#### `discover search`

Search by function signature or structural pattern.

```bash
# Find all functions that take a Logger parameter
sref discover search --params Logger

# Find all async functions
sref discover search --async

# Find functions with 3 parameters
sref discover search --param-count 3

# Find by return type
sref discover search --returns Promise

# Find interfaces that have a specific member
sref discover search --has-member serialize

# Combine filters
sref discover search --kind function --async --name "handle"
```

---

### `analyze` — Analyze project structure

Deep analysis using the full dependency graph, control flow, and data flow.

#### `analyze info`

Shows project type, framework, TypeScript configuration, path aliases, and workspace packages.

```bash
sref analyze info --dir .
```

#### `analyze deps`

Displays the full dependency tree — internal module dependencies and external packages.

```bash
sref analyze deps --dir .
sref analyze deps --internal    # only internal imports
sref analyze deps --external    # only npm packages
```

#### `analyze graph`

Shows the module dependency graph as nodes and edges.

```bash
# Full project graph
sref analyze graph --dir .

# Graph for a specific file (imports, exports, imported-by)
sref analyze graph --file src/core/engine.ts
```

#### `analyze exports` / `analyze imports`

Lists what each file exports or imports.

```bash
sref analyze exports --dir .
sref analyze imports --file src/api/routes.ts
```

#### `analyze cfg --file <path> --function <name>`

Builds a **control flow graph** for a specific function. Shows basic blocks, branches, and call sites.

```bash
sref analyze cfg --file src/parser.ts --function parseExpression
```

#### `analyze dfg --file <path> --function <name>`

Builds a **data flow graph** for a function. Shows how values flow through variables, parameters, and return statements.

```bash
sref analyze dfg --file src/transform.ts --function applyRules
```

#### `analyze call-graph`

Builds a **cross-file call graph** — which functions call which, across the entire project.

```bash
sref analyze call-graph --dir .
sref analyze call-graph --function processOrder
```

---

### `patterns` — Detect architecture and design patterns

Automatically detects design patterns (factory, singleton, observer, builder, etc.) and architectural patterns (layered architecture, dependency injection, etc.) in your codebase.

#### `patterns detect`

Full pattern detection report with evidence and file locations.

```bash
sref patterns detect --dir .
```

#### `patterns list`

Quick list of detected patterns with confidence scores.

```bash
sref patterns list --dir .
sref patterns list --category architectural
sref patterns list --category creational
```

Categories: `creational`, `structural`, `behavioral`, `architectural`, `framework`

#### `patterns layers`

Shows detected architectural layers and their dependencies.

```bash
sref patterns layers --dir .
```

#### `patterns summary`

One-line architecture summary.

```bash
sref patterns summary --dir .
```

---

### `undo` — Undo the last refactoring

Every operation is recorded in a `.sref/undo-stack.json` file. Undo reverses the last operation by restoring original file contents.

```bash
sref undo
```

---

## JSON Output

Every command supports `--json` for machine-readable output. This makes `sref` composable with other tools:

```bash
# Pipe dependency analysis into jq
sref analyze deps --json | jq '.stats'

# Get all exported functions as JSON
sref discover list --exported --kind function --json

# Script a rename and check the result
sref rename symbol oldName --to newName --dry-run --json | jq '.files | length'
```

---

## Architecture

`sref` uses a two-tier parser design for speed and precision:

- **Tier 1 — [oxc-parser](https://github.com/nicolo-ribaudo/oxc):** A fast Rust-based parser used for indexing all files via worker threads. Builds the import graph and symbol index. This powers `discover`, `analyze`, and `patterns` commands.

- **Tier 2 — [ts-morph](https://github.com/dsherret/ts-morph):** Full TypeScript compiler API wrapper, loaded lazily and only for the files that need refactoring. This powers all mutation commands (`rename`, `extract`, `inline`, `move`, etc.).

Additional infrastructure:
- **[oxc-resolver](https://github.com/nicolo-ribaudo/oxc)** for Node.js-compatible module resolution
- **[fast-glob](https://github.com/mrmlnc/fast-glob)** for file discovery
- **Content-hash caching** via xxhash-wasm + msgpack for incremental re-indexing
- **Worker threads** for parallel file parsing

---

## Development

```bash
git clone https://github.com/artpar/structural-refactor
cd structural-refactor
pnpm install

pnpm test          # run tests
pnpm test:watch    # watch mode
pnpm dev           # run CLI via tsx (hot reload)

# Run any command in dev mode
npx tsx bin/sref.ts discover list --dir .
npx tsx bin/sref.ts rename symbol Foo --to Bar --dry-run
```

---

## License

MIT
