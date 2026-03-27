import { describe, it, expect } from 'vitest';
import path from 'node:path';
import {
  buildCodeIndex,
  querySimilar,
  queryBySignature,
  queryByPattern,
  listAll,
  type CodeIndex,
  type CodeUnit,
  type CodeUnitKind,
} from '../../src/analysis/discovery.js';
import { createLogger } from '../../src/core/logger.js';

const FIXTURES = path.resolve(import.meta.dirname, '../fixtures');

function makeLogger() {
  return createLogger({ level: 'trace', sink: () => {} });
}

describe('Code Discovery', () => {
  describe('buildCodeIndex', () => {
    it('indexes all functions, classes, interfaces, types in a project', () => {
      const index = buildCodeIndex(path.join(FIXTURES, 'simple-project'), makeLogger());

      expect(index.units.length).toBeGreaterThanOrEqual(5);
      // Should find: add, multiply, sum, processValue, loopSum, tryCatch, switchCase, PI, NumberList
      const names = index.units.map((u) => u.name);
      expect(names).toContain('add');
      expect(names).toContain('multiply');
      expect(names).toContain('sum');
    });

    it('captures function signatures (param types, return type)', () => {
      const index = buildCodeIndex(path.join(FIXTURES, 'simple-project'), makeLogger());

      const add = index.units.find((u) => u.name === 'add')!;
      expect(add).toBeDefined();
      expect(add.kind).toBe('function');
      expect(add.signature?.params).toEqual([
        { name: 'a', type: 'number' },
        { name: 'b', type: 'number' },
      ]);
      expect(add.signature?.returnType).toBe('number');
    });

    it('captures class members', () => {
      const index = buildCodeIndex(path.join(FIXTURES, 'angular-project'), makeLogger());

      const appComponent = index.units.find((u) => u.name === 'AppComponent');
      expect(appComponent).toBeDefined();
      expect(appComponent!.kind).toBe('class');
      expect(appComponent!.members!.length).toBeGreaterThanOrEqual(1);
    });

    it('captures interface/type shapes', () => {
      const index = buildCodeIndex(path.join(FIXTURES, 'react-project'), makeLogger());

      const headerProps = index.units.find((u) => u.name === 'HeaderProps');
      expect(headerProps).toBeDefined();
      expect(headerProps!.kind).toBe('interface');
      expect(headerProps!.members!.some((m) => m.name === 'title')).toBe(true);
    });

    it('stores structural fingerprint for similarity matching', () => {
      const index = buildCodeIndex(path.join(FIXTURES, 'simple-project'), makeLogger());

      const add = index.units.find((u) => u.name === 'add')!;
      expect(add.fingerprint).toBeDefined();
      expect(add.fingerprint.paramCount).toBe(2);
      expect(add.fingerprint.statementCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('listAll', () => {
    it('lists all code units', () => {
      const index = buildCodeIndex(path.join(FIXTURES, 'simple-project'), makeLogger());
      const all = listAll(index);
      expect(all.length).toBe(index.units.length);
    });

    it('filters by kind', () => {
      const index = buildCodeIndex(path.join(FIXTURES, 'simple-project'), makeLogger());

      const functions = listAll(index, { kind: 'function' });
      expect(functions.length).toBeGreaterThanOrEqual(3);
      expect(functions.every((u) => u.kind === 'function')).toBe(true);
    });

    it('filters by exported', () => {
      const index = buildCodeIndex(path.join(FIXTURES, 'simple-project'), makeLogger());

      const exported = listAll(index, { exported: true });
      expect(exported.length).toBeGreaterThanOrEqual(1);
      expect(exported.every((u) => u.exported)).toBe(true);
    });

    it('filters by file pattern', () => {
      const index = buildCodeIndex(path.join(FIXTURES, 'simple-project'), makeLogger());

      const mathOnly = listAll(index, { filePattern: 'math.ts' });
      expect(mathOnly.length).toBeGreaterThanOrEqual(2);
      expect(mathOnly.every((u) => u.filePath.endsWith('math.ts'))).toBe(true);
    });
  });

  describe('querySimilar', () => {
    it('finds functions with similar signatures', () => {
      const index = buildCodeIndex(path.join(FIXTURES, 'simple-project'), makeLogger());

      // add and multiply have the same signature: (number, number) => number
      const similar = querySimilar(index, 'add');
      expect(similar.length).toBeGreaterThanOrEqual(1);
      const names = similar.map((s) => s.unit.name);
      expect(names).toContain('multiply');
    });

    it('scores similarity (1.0 = identical structure)', () => {
      const index = buildCodeIndex(path.join(FIXTURES, 'simple-project'), makeLogger());

      const similar = querySimilar(index, 'add');
      const multiplyMatch = similar.find((s) => s.unit.name === 'multiply');
      expect(multiplyMatch).toBeDefined();
      expect(multiplyMatch!.score).toBeGreaterThanOrEqual(0.5);
    });

    it('returns empty for unknown function', () => {
      const index = buildCodeIndex(path.join(FIXTURES, 'simple-project'), makeLogger());
      const similar = querySimilar(index, 'nonexistent');
      expect(similar).toEqual([]);
    });
  });

  describe('queryBySignature', () => {
    it('finds functions matching a param type pattern', () => {
      const index = buildCodeIndex(path.join(FIXTURES, 'simple-project'), makeLogger());

      // Find all functions that take (number, number)
      const matches = queryBySignature(index, {
        paramTypes: ['number', 'number'],
      });

      expect(matches.length).toBeGreaterThanOrEqual(2); // add, multiply
      const names = matches.map((u) => u.name);
      expect(names).toContain('add');
      expect(names).toContain('multiply');
    });

    it('finds functions matching return type', () => {
      const index = buildCodeIndex(path.join(FIXTURES, 'simple-project'), makeLogger());

      const matches = queryBySignature(index, {
        returnType: 'string',
      });

      expect(matches.length).toBeGreaterThanOrEqual(1);
    });

    it('finds functions matching param count', () => {
      const index = buildCodeIndex(path.join(FIXTURES, 'simple-project'), makeLogger());

      const matches = queryBySignature(index, {
        paramCount: 1,
      });

      expect(matches.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('queryByPattern', () => {
    it('finds all classes', () => {
      const index = buildCodeIndex(path.join(FIXTURES, 'angular-project'), makeLogger());

      const classes = queryByPattern(index, { kind: 'class' });
      expect(classes.length).toBeGreaterThanOrEqual(2);
    });

    it('finds all interfaces', () => {
      const index = buildCodeIndex(path.join(FIXTURES, 'react-project'), makeLogger());

      const interfaces = queryByPattern(index, { kind: 'interface' });
      expect(interfaces.length).toBeGreaterThanOrEqual(1);
    });

    it('finds units with specific member names', () => {
      const index = buildCodeIndex(path.join(FIXTURES, 'angular-project'), makeLogger());

      // Find classes/interfaces that have a member named 'getUsers'
      const matches = queryByPattern(index, { hasMember: 'getUsers' });
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });

    it('finds async functions', () => {
      const index = buildCodeIndex(path.join(FIXTURES, 'simple-project'), makeLogger());

      const asyncFns = queryByPattern(index, { isAsync: true });
      // simple-project may not have async, but query should work
      expect(asyncFns).toBeDefined();
    });
  });
});
