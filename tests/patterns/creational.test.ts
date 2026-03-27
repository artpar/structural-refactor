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

    it('rejects class without private constructor (no partial singleton)', () => {
      const cls = unit({
        name: 'Config', kind: 'class',
        members: [
          { name: 'instance', kind: 'property', isStatic: true },
        ],
      });
      paths.set('Config', '/config.ts');
      const patterns = detectCreationalPatterns([cls], paths);
      // Private constructor is mandatory — static field alone is not enough
      expect(patterns.find((p) => p.pattern === 'singleton')).toBeUndefined();
    });

    it('does not flag non-singleton class', () => {
      const cls = unit({ name: 'User', kind: 'class', members: [{ name: 'greet', kind: 'method' }] });
      paths.set('User', '/user.ts');
      const patterns = detectCreationalPatterns([cls], paths);
      expect(patterns.find((p) => p.pattern === 'singleton')).toBeUndefined();
    });
  });

  describe('factory', () => {
    it('detects factory with NewExpression returning project type', () => {
      // Factory must have: NewExpression in body + return type matching a project class
      const userClass = unit({ name: 'User', kind: 'class' });
      const fn = unit({
        name: 'createUser', kind: 'function', returnType: 'User',
        nodeTypes: ['NewExpression', 'ReturnStatement'],
      });
      paths.set('createUser', '/factory.ts');
      paths.set('User', '/user.ts');
      const patterns = detectCreationalPatterns([fn, userClass], paths);
      const factory = patterns.find((p) => p.pattern === 'factory');
      expect(factory).toBeDefined();
      expect(factory!.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('detects factory with conditional construction', () => {
      const widgetIface = unit({ name: 'Widget', kind: 'interface' });
      const fn = unit({
        name: 'buildWidget', kind: 'function', returnType: 'Widget', complexity: 3,
        nodeTypes: ['NewExpression', 'IfStatement', 'ReturnStatement'],
      });
      paths.set('buildWidget', '/factory.ts');
      paths.set('Widget', '/widget.ts');
      const patterns = detectCreationalPatterns([fn, widgetIface], paths);
      const factory = patterns.find((p) => p.pattern === 'factory');
      expect(factory).toBeDefined();
      expect(factory!.confidence).toBeGreaterThanOrEqual(0.8);
    });

    it('does not flag function returning void', () => {
      const fn = unit({ name: 'processData', kind: 'function', returnType: 'void' });
      paths.set('processData', '/process.ts');
      const patterns = detectCreationalPatterns([fn], paths);
      expect(patterns.find((p) => p.pattern === 'factory')).toBeUndefined();
    });

    it('does not flag function returning Promise<void>', () => {
      const fn = unit({
        name: 'setupPage', kind: 'function', returnType: 'Promise<void>',
        nodeTypes: ['CallExpression', 'AwaitExpression'],
      });
      paths.set('setupPage', '/setup.ts');
      const patterns = detectCreationalPatterns([fn], paths);
      expect(patterns.find((p) => p.pattern === 'factory')).toBeUndefined();
    });

    it('does not flag function returning Record<string, string>', () => {
      const fn = unit({
        name: 'getConfig', kind: 'function', returnType: 'Record<string, string>',
        nodeTypes: ['ObjectExpression', 'ReturnStatement'],
      });
      paths.set('getConfig', '/config.ts');
      const patterns = detectCreationalPatterns([fn], paths);
      expect(patterns.find((p) => p.pattern === 'factory')).toBeUndefined();
    });

    it('does not flag function returning array', () => {
      const fn = unit({
        name: 'filterItems', kind: 'function', returnType: 'T[]',
        nodeTypes: ['CallExpression', 'ReturnStatement'],
      });
      paths.set('filterItems', '/filter.ts');
      const patterns = detectCreationalPatterns([fn], paths);
      expect(patterns.find((p) => p.pattern === 'factory')).toBeUndefined();
    });

    it('does not flag React hook', () => {
      const fn = unit({
        name: 'useCounter', kind: 'function', returnType: 'CounterState',
        nodeTypes: ['NewExpression', 'ReturnStatement'],
      });
      paths.set('useCounter', '/hooks.ts');
      const patterns = detectCreationalPatterns([fn], paths);
      expect(patterns.find((p) => p.pattern === 'factory')).toBeUndefined();
    });

    it('does not flag test helper', () => {
      const fn = unit({
        name: 'createTestUser', kind: 'function', returnType: 'User',
        nodeTypes: ['NewExpression', 'ReturnStatement'],
      });
      paths.set('createTestUser', '/tests/helpers.test.ts');
      const userClass = unit({ name: 'User', kind: 'class' });
      paths.set('User', '/user.ts');
      const patterns = detectCreationalPatterns([fn, userClass], paths);
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
