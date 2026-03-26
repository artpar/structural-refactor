import type { Command } from 'commander';
import path from 'node:path';
import { createExecutionContext } from '../execute.js';
import { Project } from 'ts-morph';
import { detectProject } from '../../analysis/project-detector.js';
import { analyzeDependencies } from '../../analysis/dependency-analyzer.js';
import { buildCFG } from '../../analysis/cfg.js';
import { buildDFG } from '../../analysis/dfg.js';
import { buildCallGraph } from '../../analysis/call-graph.js';

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

  analyze
    .command('cfg')
    .description('Build control flow graph for a function')
    .requiredOption('--file <path>', 'Source file')
    .requiredOption('--function <name>', 'Function name')
    .action((opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const ctx = createExecutionContext(globalOpts);

      const project = new Project({ tsConfigFilePath: path.resolve(ctx.tsconfig) });
      const cfg = buildCFG(project, path.resolve(opts.file), opts.function, ctx.logger);

      if (!cfg) {
        ctx.logger.error('analyze', 'could not build CFG', { file: opts.file, function: opts.function });
        process.exitCode = 1;
        return;
      }

      if (globalOpts.json) {
        process.stdout.write(JSON.stringify(cfg, null, 2) + '\n');
      } else {
        process.stdout.write(`CFG for ${cfg.functionName}: ${cfg.blocks.length} blocks\n`);
        for (const block of cfg.blocks) {
          const succs = block.successors.join(', ') || 'none';
          process.stdout.write(`  [${block.id}] ${block.type}:${block.label} → [${succs}]`);
          if (block.calls.length > 0) {
            process.stdout.write(` calls: ${block.calls.map((c) => c.target).join(', ')}`);
          }
          process.stdout.write('\n');
        }
      }
    });

  analyze
    .command('dfg')
    .description('Build data flow graph for a function')
    .requiredOption('--file <path>', 'Source file')
    .requiredOption('--function <name>', 'Function name')
    .action((opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const ctx = createExecutionContext(globalOpts);

      const project = new Project({ tsConfigFilePath: path.resolve(ctx.tsconfig) });
      const dfg = buildDFG(project, path.resolve(opts.file), opts.function, ctx.logger);

      if (!dfg) {
        ctx.logger.error('analyze', 'could not build DFG', { file: opts.file, function: opts.function });
        process.exitCode = 1;
        return;
      }

      if (globalOpts.json) {
        process.stdout.write(JSON.stringify(dfg, null, 2) + '\n');
      } else {
        process.stdout.write(`DFG for ${dfg.functionName}: ${dfg.nodes.length} nodes, ${dfg.edges.length} edges\n`);
        for (const node of dfg.nodes) {
          process.stdout.write(`  [${node.id}] ${node.type}:${node.name}`);
          if (node.expression) process.stdout.write(` = ${node.expression}`);
          if (node.sourceFile) process.stdout.write(` (from ${path.basename(node.sourceFile)})`);
          process.stdout.write('\n');
        }
        process.stdout.write('\nEdges:\n');
        for (const edge of dfg.edges) {
          process.stdout.write(`  [${edge.from}] → [${edge.to}] (${edge.type})\n`);
        }
      }
    });

  analyze
    .command('call-graph')
    .description('Build cross-file call graph')
    .option('--dir <path>', 'Project root directory', '.')
    .option('--function <name>', 'Show callers/callees for specific function')
    .action((opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const ctx = createExecutionContext(globalOpts);
      const rootDir = path.resolve(opts.dir);

      const graph = buildCallGraph(rootDir, ctx.logger);

      if (opts.function) {
        const matching = [...graph.nodes.values()].filter((n) => n.name === opts.function);
        if (matching.length === 0) {
          ctx.logger.error('analyze', 'function not found in call graph', { function: opts.function });
          process.exitCode = 1;
          return;
        }

        for (const node of matching) {
          const result = {
            name: node.name,
            file: path.relative(rootDir, node.filePath),
            type: node.type,
            exported: node.exported,
            calls: node.calls.map((c) => ({ name: c.name, file: path.relative(rootDir, c.filePath) })),
            calledBy: node.calledBy.map((c) => ({ name: c.name, file: path.relative(rootDir, c.filePath) })),
          };

          if (globalOpts.json) {
            process.stdout.write(JSON.stringify(result, null, 2) + '\n');
          } else {
            process.stdout.write(`${result.name} (${result.file}) [${result.type}${result.exported ? ', exported' : ''}]\n`);
            process.stdout.write(`  Calls: ${result.calls.map((c) => `${c.name} (${c.file})`).join(', ') || 'none'}\n`);
            process.stdout.write(`  Called by: ${result.calledBy.map((c) => `${c.name} (${c.file})`).join(', ') || 'none'}\n`);
          }
        }
        return;
      }

      if (globalOpts.json) {
        const result = {
          stats: graph.stats,
          testFiles: graph.testFiles.map((f) => path.relative(rootDir, f)),
          sourceFiles: graph.sourceFiles.map((f) => path.relative(rootDir, f)),
          functions: [...graph.nodes.values()].map((n) => ({
            name: n.name,
            file: path.relative(rootDir, n.filePath),
            type: n.type,
            exported: n.exported,
            callCount: n.calls.length,
            calledByCount: n.calledBy.length,
          })),
        };
        process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      } else {
        process.stdout.write(`Functions: ${graph.stats.functionCount}\n`);
        process.stdout.write(`Call edges: ${graph.stats.callEdgeCount}\n`);
        process.stdout.write(`Exported: ${graph.stats.exportedFunctionCount}\n`);
        process.stdout.write(`Source files: ${graph.stats.sourceFileCount}\n`);
        process.stdout.write(`Test files: ${graph.stats.testFileCount}\n`);

        process.stdout.write('\nFunctions:\n');
        for (const [, node] of graph.nodes) {
          const rel = path.relative(rootDir, node.filePath);
          const callsStr = node.calls.length > 0 ? ` → ${node.calls.map((c) => c.name).join(', ')}` : '';
          const byStr = node.calledBy.length > 0 ? ` ← ${node.calledBy.map((c) => c.name).join(', ')}` : '';
          process.stdout.write(`  ${node.name} (${rel})${callsStr}${byStr}\n`);
        }
      }
    });
}
