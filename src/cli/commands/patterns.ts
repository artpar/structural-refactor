import type { Command } from 'commander';
import path from 'node:path';
import { createExecutionContext } from '../execute.js';
import { analyzePatterns } from '../../patterns/assembler.js';

export function registerPatterns(program: Command): void {
  const patterns = program
    .command('patterns')
    .description('Detect architecture and design patterns');

  patterns
    .command('detect')
    .description('Full pattern detection report')
    .option('--dir <path>', 'Project root directory', '.')
    .action((opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const ctx = createExecutionContext(globalOpts);
      const rootDir = path.resolve(opts.dir);
      const report = analyzePatterns(rootDir, ctx.logger);

      if (globalOpts.json) {
        process.stdout.write(JSON.stringify(report, null, 2) + '\n');
        return;
      }

      process.stdout.write(`Project: ${report.projectType}${report.framework ? ` (${report.framework})` : ''}\n`);
      process.stdout.write(`Patterns found: ${report.stats.totalPatterns}\n`);
      process.stdout.write(`Coverage: ${report.stats.coveragePercent}% of files\n\n`);

      for (const [category, pats] of Object.entries(report.patternsByCategory)) {
        if (pats.length === 0) continue;
        process.stdout.write(`${category.toUpperCase()}:\n`);
        for (const p of pats) {
          const pct = Math.round(p.confidence * 100);
          process.stdout.write(`  ${p.pattern} (${pct}% confidence)\n`);
          for (const e of p.evidence) {
            process.stdout.write(`    - ${e}\n`);
          }
          for (const loc of p.locations.slice(0, 5)) {
            process.stdout.write(`    @ ${path.relative(rootDir, loc.filePath)}:${loc.line} ${loc.unitName}\n`);
          }
          if (p.locations.length > 5) {
            process.stdout.write(`    ... and ${p.locations.length - 5} more locations\n`);
          }
        }
        process.stdout.write('\n');
      }
    });

  patterns
    .command('list')
    .description('List detected patterns')
    .option('--dir <path>', 'Project root directory', '.')
    .option('--category <cat>', 'Filter by category (creational, structural, behavioral, architectural, framework)')
    .action((opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const ctx = createExecutionContext(globalOpts);
      const rootDir = path.resolve(opts.dir);
      const report = analyzePatterns(rootDir, ctx.logger);

      let pats = report.patterns;
      if (opts.category) {
        pats = report.patternsByCategory[opts.category as keyof typeof report.patternsByCategory] ?? [];
      }

      if (globalOpts.json) {
        process.stdout.write(JSON.stringify(pats, null, 2) + '\n');
        return;
      }

      for (const p of pats) {
        const pct = Math.round(p.confidence * 100);
        process.stdout.write(`${p.category}/${p.pattern} (${pct}%) — ${p.evidence[0] ?? ''}\n`);
      }
    });

  patterns
    .command('layers')
    .description('Show architectural layers')
    .option('--dir <path>', 'Project root directory', '.')
    .action((opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const ctx = createExecutionContext(globalOpts);
      const rootDir = path.resolve(opts.dir);
      const report = analyzePatterns(rootDir, ctx.logger);

      if (globalOpts.json) {
        process.stdout.write(JSON.stringify(report.layers, null, 2) + '\n');
        return;
      }

      for (const layer of report.layers) {
        const deps = layer.dependsOn.length > 0 ? ` → ${layer.dependsOn.join(', ')}` : '';
        const pats = layer.patterns.length > 0 ? ` [${layer.patterns.join(', ')}]` : '';
        process.stdout.write(`${layer.name} (${layer.files.length} files)${deps}${pats}\n`);
      }
    });

  patterns
    .command('summary')
    .description('Quick architecture summary')
    .option('--dir <path>', 'Project root directory', '.')
    .action((opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const ctx = createExecutionContext(globalOpts);
      const rootDir = path.resolve(opts.dir);
      const report = analyzePatterns(rootDir, ctx.logger);

      process.stdout.write(`${report.projectType}${report.framework ? ` (${report.framework})` : ''}\n`);
      process.stdout.write(`${report.stats.totalPatterns} patterns detected across ${report.stats.coveragePercent}% of files\n`);

      const cats = Object.entries(report.stats.byCategory);
      if (cats.length > 0) {
        process.stdout.write(`Categories: ${cats.map(([c, n]) => `${c}(${n})`).join(', ')}\n`);
      }

      process.stdout.write(`Architecture layers: ${report.layers.map((l) => l.name).join(' → ')}\n`);

      const topPatterns = report.patterns.slice(0, 5);
      if (topPatterns.length > 0) {
        process.stdout.write(`Top patterns: ${topPatterns.map((p) => `${p.pattern}(${Math.round(p.confidence * 100)}%)`).join(', ')}\n`);
      }
    });
}
