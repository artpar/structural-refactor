import { performance } from 'node:perf_hooks';
import fs from 'node:fs';
import { parseSync } from 'oxc-parser';
import { discoverFiles } from '../../src/indexing/file-index.js';
import { extractAll } from '../../src/scanner/extractors.js';
import { createLogger } from '../../src/core/logger.js';

const dir = process.argv[2] ?? '/tmp/sref-test-projects/next.js';
const logger = createLogger({ level: 'error', sink: () => {} });

console.log(`\n=== Perf Profile: ${dir} ===\n`);

// Phase 1: File discovery
let t = performance.now();
const files = discoverFiles(dir, logger);
console.log(`1. DISCOVER: ${Math.round(performance.now() - t)}ms — ${files.length} files`);

// Phase 2: Read all files
t = performance.now();
const contents = new Map<string, string>();
let totalBytes = 0;
for (const f of files) {
  const content = fs.readFileSync(f, 'utf-8');
  contents.set(f, content);
  totalBytes += content.length;
}
console.log(`2. READ ALL: ${Math.round(performance.now() - t)}ms — ${Math.round(totalBytes / 1024 / 1024)}MB`);

// Phase 3: oxc parseSync only (no extraction)
t = performance.now();
let parseCount = 0;
for (const [path, content] of contents) {
  try { parseSync(path, content); parseCount++; } catch {}
}
console.log(`3. PARSE ALL (oxc only): ${Math.round(performance.now() - t)}ms — ${parseCount} parsed`);

// Phase 4: extractAll (parse + extract imports/exports/units/calls)
t = performance.now();
let extractCount = 0;
for (const [path, content] of contents) {
  try { extractAll(path, content, ''); extractCount++; } catch {}
}
console.log(`4. EXTRACT ALL (parse+extract): ${Math.round(performance.now() - t)}ms — ${extractCount} extracted`);

// Phase 5: Per-phase breakdown for extractAll
const sample = [...contents.entries()].slice(0, 500);

t = performance.now();
for (const [path, content] of sample) {
  try { parseSync(path, content); } catch {}
}
const parseTime = performance.now() - t;

t = performance.now();
for (const [path, content] of sample) {
  try { extractAll(path, content, ''); } catch {}
}
const extractTime = performance.now() - t;

const overhead = extractTime - parseTime;
console.log(`\n--- 500-file sample ---`);
console.log(`  Parse only: ${Math.round(parseTime)}ms (${(parseTime/500).toFixed(2)}ms/file)`);
console.log(`  ExtractAll: ${Math.round(extractTime)}ms (${(extractTime/500).toFixed(2)}ms/file)`);
console.log(`  Extraction overhead: ${Math.round(overhead)}ms (${(overhead/500).toFixed(2)}ms/file)`);
console.log(`  Parse is ${Math.round(parseTime/extractTime*100)}% of total`);

// Phase 6: Which part of extractAll is slow?
t = performance.now();
for (const [path, content] of sample) {
  try {
    const result = parseSync(path, content);
    // Just imports/exports (fast — module metadata)
    result.module.staticImports;
    result.module.staticExports;
  } catch {}
}
console.log(`  Parse+module metadata: ${Math.round(performance.now() - t)}ms`);

console.log(`\n--- Estimates for ${files.length} files ---`);
const perFile = extractTime / 500;
console.log(`  Sequential: ${Math.round(perFile * files.length)}ms`);
console.log(`  4 workers: ~${Math.round(perFile * files.length / 4)}ms`);
console.log(`  8 workers: ~${Math.round(perFile * files.length / 8)}ms`);
