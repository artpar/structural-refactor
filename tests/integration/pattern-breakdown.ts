import { analyzePatterns } from '../../src/patterns/assembler.js';
import { createLogger } from '../../src/core/logger.js';

const dir = process.argv[2] ?? '/tmp/sref-test-projects/nest';
const logger = createLogger({ level: 'error', sink: () => {} });

const r = analyzePatterns(dir, logger);
const counts: Record<string, number> = {};
for (const p of r.patterns) counts[p.pattern] = (counts[p.pattern] ?? 0) + 1;

console.log('Pattern counts:', counts);
console.log('Total:', r.stats.totalPatterns);

// Show the worst offender
const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
console.log('\nTop patterns:');
for (const [name, count] of sorted.slice(0, 5)) {
  console.log(`  ${name}: ${count}`);
  // Show first 3 examples
  const examples = r.patterns.filter((p) => p.pattern === name).slice(0, 3);
  for (const ex of examples) {
    console.log(`    ${ex.evidence[0]} (${Math.round(ex.confidence * 100)}%)`);
  }
}
