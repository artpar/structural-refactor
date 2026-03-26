import { describe, it, expect } from 'vitest';
import { Project } from 'ts-morph';
import {
  buildCFG,
  type CFG,
  type BasicBlock,
  type BlockType,
} from '../../src/analysis/cfg.js';
import { createLogger } from '../../src/core/logger.js';

function makeProject(files: Record<string, string>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [name, content] of Object.entries(files)) {
    project.createSourceFile(name, content);
  }
  return project;
}

function makeLogger() {
  return createLogger({ level: 'trace', sink: () => {} });
}

describe('CFG builder', () => {
  describe('simple function', () => {
    it('builds a linear CFG for function with no branches', () => {
      const code = 'function add(a: number, b: number) {\n  const sum = a + b;\n  return sum;\n}\n';
      const project = makeProject({ '/src/app.ts': code });

      const cfg = buildCFG(project, '/src/app.ts', 'add', makeLogger());

      expect(cfg).toBeDefined();
      expect(cfg!.functionName).toBe('add');
      expect(cfg!.blocks.length).toBeGreaterThanOrEqual(1);
      // Linear function: entry → body → exit
      expect(cfg!.entry).toBeDefined();
      expect(cfg!.exit).toBeDefined();
    });
  });

  describe('if/else', () => {
    it('creates branch blocks for if/else', () => {
      const code = `function check(x: number) {
  if (x > 0) {
    return 'positive';
  } else {
    return 'negative';
  }
}`;
      const project = makeProject({ '/src/app.ts': code });

      const cfg = buildCFG(project, '/src/app.ts', 'check', makeLogger());

      expect(cfg).toBeDefined();
      // Should have: entry, condition, then-branch, else-branch, exit
      const branchBlocks = cfg!.blocks.filter((b) => b.type === 'branch');
      expect(branchBlocks.length).toBeGreaterThanOrEqual(1);

      // Branch block should have 2 successors (then and else)
      const branch = branchBlocks[0];
      expect(branch.successors.length).toBe(2);
    });
  });

  describe('loops', () => {
    it('creates loop blocks for for-of', () => {
      const code = `function total(nums: number[]) {
  let sum = 0;
  for (const n of nums) {
    sum += n;
  }
  return sum;
}`;
      const project = makeProject({ '/src/app.ts': code });

      const cfg = buildCFG(project, '/src/app.ts', 'total', makeLogger());

      expect(cfg).toBeDefined();
      const loopBlocks = cfg!.blocks.filter((b) => b.type === 'loop');
      expect(loopBlocks.length).toBeGreaterThanOrEqual(1);

      // Loop block should have a back-edge (successor pointing to itself or loop header)
      const loop = loopBlocks[0];
      expect(loop.successors.length).toBeGreaterThanOrEqual(2); // body and exit
    });
  });

  describe('try/catch', () => {
    it('creates exception blocks for try/catch', () => {
      const code = `function safe() {
  try {
    JSON.parse('');
  } catch (e) {
    return 'error';
  }
}`;
      const project = makeProject({ '/src/app.ts': code });

      const cfg = buildCFG(project, '/src/app.ts', 'safe', makeLogger());

      expect(cfg).toBeDefined();
      const tryBlocks = cfg!.blocks.filter((b) => b.type === 'try');
      expect(tryBlocks.length).toBeGreaterThanOrEqual(1);
      const catchBlocks = cfg!.blocks.filter((b) => b.type === 'catch');
      expect(catchBlocks.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('switch', () => {
    it('creates branch blocks for switch cases', () => {
      const code = `function route(cmd: string) {
  switch (cmd) {
    case 'a': return 1;
    case 'b': return 2;
    default: return 0;
  }
}`;
      const project = makeProject({ '/src/app.ts': code });

      const cfg = buildCFG(project, '/src/app.ts', 'route', makeLogger());

      expect(cfg).toBeDefined();
      const switchBlocks = cfg!.blocks.filter((b) => b.type === 'switch');
      expect(switchBlocks.length).toBeGreaterThanOrEqual(1);
      // Switch should have successors for each case
      const sw = switchBlocks[0];
      expect(sw.successors.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('function calls', () => {
    it('tracks function call nodes within blocks', () => {
      const code = `function main() {
  console.log('start');
  const x = Math.max(1, 2);
  return x;
}`;
      const project = makeProject({ '/src/app.ts': code });

      const cfg = buildCFG(project, '/src/app.ts', 'main', makeLogger());

      expect(cfg).toBeDefined();
      // Should track calls within the blocks
      const allCalls = cfg!.blocks.flatMap((b) => b.calls);
      expect(allCalls.length).toBeGreaterThanOrEqual(2); // console.log and Math.max
    });
  });

  it('returns undefined for nonexistent function', () => {
    const project = makeProject({ '/src/app.ts': 'const x = 1;\n' });
    const cfg = buildCFG(project, '/src/app.ts', 'nope', makeLogger());
    expect(cfg).toBeUndefined();
  });

  it('logs the operation', () => {
    const code = 'function f() { return 1; }\n';
    const project = makeProject({ '/src/app.ts': code });
    const entries: any[] = [];
    const logger = createLogger({ level: 'trace', sink: (e) => entries.push(e) });

    buildCFG(project, '/src/app.ts', 'f', logger);

    const logs = entries.filter((e: any) => e.scope === 'cfg');
    expect(logs.length).toBeGreaterThanOrEqual(1);
  });
});
