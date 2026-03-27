import { describe, it, expect } from 'vitest';
import { detectStructuralPatterns } from '../../src/patterns/structural.js';
import type { CodeUnitRecord, ScanResult } from '../../src/scanner/types.js';

function unit(overrides: Partial<CodeUnitRecord>): CodeUnitRecord {
  return {
    name: '', kind: 'function', line: 1, exported: false, isAsync: false,
    params: [], returnType: '', members: [], typeTokens: [], nodeTypes: [],
    statementTypes: [], bodyLineCount: 0, complexity: 0,
    ...overrides,
  };
}

function scan(overrides: Partial<ScanResult>): ScanResult {
  return {
    filePath: '', contentHash: '', imports: [], exports: [], codeUnits: [], calls: [],
    ...overrides,
  };
}

const paths = new Map<string, string>();

describe('structural detectors', () => {
  describe('facade', () => {
    it('detects module with many imports but few exports', () => {
      const scanResult = scan({
        filePath: '/src/facade.ts',
        imports: [
          { source: './a', specifiers: ['a'], resolved: '/src/a.ts', isExternal: false },
          { source: './b', specifiers: ['b'], resolved: '/src/b.ts', isExternal: false },
          { source: './c', specifiers: ['c'], resolved: '/src/c.ts', isExternal: false },
          { source: './d', specifiers: ['d'], resolved: '/src/d.ts', isExternal: false },
        ],
        exports: [{ name: 'api', isDefault: false, isReExport: false }],
      });
      const fn = unit({ name: 'api', kind: 'function' });
      paths.set('api', '/src/facade.ts');
      const patterns = detectStructuralPatterns([fn], [scanResult], paths);
      expect(patterns.find((p) => p.pattern === 'facade')).toBeDefined();
    });

    it('does not flag module with balanced imports/exports', () => {
      const scanResult = scan({
        filePath: '/src/index.ts',
        imports: [
          { source: './a', specifiers: ['a'], resolved: '/src/a.ts', isExternal: false },
          { source: './b', specifiers: ['b'], resolved: '/src/b.ts', isExternal: false },
        ],
        exports: [
          { name: 'a', isDefault: false, isReExport: false },
          { name: 'b', isDefault: false, isReExport: false },
        ],
      });
      const patterns = detectStructuralPatterns([], [scanResult], paths);
      expect(patterns.find((p) => p.pattern === 'facade')).toBeUndefined();
    });
  });

  describe('adapter', () => {
    it('detects class implementing interface and wrapping another type', () => {
      const cls = unit({
        name: 'SqlAdapter', kind: 'class',
        implements: ['DatabasePort'],
        constructorParams: [{ name: 'mysql', type: 'MysqlClient' }],
      });
      paths.set('SqlAdapter', '/adapter.ts');
      const patterns = detectStructuralPatterns([cls], [], paths);
      expect(patterns.find((p) => p.pattern === 'adapter')).toBeDefined();
    });

    it('does not flag class implementing interface without wrapping', () => {
      const cls = unit({
        name: 'UserService', kind: 'class',
        implements: ['IUserService'],
      });
      paths.set('UserService', '/svc.ts');
      const patterns = detectStructuralPatterns([cls], [], paths);
      expect(patterns.find((p) => p.pattern === 'adapter')).toBeUndefined();
    });
  });

  describe('composite', () => {
    it('detects class with self-referencing collection + add/remove methods', () => {
      const cls = unit({
        name: 'TreeNode', kind: 'class',
        members: [
          { name: 'children', kind: 'property', type: 'TreeNode[]' },
          { name: 'addChild', kind: 'method' },
          { name: 'removeChild', kind: 'method' },
        ],
      });
      paths.set('TreeNode', '/tree.ts');
      const patterns = detectStructuralPatterns([cls], [], paths);
      const composite = patterns.find((p) => p.pattern === 'composite');
      expect(composite).toBeDefined();
      expect(composite!.confidence).toBeGreaterThanOrEqual(0.8);
    });

    it('detects self-referencing field without add/remove (lower confidence)', () => {
      const cls = unit({
        name: 'Node', kind: 'class',
        members: [{ name: 'children', kind: 'property', type: 'Array<Node>' }],
      });
      paths.set('Node', '/node.ts');
      const patterns = detectStructuralPatterns([cls], [], paths);
      const composite = patterns.find((p) => p.pattern === 'composite');
      expect(composite).toBeDefined();
      expect(composite!.confidence).toBeLessThan(0.8);
    });
  });
});
