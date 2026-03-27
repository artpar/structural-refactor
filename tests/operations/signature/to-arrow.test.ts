import { describe, it, expect } from 'vitest';
import { Project, SyntaxKind } from 'ts-morph';
import { toArrow } from '../../../src/operations/signature/to-arrow.js';
import { createLogger, type LogEntry } from '../../../src/core/logger.js';
import { makeLogger, makeProject, parseAst } from "../../helpers/index.js";
describe('toArrow', () => {
  it('converts a function declaration to arrow function const', () => {
    const code = 'function add(a: number, b: number): number {\n  return a + b;\n}\n';
    const project = makeProject({ '/src/app.ts': code });
    const { logger } = makeLogger();

    const cs = toArrow(project, {
      filePath: '/src/app.ts',
      line: 1,
      col: 10, // 'add'
      logger,
    });

    expect(cs.files).toHaveLength(1);
    const sf = parseAst(cs.files[0].modified);
    // Should be a variable declaration with arrow function
    const varDecl = sf.getVariableDeclaration('add');
    expect(varDecl).toBeDefined();
    const init = varDecl!.getInitializer();
    expect(init?.getKind()).toBe(SyntaxKind.ArrowFunction);
  });

  it('converts an exported function declaration', () => {
    const code = 'export function greet(name: string) {\n  return `hello ${name}`;\n}\n';
    const project = makeProject({ '/src/app.ts': code });
    const { logger } = makeLogger();

    const cs = toArrow(project, {
      filePath: '/src/app.ts',
      line: 1,
      col: 17, // 'greet'
      logger,
    });

    expect(cs.files).toHaveLength(1);
    const modified = cs.files[0].modified;
    expect(modified).toContain('export const greet');
    expect(modified).toContain('=>');
  });

  it('returns empty changeset for non-function', () => {
    const project = makeProject({ '/src/app.ts': 'const x = 1;\n' });
    const { logger } = makeLogger();

    const cs = toArrow(project, {
      filePath: '/src/app.ts',
      line: 1,
      col: 7,
      logger,
    });

    expect(cs.files).toHaveLength(0);
  });

  it('logs the operation', () => {
    const code = 'function f() { return 1; }\n';
    const project = makeProject({ '/src/app.ts': code });
    const { logger, entries } = makeLogger();

    toArrow(project, { filePath: '/src/app.ts', line: 1, col: 10, logger });

    const logs = entries.filter((e) => e.scope === 'to-arrow');
    expect(logs.length).toBeGreaterThanOrEqual(1);
  });
});
