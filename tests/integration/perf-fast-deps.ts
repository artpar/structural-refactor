import { performance } from 'node:perf_hooks';
import { analyzeDependencies, analyzeDependenciesFast } from '../../src/analysis/dependency-analyzer.js';
import { createLogger } from '../../src/core/logger.js';

const dir = process.argv[2] ?? '/tmp/sref-test-projects/next.js';
const logger = createLogger({ level: 'info', sink: (e) => {
  if (e.scope === 'dependency-analyzer' || e.scope === 'index-store') {
    const ms = Math.round(performance.now() - globalStart);
    console.log(`  ${ms}ms [${e.scope}] ${e.message} ${JSON.stringify(e.data).slice(0, 100)}`);
  }
}});
const globalStart = performance.now();

console.log(`\n=== Dependency Analysis: ${dir} ===\n`);

console.log('--- FAST (Level 1 index) ---');
const t1 = performance.now();
const fast = analyzeDependenciesFast(dir, logger);
console.log(`FAST: ${Math.round(performance.now() - t1)}ms — ${fast.stats.moduleCount} modules, ${fast.stats.internalEdgeCount} edges\n`);

console.log('--- FAST WARM (cached index) ---');
const t2 = performance.now();
const fastWarm = analyzeDependenciesFast(dir, logger);
console.log(`FAST WARM: ${Math.round(performance.now() - t2)}ms — ${fastWarm.stats.moduleCount} modules, ${fastWarm.stats.internalEdgeCount} edges\n`);

console.log('--- ORIGINAL (full extractAll) ---');
const t3 = performance.now();
const orig = analyzeDependencies(dir, logger);
console.log(`ORIGINAL: ${Math.round(performance.now() - t3)}ms — ${orig.stats.moduleCount} modules, ${orig.stats.internalEdgeCount} edges\n`);

console.log(`=== Speedup: ${Math.round((performance.now() - t3) / (performance.now() - t2 - (performance.now() - t3)))}x (warm) ===`);
