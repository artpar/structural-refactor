import { describe, it, expect } from 'vitest';
import path from 'node:path';
import {
  analyzeDependencies,
  type DependencyGraph,
  type ModuleNode,
} from '../../src/analysis/dependency-analyzer.js';
import { createLogger } from '../../src/core/logger.js';
import { makeSimpleLogger } from "../helpers/index.js";

const FIXTURES = path.resolve(import.meta.dirname, '../fixtures');
describe('analyzeDependencies', () => {
  describe('simple project', () => {
    it('builds a dependency graph', () => {
      const graph = analyzeDependencies(path.join(FIXTURES, 'simple-project'), makeSimpleLogger());
      expect(graph.modules.size).toBeGreaterThanOrEqual(4);
    });

    it('tracks internal imports between files', () => {
      const graph = analyzeDependencies(path.join(FIXTURES, 'simple-project'), makeSimpleLogger());

      // Find the app.ts module
      const appModule = findModule(graph, 'app.ts');
      expect(appModule).toBeDefined();
      expect(appModule!.internalImports.length).toBeGreaterThanOrEqual(1);
    });

    it('identifies what each file exports', () => {
      const graph = analyzeDependencies(path.join(FIXTURES, 'simple-project'), makeSimpleLogger());

      const mathModule = findModule(graph, 'math.ts');
      expect(mathModule).toBeDefined();
      expect(mathModule!.exports).toContain('add');
      expect(mathModule!.exports).toContain('multiply');
      expect(mathModule!.exports).toContain('PI');
    });

    it('identifies what each file imports', () => {
      const graph = analyzeDependencies(path.join(FIXTURES, 'simple-project'), makeSimpleLogger());

      const utilsModule = findModule(graph, 'utils.ts');
      expect(utilsModule).toBeDefined();
      expect(utilsModule!.internalImports.some((i) => i.specifiers.includes('add'))).toBe(true);
    });

    it('detects files with no dependents (entry points)', () => {
      const graph = analyzeDependencies(path.join(FIXTURES, 'simple-project'), makeSimpleLogger());
      const entryPoints = graph.entryPoints;
      expect(entryPoints.length).toBeGreaterThanOrEqual(1);
    });

    it('detects files with no dependencies (leaves)', () => {
      const graph = analyzeDependencies(path.join(FIXTURES, 'simple-project'), makeSimpleLogger());
      const leaves = graph.leaves;
      expect(leaves.length).toBeGreaterThanOrEqual(1);
      // math.ts has no imports — it's a leaf
      expect(leaves.some((l) => l.endsWith('math.ts'))).toBe(true);
    });
  });

  describe('react project', () => {
    it('parses JSX/TSX files', () => {
      const graph = analyzeDependencies(path.join(FIXTURES, 'react-project'), makeSimpleLogger());
      const appModule = findModule(graph, 'App.tsx');
      expect(appModule).toBeDefined();
    });

    it('tracks external dependencies (react, etc.)', () => {
      const graph = analyzeDependencies(path.join(FIXTURES, 'react-project'), makeSimpleLogger());
      const appModule = findModule(graph, 'App.tsx');
      expect(appModule).toBeDefined();
      expect(appModule!.externalImports.some((i) => i.source === 'react')).toBe(true);
    });

    it('resolves path aliases in imports', () => {
      const graph = analyzeDependencies(path.join(FIXTURES, 'react-project'), makeSimpleLogger());
      const appModule = findModule(graph, 'App.tsx');
      expect(appModule).toBeDefined();
      // @components/Header should resolve to an internal import
      expect(appModule!.internalImports.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('graph stats', () => {
    it('provides module count', () => {
      const graph = analyzeDependencies(path.join(FIXTURES, 'simple-project'), makeSimpleLogger());
      expect(graph.stats.moduleCount).toBeGreaterThanOrEqual(4);
    });

    it('provides external dependency count', () => {
      const graph = analyzeDependencies(path.join(FIXTURES, 'react-project'), makeSimpleLogger());
      expect(graph.stats.externalDependencyCount).toBeGreaterThanOrEqual(1);
    });

    it('provides internal edge count', () => {
      const graph = analyzeDependencies(path.join(FIXTURES, 'simple-project'), makeSimpleLogger());
      expect(graph.stats.internalEdgeCount).toBeGreaterThanOrEqual(3);
    });
  });
});

function findModule(graph: DependencyGraph, filename: string): ModuleNode | undefined {
  for (const [key, mod] of graph.modules) {
    if (key.endsWith(filename)) return mod;
  }
  return undefined;
}
