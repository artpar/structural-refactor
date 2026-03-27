import { describe, it, expect } from 'vitest';
import { Project } from 'ts-morph';
import {
  buildDFG,
  type DFG,
  type DataFlowNode,
  type FlowEdgeType,
} from '../../src/analysis/dfg.js';
import { createLogger } from '../../src/core/logger.js';
import { makeProject } from "../helpers/index.js";

function makeLogger() {
  return createLogger({ level: 'trace', sink: () => {} });
}

describe('DFG builder', () => {
  describe('variable tracking', () => {
    it('tracks variable definition and usage', () => {
      const code = 'function f() {\n  const x = 1;\n  return x;\n}\n';
      const project = makeProject({ '/src/app.ts': code });

      const dfg = buildDFG(project, '/src/app.ts', 'f', makeLogger());

      expect(dfg).toBeDefined();
      // Should have a definition node for x and a usage node
      const xDef = dfg!.nodes.find((n) => n.name === 'x' && n.type === 'definition');
      expect(xDef).toBeDefined();
      const xUse = dfg!.nodes.find((n) => n.name === 'x' && n.type === 'usage');
      expect(xUse).toBeDefined();
      // Should have a def-use edge
      const edge = dfg!.edges.find((e) => e.from === xDef!.id && e.to === xUse!.id);
      expect(edge).toBeDefined();
      expect(edge!.type).toBe('def-use');
    });

    it('tracks reassignment', () => {
      const code = 'function f() {\n  let x = 1;\n  x = 2;\n  return x;\n}\n';
      const project = makeProject({ '/src/app.ts': code });

      const dfg = buildDFG(project, '/src/app.ts', 'f', makeLogger());

      expect(dfg).toBeDefined();
      const assignments = dfg!.nodes.filter((n) => n.name === 'x' && n.type === 'assignment');
      expect(assignments.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('parameter flow', () => {
    it('tracks parameter to usage flow', () => {
      const code = 'function add(a: number, b: number) {\n  return a + b;\n}\n';
      const project = makeProject({ '/src/app.ts': code });

      const dfg = buildDFG(project, '/src/app.ts', 'add', makeLogger());

      expect(dfg).toBeDefined();
      const aDef = dfg!.nodes.find((n) => n.name === 'a' && n.type === 'parameter');
      expect(aDef).toBeDefined();
      const bDef = dfg!.nodes.find((n) => n.name === 'b' && n.type === 'parameter');
      expect(bDef).toBeDefined();
    });
  });

  describe('cross-function call flow', () => {
    it('tracks data flow through function calls', () => {
      const code = `function double(n: number) { return n * 2; }
function main() {
  const x = 5;
  const y = double(x);
  return y;
}`;
      const project = makeProject({ '/src/app.ts': code });

      const dfg = buildDFG(project, '/src/app.ts', 'main', makeLogger());

      expect(dfg).toBeDefined();
      // x flows into double() call
      const callNodes = dfg!.nodes.filter((n) => n.type === 'call');
      expect(callNodes.length).toBeGreaterThanOrEqual(1);
      expect(callNodes[0].name).toContain('double');
    });
  });

  describe('cross-file flow', () => {
    it('tracks data flow across imported functions', () => {
      const project = makeProject({
        '/src/math.ts': 'export function add(a: number, b: number) { return a + b; }\n',
        '/src/app.ts': 'import { add } from "./math";\nfunction main() {\n  const result = add(1, 2);\n  return result;\n}\n',
      });

      const dfg = buildDFG(project, '/src/app.ts', 'main', makeLogger());

      expect(dfg).toBeDefined();
      // Should track the imported call
      const callNodes = dfg!.nodes.filter((n) => n.type === 'call');
      expect(callNodes.length).toBeGreaterThanOrEqual(1);
      // Call should reference the external module
      const addCall = callNodes.find((n) => n.name.includes('add'));
      expect(addCall).toBeDefined();
    });
  });

  describe('return value flow', () => {
    it('tracks return value', () => {
      const code = 'function f() {\n  const x = 42;\n  return x;\n}\n';
      const project = makeProject({ '/src/app.ts': code });

      const dfg = buildDFG(project, '/src/app.ts', 'f', makeLogger());

      expect(dfg).toBeDefined();
      const returnNodes = dfg!.nodes.filter((n) => n.type === 'return');
      expect(returnNodes.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('returns undefined for nonexistent function', () => {
    const project = makeProject({ '/src/app.ts': 'const x = 1;\n' });
    const dfg = buildDFG(project, '/src/app.ts', 'nope', makeLogger());
    expect(dfg).toBeUndefined();
  });

  it('logs the operation', () => {
    const code = 'function f() { return 1; }\n';
    const project = makeProject({ '/src/app.ts': code });
    const entries: any[] = [];
    const logger = createLogger({ level: 'trace', sink: (e) => entries.push(e) });

    buildDFG(project, '/src/app.ts', 'f', logger);

    const logs = entries.filter((e: any) => e.scope === 'dfg');
    expect(logs.length).toBeGreaterThanOrEqual(1);
  });
});
