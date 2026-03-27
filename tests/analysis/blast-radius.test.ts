import { describe, it, expect } from 'vitest';
import {
  computeBlastRadius,
  type BlastRadiusResult,
} from '../../src/analysis/blast-radius.js';
import {
  createImportGraph,
  addEntry,
  type ImportGraph,
} from '../../src/indexing/import-graph.js';
import {
  createSymbolIndex,
  addSymbols,
  type SymbolIndex,
} from '../../src/indexing/symbol-index.js';
import { createLogger, type LogEntry } from '../../src/core/logger.js';
import { makeLogger } from "../helpers/index.js";

function buildFixture(): { graph: ImportGraph; symbols: SymbolIndex } {
  let graph = createImportGraph();
  let symbols = createSymbolIndex();

  // math.ts defines add, multiply, PI
  graph = addEntry(graph, {
    filePath: '/src/math.ts',
    imports: [],
    exports: ['add', 'multiply', 'PI'],
  });
  symbols = addSymbols(symbols, '/src/math.ts', {
    definitions: ['add', 'multiply', 'PI'],
    references: [],
  });

  // utils.ts imports add from math, defines sum
  graph = addEntry(graph, {
    filePath: '/src/utils.ts',
    imports: [{ source: './math', resolved: '/src/math.ts', specifiers: ['add'] }],
    exports: ['sum'],
  });
  symbols = addSymbols(symbols, '/src/utils.ts', {
    definitions: ['sum'],
    references: ['add'],
  });

  // index.ts re-exports from math and utils
  graph = addEntry(graph, {
    filePath: '/src/index.ts',
    imports: [
      { source: './math', resolved: '/src/math.ts', specifiers: ['add', 'multiply', 'PI'] },
      { source: './utils', resolved: '/src/utils.ts', specifiers: ['sum'] },
    ],
    exports: ['add', 'multiply', 'PI', 'sum'],
  });
  symbols = addSymbols(symbols, '/src/index.ts', {
    definitions: [],
    references: ['add', 'multiply', 'PI', 'sum'],
  });

  // app.ts imports sum from utils, PI from math
  graph = addEntry(graph, {
    filePath: '/src/app.ts',
    imports: [
      { source: './utils', resolved: '/src/utils.ts', specifiers: ['sum'] },
      { source: './math', resolved: '/src/math.ts', specifiers: ['PI'] },
    ],
    exports: [],
  });
  symbols = addSymbols(symbols, '/src/app.ts', {
    definitions: [],
    references: ['sum', 'PI'],
  });

  return { graph, symbols };
}

describe('computeBlastRadius', () => {
  describe('rename operation', () => {
    it('includes definition file and all referencing files reachable via imports', () => {
      const { graph, symbols } = buildFixture();
      const { logger } = makeLogger();

      const result = computeBlastRadius({
        operation: 'rename',
        symbolName: 'add',
        definitionFile: '/src/math.ts',
        graph,
        symbols,
        logger,
      });

      expect(result.affectedFiles).toContain('/src/math.ts');
      expect(result.affectedFiles).toContain('/src/utils.ts');
      expect(result.affectedFiles).toContain('/src/index.ts');
      // app.ts does NOT reference 'add', so it should NOT be included
      expect(result.affectedFiles).not.toContain('/src/app.ts');
    });

    it('returns only definition file when symbol has no references', () => {
      const { graph, symbols } = buildFixture();
      const { logger } = makeLogger();

      const result = computeBlastRadius({
        operation: 'rename',
        symbolName: 'multiply',
        definitionFile: '/src/math.ts',
        graph,
        symbols,
        logger,
      });

      expect(result.affectedFiles).toContain('/src/math.ts');
      expect(result.affectedFiles).toContain('/src/index.ts'); // re-exports multiply
      expect(result.affectedFiles).not.toContain('/src/utils.ts');
      expect(result.affectedFiles).not.toContain('/src/app.ts');
    });
  });

  describe('extract operation', () => {
    it('returns only the target file', () => {
      const { graph, symbols } = buildFixture();
      const { logger } = makeLogger();

      const result = computeBlastRadius({
        operation: 'extract',
        targetFile: '/src/utils.ts',
        graph,
        symbols,
        logger,
      });

      expect(result.affectedFiles).toEqual(['/src/utils.ts']);
    });
  });

  describe('move-file operation', () => {
    it('includes the file itself and all importers', () => {
      const { graph, symbols } = buildFixture();
      const { logger } = makeLogger();

      const result = computeBlastRadius({
        operation: 'move-file',
        targetFile: '/src/math.ts',
        graph,
        symbols,
        logger,
      });

      expect(result.affectedFiles).toContain('/src/math.ts');
      expect(result.affectedFiles).toContain('/src/utils.ts');
      expect(result.affectedFiles).toContain('/src/index.ts');
      expect(result.affectedFiles).toContain('/src/app.ts');
    });
  });

  describe('logging', () => {
    it('logs the computed blast radius', () => {
      const { graph, symbols } = buildFixture();
      const { logger, entries } = makeLogger();

      computeBlastRadius({
        operation: 'rename',
        symbolName: 'add',
        definitionFile: '/src/math.ts',
        graph,
        symbols,
        logger,
      });

      const infoLogs = entries.filter((e) => e.level === 'info' && e.scope === 'blast-radius');
      expect(infoLogs.length).toBeGreaterThanOrEqual(1);
      expect(infoLogs[0].data).toHaveProperty('affectedCount');
    });
  });
});
