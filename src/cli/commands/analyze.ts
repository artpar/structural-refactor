import type { Command } from 'commander';
import path from 'node:path';
import { createExecutionContext } from '../execute.js';
import { detectProject } from '../../analysis/project-detector.js';
import { analyzeDependencies } from '../../analysis/dependency-analyzer.js';

export function registerAnalyze(program: Command): void {
  const analyze = program
    .command('analyze')
    .description('Analyze project structure and dependencies');

  analyze
    .command('info')
    .description('Show project type, framework, and configuration')
    .option('--dir <path>', 'Project root directory', '.')
    .action((opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const ctx = createExecutionContext(globalOpts);
      const rootDir = path.resolve(opts.dir);

      const info = detectProject(rootDir, ctx.logger);

      if (globalOpts.json) {
        process.stdout.write(JSON.stringify(info, null, 2) + '\n');
        return;
      }

      process.stdout.write(`Project: ${info.packageName ?? '(unnamed)'}\n`);
      process.stdout.write(`Types: ${info.types.join(', ')}\n`);
      if (info.framework) process.stdout.write(`Framework: ${info.framework}\n`);
      process.stdout.write(`TypeScript: ${info.hasTypeScript ? 'yes' : 'no'}\n`);
      if (info.pathAliases) {
        process.stdout.write(`Path aliases: ${Object.keys(info.pathAliases).join(', ')}\n`);
      }
      if (info.workspacePackages) {
        process.stdout.write(`Workspace packages: ${info.workspacePackages.map((p) => p.name).join(', ')}\n`);
      }
      if (info.dependencies) {
        process.stdout.write(`Dependencies: ${info.dependencies.production.length} production, ${info.dependencies.dev.length} dev\n`);
      }
    });

  analyze
    .command('deps')
    .description('Show dependency tree')
    .option('--dir <path>', 'Project root directory', '.')
    .option('--external', 'Show only external dependencies')
    .option('--internal', 'Show only internal module dependencies')
    .action((opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const ctx = createExecutionContext(globalOpts);
      const rootDir = path.resolve(opts.dir);

      const graph = analyzeDependencies(rootDir, ctx.logger);

      if (globalOpts.json) {
        const serializable = {
          stats: graph.stats,
          entryPoints: graph.entryPoints,
          leaves: graph.leaves,
          modules: Object.fromEntries(
            [...graph.modules.entries()].map(([k, v]) => [
              path.relative(rootDir, k),
              {
                exports: v.exports,
                internalImports: v.internalImports.map((i) => ({
                  source: i.source,
                  resolved: path.relative(rootDir, i.resolved),
                  specifiers: i.specifiers,
                })),
                externalImports: v.externalImports.map((i) => ({
                  source: i.source,
                  specifiers: i.specifiers,
                })),
                importedBy: v.importedBy.map((p) => path.relative(rootDir, p)),
              },
            ]),
          ),
        };
        process.stdout.write(JSON.stringify(serializable, null, 2) + '\n');
        return;
      }

      process.stdout.write(`Modules: ${graph.stats.moduleCount}\n`);
      process.stdout.write(`Internal edges: ${graph.stats.internalEdgeCount}\n`);
      process.stdout.write(`External dependencies: ${graph.stats.externalDependencyCount}\n`);
      process.stdout.write(`Entry points: ${graph.entryPoints.map((p) => path.relative(rootDir, p)).join(', ')}\n`);
      process.stdout.write(`Leaf modules: ${graph.leaves.map((p) => path.relative(rootDir, p)).join(', ')}\n`);

      if (!opts.external) {
        process.stdout.write('\nInternal dependency tree:\n');
        for (const [filePath, mod] of graph.modules) {
          const rel = path.relative(rootDir, filePath);
          if (mod.internalImports.length > 0) {
            const deps = mod.internalImports.map((i) => path.relative(rootDir, i.resolved)).join(', ');
            process.stdout.write(`  ${rel} → ${deps}\n`);
          }
        }
      }

      if (!opts.internal) {
        process.stdout.write('\nExternal dependencies:\n');
        const externalSet = new Set<string>();
        for (const mod of graph.modules.values()) {
          for (const ext of mod.externalImports) {
            externalSet.add(ext.source);
          }
        }
        for (const dep of [...externalSet].sort()) {
          process.stdout.write(`  ${dep}\n`);
        }
      }
    });

  analyze
    .command('graph')
    .description('Show module dependency graph')
    .option('--dir <path>', 'Project root directory', '.')
    .option('--file <path>', 'Show graph for specific file')
    .action((opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const ctx = createExecutionContext(globalOpts);
      const rootDir = path.resolve(opts.dir);

      const graph = analyzeDependencies(rootDir, ctx.logger);

      if (opts.file) {
        const absFile = path.resolve(opts.file);
        const mod = graph.modules.get(absFile);
        if (!mod) {
          ctx.logger.error('analyze', 'file not found in graph', { file: opts.file });
          process.exitCode = 1;
          return;
        }

        const result = {
          file: path.relative(rootDir, absFile),
          exports: mod.exports,
          imports: mod.internalImports.map((i) => ({
            source: i.source,
            resolved: path.relative(rootDir, i.resolved),
            specifiers: i.specifiers,
          })),
          externalImports: mod.externalImports.map((i) => ({
            source: i.source,
            specifiers: i.specifiers,
          })),
          importedBy: mod.importedBy.map((p) => path.relative(rootDir, p)),
        };

        if (globalOpts.json) {
          process.stdout.write(JSON.stringify(result, null, 2) + '\n');
        } else {
          process.stdout.write(`File: ${result.file}\n`);
          process.stdout.write(`Exports: ${result.exports.join(', ')}\n`);
          process.stdout.write(`Imports:\n`);
          for (const imp of result.imports) {
            process.stdout.write(`  ${imp.resolved} [${imp.specifiers.join(', ')}]\n`);
          }
          process.stdout.write(`External imports:\n`);
          for (const imp of result.externalImports) {
            process.stdout.write(`  ${imp.source} [${imp.specifiers.join(', ')}]\n`);
          }
          process.stdout.write(`Imported by:\n`);
          for (const by of result.importedBy) {
            process.stdout.write(`  ${by}\n`);
          }
        }
        return;
      }

      // Full graph output
      if (globalOpts.json) {
        const nodes = [...graph.modules.entries()].map(([k, v]) => ({
          id: path.relative(rootDir, k),
          exports: v.exports,
          importCount: v.internalImports.length + v.externalImports.length,
          importedByCount: v.importedBy.length,
        }));
        const edges = [...graph.modules.entries()].flatMap(([k, v]) =>
          v.internalImports.map((i) => ({
            from: path.relative(rootDir, k),
            to: path.relative(rootDir, i.resolved),
            specifiers: i.specifiers,
          })),
        );
        process.stdout.write(JSON.stringify({ nodes, edges, stats: graph.stats }, null, 2) + '\n');
      } else {
        for (const [filePath, mod] of graph.modules) {
          const rel = path.relative(rootDir, filePath);
          const deps = mod.internalImports.map((i) => path.relative(rootDir, i.resolved));
          process.stdout.write(`${rel}\n`);
          for (const dep of deps) {
            process.stdout.write(`  → ${dep}\n`);
          }
        }
      }
    });

  analyze
    .command('exports')
    .description('Show what each file exports')
    .option('--dir <path>', 'Project root directory', '.')
    .action((opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const ctx = createExecutionContext(globalOpts);
      const rootDir = path.resolve(opts.dir);

      const graph = analyzeDependencies(rootDir, ctx.logger);

      if (globalOpts.json) {
        const result = Object.fromEntries(
          [...graph.modules.entries()].map(([k, v]) => [path.relative(rootDir, k), v.exports]),
        );
        process.stdout.write(JSON.stringify(result, null, 2) + '\n');
        return;
      }

      for (const [filePath, mod] of graph.modules) {
        if (mod.exports.length > 0) {
          process.stdout.write(`${path.relative(rootDir, filePath)}: ${mod.exports.join(', ')}\n`);
        }
      }
    });

  analyze
    .command('imports')
    .description('Show what each file imports')
    .option('--dir <path>', 'Project root directory', '.')
    .option('--file <path>', 'Show imports for specific file')
    .action((opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const ctx = createExecutionContext(globalOpts);
      const rootDir = path.resolve(opts.dir);

      const graph = analyzeDependencies(rootDir, ctx.logger);

      if (opts.file) {
        const absFile = path.resolve(opts.file);
        const mod = graph.modules.get(absFile);
        if (!mod) {
          ctx.logger.error('analyze', 'file not found', { file: opts.file });
          process.exitCode = 1;
          return;
        }

        const allImports = [
          ...mod.internalImports.map((i) => ({ source: i.source, resolved: path.relative(rootDir, i.resolved), specifiers: i.specifiers, external: false })),
          ...mod.externalImports.map((i) => ({ source: i.source, resolved: '', specifiers: i.specifiers, external: true })),
        ];

        if (globalOpts.json) {
          process.stdout.write(JSON.stringify(allImports, null, 2) + '\n');
        } else {
          for (const imp of allImports) {
            const label = imp.external ? '(external)' : imp.resolved;
            process.stdout.write(`  ${imp.source} → ${label} [${imp.specifiers.join(', ')}]\n`);
          }
        }
        return;
      }

      for (const [filePath, mod] of graph.modules) {
        const rel = path.relative(rootDir, filePath);
        const allImports = [...mod.internalImports, ...mod.externalImports];
        if (allImports.length > 0) {
          const summary = allImports.map((i) => i.source).join(', ');
          process.stdout.write(`${rel}: ${summary}\n`);
        }
      }
    });
}
