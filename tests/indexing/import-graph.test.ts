import { describe, it, expect } from 'vitest';
import {
  type ImportGraph,
  type ImportGraphEntry,
  createImportGraph,
  addEntry,
  importersOf,
  importsOf,
  allFiles,
  isReachableFrom,
} from '../../src/indexing/import-graph.js';

describe('ImportGraph', () => {
  // Build a graph representing our fixture:
  // app.ts -> utils.ts, math.ts
  // utils.ts -> math.ts
  // index.ts -> math.ts, utils.ts (re-exports)

  function buildFixtureGraph(): ImportGraph {
    let g = createImportGraph();

    g = addEntry(g, {
      filePath: '/src/math.ts',
      imports: [],
      exports: ['add', 'multiply', 'PI'],
    });

    g = addEntry(g, {
      filePath: '/src/utils.ts',
      imports: [{ source: './math', resolved: '/src/math.ts', specifiers: ['add'] }],
      exports: ['sum', 'NumberList'],
    });

    g = addEntry(g, {
      filePath: '/src/index.ts',
      imports: [
        { source: './math', resolved: '/src/math.ts', specifiers: ['add', 'multiply', 'PI'] },
        { source: './utils', resolved: '/src/utils.ts', specifiers: ['sum', 'NumberList'] },
      ],
      exports: ['add', 'multiply', 'PI', 'sum', 'NumberList'],
    });

    g = addEntry(g, {
      filePath: '/src/app.ts',
      imports: [
        { source: './utils', resolved: '/src/utils.ts', specifiers: ['sum'] },
        { source: './math', resolved: '/src/math.ts', specifiers: ['PI'] },
      ],
      exports: [],
    });

    return g;
  }

  describe('createImportGraph', () => {
    it('starts empty', () => {
      const g = createImportGraph();
      expect(allFiles(g)).toEqual([]);
    });
  });

  describe('addEntry', () => {
    it('adds files to the graph', () => {
      const g = buildFixtureGraph();
      expect(allFiles(g)).toHaveLength(4);
    });

    it('is immutable — does not modify original', () => {
      const g1 = createImportGraph();
      const g2 = addEntry(g1, {
        filePath: '/src/foo.ts',
        imports: [],
        exports: ['foo'],
      });
      expect(allFiles(g1)).toHaveLength(0);
      expect(allFiles(g2)).toHaveLength(1);
    });
  });

  describe('importersOf', () => {
    it('finds all files that import from a given file', () => {
      const g = buildFixtureGraph();
      const importers = importersOf(g, '/src/math.ts');
      expect(importers).toContain('/src/utils.ts');
      expect(importers).toContain('/src/index.ts');
      expect(importers).toContain('/src/app.ts');
      expect(importers).toHaveLength(3);
    });

    it('returns empty for file with no importers', () => {
      const g = buildFixtureGraph();
      expect(importersOf(g, '/src/app.ts')).toEqual([]);
    });

    it('returns empty for unknown file', () => {
      const g = buildFixtureGraph();
      expect(importersOf(g, '/src/unknown.ts')).toEqual([]);
    });
  });

  describe('importsOf', () => {
    it('finds all files that a given file imports', () => {
      const g = buildFixtureGraph();
      const imports = importsOf(g, '/src/app.ts');
      expect(imports).toContain('/src/utils.ts');
      expect(imports).toContain('/src/math.ts');
      expect(imports).toHaveLength(2);
    });

    it('returns empty for file with no imports', () => {
      const g = buildFixtureGraph();
      expect(importsOf(g, '/src/math.ts')).toEqual([]);
    });
  });

  describe('isReachableFrom', () => {
    it('finds direct import reachability', () => {
      const g = buildFixtureGraph();
      expect(isReachableFrom(g, '/src/math.ts', '/src/utils.ts')).toBe(true);
    });

    it('finds transitive import reachability', () => {
      const g = buildFixtureGraph();
      // app.ts -> utils.ts -> math.ts (transitive)
      expect(isReachableFrom(g, '/src/math.ts', '/src/app.ts')).toBe(true);
    });

    it('returns false for unreachable files', () => {
      const g = buildFixtureGraph();
      // math.ts does not import anything, so app.ts is not reachable from math.ts's perspective as a consumer
      expect(isReachableFrom(g, '/src/app.ts', '/src/math.ts')).toBe(false);
    });

    it('returns false for same file', () => {
      const g = buildFixtureGraph();
      expect(isReachableFrom(g, '/src/math.ts', '/src/math.ts')).toBe(false);
    });
  });
});
