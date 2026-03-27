import { describe, it, expect } from 'vitest';
import { detectBehavioralPatterns } from '../../src/patterns/behavioral.js';
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

describe('behavioral detectors', () => {
  describe('observer', () => {
    it('detects class extending EventEmitter', () => {
      const cls = unit({
        name: 'Bus', kind: 'class', extends: 'EventEmitter',
        members: [{ name: 'dispatch', kind: 'method' }],
      });
      paths.set('Bus', '/bus.ts');
      const patterns = detectBehavioralPatterns([cls], paths);
      expect(patterns.find((p) => p.pattern === 'observer')).toBeDefined();
    });

    it('detects class with on/off/emit methods', () => {
      const cls = unit({
        name: 'Emitter', kind: 'class',
        members: [
          { name: 'on', kind: 'method' },
          { name: 'off', kind: 'method' },
          { name: 'emit', kind: 'method' },
        ],
      });
      paths.set('Emitter', '/emitter.ts');
      const patterns = detectBehavioralPatterns([cls], paths);
      expect(patterns.find((p) => p.pattern === 'observer')).toBeDefined();
    });

    it('detects subscribe/unsubscribe pattern', () => {
      const cls = unit({
        name: 'Store', kind: 'class',
        members: [
          { name: 'subscribe', kind: 'method' },
          { name: 'unsubscribe', kind: 'method' },
        ],
      });
      paths.set('Store', '/store.ts');
      const patterns = detectBehavioralPatterns([cls], paths);
      expect(patterns.find((p) => p.pattern === 'observer')).toBeDefined();
    });

    it('does not flag plain class', () => {
      const cls = unit({ name: 'Calc', kind: 'class', members: [{ name: 'add', kind: 'method' }] });
      paths.set('Calc', '/c.ts');
      const patterns = detectBehavioralPatterns([cls], paths);
      expect(patterns.find((p) => p.pattern === 'observer')).toBeUndefined();
    });
  });

  describe('middleware', () => {
    it('detects Express-style (req, res, next)', () => {
      const fn = unit({
        name: 'authMiddleware', kind: 'function',
        params: [{ name: 'req', type: 'Request' }, { name: 'res', type: 'Response' }, { name: 'next', type: 'NextFunction' }],
      });
      paths.set('authMiddleware', '/mw.ts');
      const patterns = detectBehavioralPatterns([fn], paths);
      expect(patterns.find((p) => p.pattern === 'middleware')).toBeDefined();
    });

    it('detects Koa-style (ctx, next)', () => {
      const fn = unit({
        name: 'logger', kind: 'function',
        params: [{ name: 'ctx', type: 'Context' }, { name: 'next', type: 'Next' }],
      });
      paths.set('logger', '/mw.ts');
      const patterns = detectBehavioralPatterns([fn], paths);
      expect(patterns.find((p) => p.pattern === 'middleware')).toBeDefined();
    });

    it('does not flag 2-param non-middleware', () => {
      const fn = unit({
        name: 'add', kind: 'function',
        params: [{ name: 'a', type: 'number' }, { name: 'b', type: 'number' }],
      });
      paths.set('add', '/math.ts');
      const patterns = detectBehavioralPatterns([fn], paths);
      expect(patterns.find((p) => p.pattern === 'middleware')).toBeUndefined();
    });
  });

  describe('command', () => {
    it('detects class with single execute method', () => {
      const cls = unit({
        name: 'SendEmailCommand', kind: 'class',
        members: [{ name: 'execute', kind: 'method' }],
      });
      paths.set('SendEmailCommand', '/cmd.ts');
      const patterns = detectBehavioralPatterns([cls], paths);
      expect(patterns.find((p) => p.pattern === 'command')).toBeDefined();
    });

    it('does not flag class with multiple methods', () => {
      const cls = unit({
        name: 'Service', kind: 'class',
        members: [{ name: 'execute', kind: 'method' }, { name: 'validate', kind: 'method' }],
      });
      paths.set('Service', '/svc.ts');
      const patterns = detectBehavioralPatterns([cls], paths);
      expect(patterns.find((p) => p.pattern === 'command')).toBeUndefined();
    });
  });

  describe('strategy', () => {
    it('detects interface with single method + multiple implementations', () => {
      const iface = unit({
        name: 'Sorter', kind: 'interface',
        members: [{ name: 'sort', kind: 'method' }],
      });
      const impl1 = unit({ name: 'QuickSort', kind: 'class', implements: ['Sorter'], members: [{ name: 'sort', kind: 'method' }] });
      const impl2 = unit({ name: 'MergeSort', kind: 'class', implements: ['Sorter'], members: [{ name: 'sort', kind: 'method' }] });
      paths.set('Sorter', '/sort.ts');
      paths.set('QuickSort', '/qs.ts');
      paths.set('MergeSort', '/ms.ts');
      const patterns = detectBehavioralPatterns([iface, impl1, impl2], paths);
      const strategy = patterns.find((p) => p.pattern === 'strategy');
      expect(strategy).toBeDefined();
      expect(strategy!.relatedUnits).toContain('Sorter');
      expect(strategy!.relatedUnits).toContain('QuickSort');
      expect(strategy!.relatedUnits).toContain('MergeSort');
    });
  });
});
