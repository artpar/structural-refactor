import { describe, it, expect } from 'vitest';
import { Project, SyntaxKind } from 'ts-morph';
import { changeSignature } from '../../../src/operations/signature/change-signature.js';
import { createLogger, type LogEntry } from '../../../src/core/logger.js';
import { makeLogger, makeProject, parseAst } from "../../helpers/index.js";
describe('changeSignature', () => {
  it('adds a parameter to a function', () => {
    const project = makeProject({
      '/src/math.ts': 'export function add(a: number, b: number) { return a + b; }\n',
      '/src/app.ts': 'import { add } from "./math";\nconst x = add(1, 2);\n',
    });
    const { logger } = makeLogger();

    const cs = changeSignature(project, {
      filePath: '/src/math.ts',
      functionName: 'add',
      addParams: [{ name: 'c', type: 'number', defaultValue: '0' }],
      logger,
    });

    expect(cs.files.length).toBeGreaterThanOrEqual(1);

    // Function should have 3 params
    const mathChange = cs.files.find((f) => f.path === '/src/math.ts')!;
    const sf = parseAst(mathChange.modified);
    const fn = sf.getFunction('add');
    expect(fn!.getParameters()).toHaveLength(3);
    expect(fn!.getParameters()[2].getName()).toBe('c');

    // Call sites should have the default value added
    const appChange = cs.files.find((f) => f.path === '/src/app.ts')!;
    expect(appChange).toBeDefined();
    const appSf = parseAst(appChange.modified);
    const calls = appSf.getDescendantsOfKind(SyntaxKind.CallExpression);
    const addCall = calls.find((c) => c.getExpression().getText() === 'add');
    expect(addCall!.getArguments()).toHaveLength(3);
  });

  it('removes a parameter from a function', () => {
    const project = makeProject({
      '/src/math.ts': 'export function calc(a: number, b: number, c: number) { return a + b; }\n',
      '/src/app.ts': 'import { calc } from "./math";\nconst x = calc(1, 2, 3);\n',
    });
    const { logger } = makeLogger();

    const cs = changeSignature(project, {
      filePath: '/src/math.ts',
      functionName: 'calc',
      removeParams: ['c'],
      logger,
    });

    expect(cs.files.length).toBeGreaterThanOrEqual(1);

    const mathChange = cs.files.find((f) => f.path === '/src/math.ts')!;
    const sf = parseAst(mathChange.modified);
    const fn = sf.getFunction('calc');
    expect(fn!.getParameters()).toHaveLength(2);
    const paramNames = fn!.getParameters().map((p) => p.getName());
    expect(paramNames).not.toContain('c');

    // Call site should have 3rd arg removed
    const appChange = cs.files.find((f) => f.path === '/src/app.ts')!;
    const appSf = parseAst(appChange.modified);
    const calls = appSf.getDescendantsOfKind(SyntaxKind.CallExpression);
    const calcCall = calls.find((c) => c.getExpression().getText() === 'calc');
    expect(calcCall!.getArguments()).toHaveLength(2);
  });

  it('returns empty changeset for nonexistent function', () => {
    const project = makeProject({ '/src/app.ts': 'const x = 1;\n' });
    const { logger } = makeLogger();

    const cs = changeSignature(project, {
      filePath: '/src/app.ts',
      functionName: 'nope',
      logger,
    });

    expect(cs.files).toHaveLength(0);
  });

  it('logs the operation', () => {
    const project = makeProject({
      '/src/app.ts': 'function f(a: number) {}\n',
    });
    const { logger, entries } = makeLogger();

    changeSignature(project, {
      filePath: '/src/app.ts',
      functionName: 'f',
      addParams: [{ name: 'b', type: 'string' }],
      logger,
    });

    const logs = entries.filter((e) => e.scope === 'change-signature');
    expect(logs.length).toBeGreaterThanOrEqual(1);
  });
});
