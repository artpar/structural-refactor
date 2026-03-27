import { performance } from 'node:perf_hooks';
import { analyzeDependencies } from '../../src/analysis/dependency-analyzer.js';
import { createQueryEngine } from '../../src/query/engine.js';
import { analyzePatterns } from '../../src/patterns/assembler.js';
import { createLogger } from '../../src/core/logger.js';

const dir = process.argv[2] ?? '/tmp/sref-test-projects/express';

const logger = createLogger({ level: 'info', sink: (e) => {
  const ms = Math.round(performance.now() - globalStart);
  console.log(`${ms}ms [${e.scope}] ${e.message} ${JSON.stringify(e.data).slice(0, 120)}`);
}});

const globalStart = performance.now();

console.log(`\n=== Profiling: ${dir} ===\n`);

console.log('--- analyzeDependencies ---');
const t1 = performance.now();
const deps = analyzeDependencies(dir, logger);
console.log(`DONE: ${deps.stats.moduleCount} modules, ${deps.stats.internalEdgeCount} edges in ${Math.round(performance.now() - t1)}ms\n`);

console.log('--- createQueryEngine ---');
const t2 = performance.now();
const engine = createQueryEngine(dir, logger);
const stats = engine.stats();
console.log(`DONE: ${stats.totalUnits} units in ${Math.round(performance.now() - t2)}ms\n`);

console.log('--- analyzePatterns ---');
const t3 = performance.now();
const patterns = analyzePatterns(dir, logger);
console.log(`DONE: ${patterns.stats.totalPatterns} patterns in ${Math.round(performance.now() - t3)}ms\n`);

console.log(`\n=== TOTAL: ${Math.round(performance.now() - globalStart)}ms ===`);
