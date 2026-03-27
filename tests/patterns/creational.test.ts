import { describe, it, expect } from 'vitest';
import { detectCreationalPatterns } from '../../src/patterns/creational.js';
import type { CodeUnitRecord } from '../../src/scanner/types.js';

function unit(overrides: Partial<CodeUnitRecord>): CodeUnitRecord {
  return {
    name: '', kind: 'function', line: 1, exported: false, isAsync: false,
    params: [], returnType: '', members: [], typeTokens: [], nodeTypes: [],
    statementTypes: [], bodyLineCount: 0, complexity: 0,
    ...overrides,
  };
}

const paths = new Map<string, string>();

describe('creational detectors', () => {
  describe('singleton', () => {
    it('detects private constructor + static getInstance', () => {
      const cls = unit({
        name: 'DB', kind: 'class',
        members: [
          { name: 'constructor', kind: 'constructor', visibility: 'private' },
          { name: '_instance', kind: 'property', isStatic: true },
          { name: 'getInstance', kind: 'method', isStatic: true },
        ],
      });
      paths.set('DB', '/db.ts');
      const patterns = detectCreationalPatterns([cls], paths);
      const singleton = patterns.find((p) => p.pattern === 'singleton');
      expect(singleton).toBeDefined();
      expect(singleton!.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('detects partial singleton (static instance only)', () => {
      const cls = unit({
        name: 'Config', kind: 'class',
        members: [
          { name: 'instance', kind: 'property', isStatic: true },
        ],
      });
      paths.set('Config', '/config.ts');
      const patterns = detectCreationalPatterns([cls], paths);
      const singleton = patterns.find((p) => p.pattern === 'singleton');
      expect(singleton).toBeDefined();
      expect(singleton!.confidence).toBeLessThan(0.5);
    });

    it('does not flag non-singleton class', () => {
      const cls = unit({ name: 'User', kind: 'class', members: [{ name: 'greet', kind: 'method' }] });
      paths.set('User', '/user.ts');
      const patterns = detectCreationalPatterns([cls], paths);
      expect(patterns.find((p) => p.pattern === 'singleton')).toBeUndefined();
    });
  });

  describe('factory', () => {
    it('detects create* function returning object type', () => {
      const fn = unit({ name: 'createUser', kind: 'function', returnType: 'User', complexity: 0 });
      paths.set('createUser', '/factory.ts');
      const patterns = detectCreationalPatterns([fn], paths);
      const factory = patterns.find((p) => p.pattern === 'factory');
      expect(factory).toBeDefined();
    });

    it('detects factory with conditional logic', () => {
      const fn = unit({ name: 'buildWidget', kind: 'function', returnType: 'Widget', complexity: 3 });
      paths.set('buildWidget', '/factory.ts');
      const patterns = detectCreationalPatterns([fn], paths);
      const factory = patterns.find((p) => p.pattern === 'factory');
      expect(factory).toBeDefined();
      expect(factory!.confidence).toBeGreaterThanOrEqual(0.8);
    });

    it('does not flag plain functions', () => {
      const fn = unit({ name: 'processData', kind: 'function', returnType: 'void' });
      paths.set('processData', '/process.ts');
      const patterns = detectCreationalPatterns([fn], paths);
      expect(patterns.find((p) => p.pattern === 'factory')).toBeUndefined();
    });
  });

  describe('builder', () => {
    it('detects builder with set*/with* methods + build', () => {
      const cls = unit({
        name: 'QueryBuilder', kind: 'class',
        members: [
          { name: 'setTable', kind: 'method' },
          { name: 'setWhere', kind: 'method' },
          { name: 'addJoin', kind: 'method' },
          { name: 'build', kind: 'method' },
        ],
      });
      paths.set('QueryBuilder', '/qb.ts');
      const patterns = detectCreationalPatterns([cls], paths);
      const builder = patterns.find((p) => p.pattern === 'builder');
      expect(builder).toBeDefined();
    });

    it('does not flag class without build method', () => {
      const cls = unit({
        name: 'Utils', kind: 'class',
        members: [{ name: 'setName', kind: 'method' }, { name: 'getName', kind: 'method' }],
      });
      paths.set('Utils', '/u.ts');
      const patterns = detectCreationalPatterns([cls], paths);
      expect(patterns.find((p) => p.pattern === 'builder')).toBeUndefined();
    });
  });
});
