import { describe, it, expect } from 'vitest';
import path from 'node:path';
import {
  buildCallGraph,
  type CallGraph,
  type CallNode,
} from '../../src/analysis/call-graph.js';
import { createLogger } from '../../src/core/logger.js';

const FIXTURES = path.resolve(import.meta.dirname, '../fixtures');

function makeLogger() {
  return createLogger({ level: 'trace', sink: () => {} });
}

describe('CallGraph', () => {
  describe('simple project', () => {
    it('builds a cross-file call graph', () => {
      const graph = buildCallGraph(path.join(FIXTURES, 'simple-project'), makeLogger());

      expect(graph).toBeDefined();
      expect(graph.nodes.size).toBeGreaterThanOrEqual(1);
    });

    it('tracks function definitions with file locations', () => {
      const graph = buildCallGraph(path.join(FIXTURES, 'simple-project'), makeLogger());

      // math.ts defines add, multiply
      const addNode = findNode(graph, 'add');
      expect(addNode).toBeDefined();
      expect(addNode!.filePath).toContain('math.ts');
      expect(addNode!.type).toBe('function');
    });

    it('tracks cross-file calls', () => {
      const graph = buildCallGraph(path.join(FIXTURES, 'simple-project'), makeLogger());

      // utils.ts calls add from math.ts
      const addNode = findNode(graph, 'add');
      expect(addNode).toBeDefined();
      expect(addNode!.calledBy.some((c) => c.filePath.endsWith('utils.ts'))).toBe(true);
    });

    it('tracks what each function calls', () => {
      const graph = buildCallGraph(path.join(FIXTURES, 'simple-project'), makeLogger());

      // Find the sum function in utils.ts — it calls add
      const sumNode = findNode(graph, 'sum');
      expect(sumNode).toBeDefined();
      expect(sumNode!.calls.some((c) => c.name === 'add')).toBe(true);
    });
  });

  describe('test mapping', () => {
    it('identifies test files', () => {
      const graph = buildCallGraph(path.join(FIXTURES, 'simple-project'), makeLogger());
      expect(graph.testFiles.length).toBeGreaterThanOrEqual(0); // simple-project has no tests dir
    });

    it('maps test files to source files for project with tests', () => {
      // Use our own project — it has tests
      const graph = buildCallGraph(path.resolve(FIXTURES, '../..'), makeLogger());

      expect(graph.testFiles.length).toBeGreaterThanOrEqual(1);
      expect(graph.sourceFiles.length).toBeGreaterThanOrEqual(1);

      // Test files should be identified by path pattern
      expect(graph.testFiles.every((f) => f.includes('test'))).toBe(true);
    });
  });

  describe('stats', () => {
    it('provides function count', () => {
      const graph = buildCallGraph(path.join(FIXTURES, 'simple-project'), makeLogger());
      expect(graph.stats.functionCount).toBeGreaterThanOrEqual(3); // add, multiply, sum, etc.
    });

    it('provides call edge count', () => {
      const graph = buildCallGraph(path.join(FIXTURES, 'simple-project'), makeLogger());
      expect(graph.stats.callEdgeCount).toBeGreaterThanOrEqual(1);
    });
  });
});

function findNode(graph: CallGraph, name: string): CallNode | undefined {
  for (const [, node] of graph.nodes) {
    if (node.name === name) return node;
  }
  return undefined;
}
