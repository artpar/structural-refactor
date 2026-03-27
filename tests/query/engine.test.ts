import { describe, it, expect } from 'vitest';
import path from 'node:path';
import {
  createQueryEngine,
  type QueryEngine,
} from '../../src/query/engine.js';
import { createLogger } from '../../src/core/logger.js';

const FIXTURES = path.resolve(import.meta.dirname, '../fixtures');

function makeLogger() {
  return createLogger({ level: 'trace', sink: () => {} });
}

describe('QueryEngine', () => {
  let engine: QueryEngine;

  // Build once for all tests in this suite
  it('builds from a project directory', () => {
    engine = createQueryEngine(path.join(FIXTURES, 'simple-project'), makeLogger());
    expect(engine).toBeDefined();
  });

  describe('find', () => {
    it('finds code units by exact name', () => {
      engine = createQueryEngine(path.join(FIXTURES, 'simple-project'), makeLogger());
      const results = engine.find('add');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].name).toBe('add');
    });

    it('returns empty for unknown name', () => {
      engine = createQueryEngine(path.join(FIXTURES, 'simple-project'), makeLogger());
      expect(engine.find('nonexistent')).toEqual([]);
    });
  });

  describe('list', () => {
    it('lists all code units', () => {
      engine = createQueryEngine(path.join(FIXTURES, 'simple-project'), makeLogger());
      const all = engine.list();
      expect(all.length).toBeGreaterThanOrEqual(5);
    });

    it('filters by kind', () => {
      engine = createQueryEngine(path.join(FIXTURES, 'simple-project'), makeLogger());
      const functions = engine.list({ kind: 'function' });
      expect(functions.length).toBeGreaterThanOrEqual(3);
      expect(functions.every((u) => u.kind === 'function')).toBe(true);
    });

    it('filters by exported', () => {
      engine = createQueryEngine(path.join(FIXTURES, 'simple-project'), makeLogger());
      const exported = engine.list({ exported: true });
      expect(exported.every((u) => u.exported)).toBe(true);
    });

    it('filters by file pattern', () => {
      engine = createQueryEngine(path.join(FIXTURES, 'simple-project'), makeLogger());
      const mathOnly = engine.list({ filePattern: 'math.ts' });
      expect(mathOnly.length).toBeGreaterThanOrEqual(2);
      expect(mathOnly.every((u) => u.filePath.endsWith('math.ts'))).toBe(true);
    });
  });

  describe('similar', () => {
    it('finds structurally similar functions', () => {
      engine = createQueryEngine(path.join(FIXTURES, 'simple-project'), makeLogger());
      // add and multiply have identical structure: (number, number) => number, body: return a OP b
      const results = engine.similar('add');
      expect(results.length).toBeGreaterThanOrEqual(1);
      const names = results.map((r) => r.unit.name);
      expect(names).toContain('multiply');
    });

    it('returns similarity scores', () => {
      engine = createQueryEngine(path.join(FIXTURES, 'simple-project'), makeLogger());
      const results = engine.similar('add');
      for (const r of results) {
        expect(r.score).toBeGreaterThan(0);
        expect(r.score).toBeLessThanOrEqual(1);
      }
    });

    it('returns empty for unknown name', () => {
      engine = createQueryEngine(path.join(FIXTURES, 'simple-project'), makeLogger());
      expect(engine.similar('nonexistent')).toEqual([]);
    });
  });

  describe('searchBySignature', () => {
    it('finds functions matching param types', () => {
      engine = createQueryEngine(path.join(FIXTURES, 'simple-project'), makeLogger());
      const results = engine.searchBySignature({ paramTypes: ['number', 'number'] });
      expect(results.length).toBeGreaterThanOrEqual(2);
      const names = results.map((u) => u.name);
      expect(names).toContain('add');
      expect(names).toContain('multiply');
    });

    it('finds functions matching return type', () => {
      engine = createQueryEngine(path.join(FIXTURES, 'simple-project'), makeLogger());
      const results = engine.searchBySignature({ returnType: 'string' });
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('finds functions matching param count', () => {
      engine = createQueryEngine(path.join(FIXTURES, 'simple-project'), makeLogger());
      const results = engine.searchBySignature({ paramCount: 1 });
      expect(results.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('searchByPattern', () => {
    it('finds classes', () => {
      engine = createQueryEngine(path.join(FIXTURES, 'angular-project'), makeLogger());
      const results = engine.searchByPattern({ kind: 'class' });
      expect(results.length).toBeGreaterThanOrEqual(2);
    });

    it('finds units with specific member', () => {
      engine = createQueryEngine(path.join(FIXTURES, 'angular-project'), makeLogger());
      const results = engine.searchByPattern({ hasMember: 'getUsers' });
      expect(results.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('stats', () => {
    it('provides index statistics', () => {
      engine = createQueryEngine(path.join(FIXTURES, 'simple-project'), makeLogger());
      const stats = engine.stats();
      expect(stats.totalUnits).toBeGreaterThanOrEqual(5);
      expect(stats.byKind.function).toBeGreaterThanOrEqual(3);
      expect(stats.fileCount).toBeGreaterThanOrEqual(4);
    });
  });
});
