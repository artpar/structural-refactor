import { performance } from 'node:perf_hooks';
import { buildProjectIndex } from '../../src/scanner/index-store.js';
import { createLogger } from '../../src/core/logger.js';

const dir = process.argv[2] ?? '/tmp/sref-test-projects/next.js';
const logger = createLogger({ level: 'info', sink: (e) => {
  const ms = Math.round(performance.now() - globalStart);
  console.log(`${ms}ms [${e.scope}] ${e.message} ${JSON.stringify(e.data).slice(0, 120)}`);
}});
const globalStart = performance.now();

console.log(`\n=== Level 1 Index: ${dir} ===\n`);

// Cold run
console.log('--- COLD RUN ---');
const t1 = performance.now();
const index = buildProjectIndex(dir, logger);
console.log(`COLD: ${Math.round(performance.now() - t1)}ms — ${index.summaries.size} files, ${index.nameToFiles.size} names\n`);

// Warm run
console.log('--- WARM RUN ---');
const t2 = performance.now();
const index2 = buildProjectIndex(dir, logger);
console.log(`WARM: ${Math.round(performance.now() - t2)}ms — ${index2.summaries.size} files, ${index2.nameToFiles.size} names\n`);

// Query performance
console.log('--- QUERIES ---');
let t = performance.now();
const files = index.nameToFiles.get('useState') ?? [];
console.log(`find 'useState': ${(performance.now() - t).toFixed(2)}ms — ${files.length} files`);

t = performance.now();
const allNames = [...index.nameToFiles.keys()];
console.log(`list all names: ${(performance.now() - t).toFixed(2)}ms — ${allNames.length} names`);

t = performance.now();
const allExported = [...index.summaries.values()].filter(s => s.exports.length > 0);
console.log(`list exported files: ${(performance.now() - t).toFixed(2)}ms — ${allExported.length} files`);

console.log(`\n=== TOTAL: ${Math.round(performance.now() - globalStart)}ms ===`);
