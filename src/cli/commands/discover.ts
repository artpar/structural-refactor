import type { Command } from 'commander';
import path from 'node:path';
import { createExecutionContext } from '../execute.js';
import { createQueryEngine } from '../../query/engine.js';

export function registerDiscover(program: Command): void {
  const discover = program
    .command('discover')
    .description('Discover, list, and find similar code across the project');

  discover
    .command('list')
    .description('List all functions, classes, interfaces, types')
    .option('--dir <path>', 'Project root directory', '.')
    .option('--kind <type>', 'Filter by kind (function, class, interface, type, enum, arrow)')
    .option('--exported', 'Only exported symbols')
    .option('--file <pattern>', 'Filter by file path pattern')
    .action((opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const ctx = createExecutionContext(globalOpts);
      const rootDir = path.resolve(opts.dir);
      const engine = createQueryEngine(rootDir, ctx.logger);

      const results = engine.list({
        kind: opts.kind,
        exported: opts.exported ? true : undefined,
        filePattern: opts.file,
      });

      if (globalOpts.json) {
        process.stdout.write(JSON.stringify(results.map((u) => ({
          name: u.name,
          file: path.relative(rootDir, u.filePath),
          exported: u.exported,
        })), null, 2) + '\n');
      } else {
        const stats = engine.stats();
        process.stdout.write(`${stats.totalUnits} code units in ${stats.fileCount} files\n\n`);
        for (const u of results) {
          const rel = path.relative(rootDir, u.filePath);
          const exp = u.exported ? ' [exported]' : '';
          process.stdout.write(`  ${u.name}${exp}  ${rel}\n`);
        }
      }
    });

  discover
    .command('find <name>')
    .description('Find all code units with a given name')
    .option('--dir <path>', 'Project root directory', '.')
    .action((name, opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const ctx = createExecutionContext(globalOpts);
      const rootDir = path.resolve(opts.dir);
      const engine = createQueryEngine(rootDir, ctx.logger);

      const results = engine.find(name);

      if (globalOpts.json) {
        process.stdout.write(JSON.stringify(results.map((u) => ({
          name: u.name,
          file: path.relative(rootDir, u.filePath),
          exported: u.exported,
        })), null, 2) + '\n');
      } else {
        if (results.length === 0) {
          process.stdout.write(`No code units named '${name}' found.\n`);
        } else {
          for (const u of results) {
            const rel = path.relative(rootDir, u.filePath);
            process.stdout.write(`  ${u.name}  ${rel}\n`);
          }
        }
      }
    });

  discover
    .command('similar <name>')
    .description('Find structurally similar code units')
    .option('--dir <path>', 'Project root directory', '.')
    .option('--min-score <n>', 'Minimum similarity score (0-1)', '0.3')
    .option('--limit <n>', 'Maximum results', '20')
    .action((name, opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const ctx = createExecutionContext(globalOpts);
      const rootDir = path.resolve(opts.dir);
      const engine = createQueryEngine(rootDir, ctx.logger);

      const results = engine.similar(name, parseFloat(opts.minScore))
        .slice(0, parseInt(opts.limit));

      if (globalOpts.json) {
        process.stdout.write(JSON.stringify(results.map((r) => ({
          name: r.unit.name, kind: r.unit.kind,
          file: path.relative(rootDir, r.unit.filePath), line: r.unit.line,
          score: Math.round(r.score * 1000) / 1000,
          reasons: r.reasons,
        })), null, 2) + '\n');
      } else {
        if (results.length === 0) {
          process.stdout.write(`No similar code units found for '${name}'.\n`);
        } else {
          process.stdout.write(`Similar to '${name}':\n`);
          for (const r of results) {
            const rel = path.relative(rootDir, r.unit.filePath);
            const pct = Math.round(r.score * 100);
            process.stdout.write(`  ${pct}% ${r.unit.kind} ${r.unit.name}  ${rel}:${r.unit.line}  [${r.reasons.join(', ')}]\n`);
          }
        }
      }
    });

  discover
    .command('search')
    .description('Search by signature or pattern')
    .option('--dir <path>', 'Project root directory', '.')
    .option('--params <types>', 'Comma-separated param types')
    .option('--returns <type>', 'Return type')
    .option('--param-count <n>', 'Parameter count')
    .option('--has-member <name>', 'Has a member with this name')
    .option('--kind <type>', 'Filter by kind')
    .option('--async', 'Only async functions')
    .option('--name <pattern>', 'Name contains pattern')
    .action((opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const ctx = createExecutionContext(globalOpts);
      const rootDir = path.resolve(opts.dir);
      const engine = createQueryEngine(rootDir, ctx.logger);

      if (opts.params || opts.returns || opts.paramCount) {
        const results = engine.searchBySignature({
          paramTypes: opts.params?.split(','),
          returnType: opts.returns,
          paramCount: opts.paramCount ? parseInt(opts.paramCount) : undefined,
        });

        if (globalOpts.json) {
          process.stdout.write(JSON.stringify(results.map((u) => ({
            name: u.name, kind: u.kind,
            file: path.relative(rootDir, u.filePath), line: u.line,
            params: u.params, returnType: u.returnType,
          })), null, 2) + '\n');
        } else {
          process.stdout.write(`${results.length} matches:\n`);
          for (const u of results) {
            const rel = path.relative(rootDir, u.filePath);
            const sig = u.params.length > 0 ? `(${u.params.map((p) => p.type).join(', ')})` : '';
            const ret = u.returnType ? ` → ${u.returnType}` : '';
            process.stdout.write(`  ${u.kind} ${u.name}${sig}${ret}  ${rel}:${u.line}\n`);
          }
        }
      } else {
        const results = engine.searchByPattern({
          kind: opts.kind,
          hasMember: opts.hasMember,
          isAsync: opts.async ? true : undefined,
          namePattern: opts.name,
        });

        if (globalOpts.json) {
          process.stdout.write(JSON.stringify(results.map((u) => ({
            name: u.name, file: path.relative(rootDir, u.filePath), exported: u.exported,
          })), null, 2) + '\n');
        } else {
          process.stdout.write(`${results.length} matches:\n`);
          for (const u of results) {
            const rel = path.relative(rootDir, u.filePath);
            process.stdout.write(`  ${u.name}  ${rel}\n`);
          }
        }
      }
    });
}
