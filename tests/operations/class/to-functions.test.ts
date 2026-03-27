import { describe, it, expect } from 'vitest';
import { Project } from 'ts-morph';
import { classToFunctions } from '../../../src/operations/class/to-functions.js';
import { createLogger, type LogEntry } from '../../../src/core/logger.js';
import { makeLogger, makeProject, parseAst } from "../../helpers/index.js";
describe('classToFunctions', () => {
  it('converts class methods to standalone functions', () => {
    const code = `class MathUtils {
  add(a: number, b: number): number {
    return a + b;
  }
  multiply(a: number, b: number): number {
    return a * b;
  }
}
`;
    const project = makeProject({ '/src/math.ts': code });
    const { logger } = makeLogger();

    const cs = classToFunctions(project, {
      filePath: '/src/math.ts',
      className: 'MathUtils',
      logger,
    });

    expect(cs.files).toHaveLength(1);
    const sf = parseAst(cs.files[0].modified);

    // Class should be gone
    expect(sf.getClass('MathUtils')).toBeUndefined();

    // Functions should exist
    const fn1 = sf.getFunction('add');
    const fn2 = sf.getFunction('multiply');
    expect(fn1).toBeDefined();
    expect(fn2).toBeDefined();
    expect(fn1!.getParameters()).toHaveLength(2);
  });

  it('handles exported class', () => {
    const code = 'export class Utils {\n  greet() { return "hi"; }\n}\n';
    const project = makeProject({ '/src/app.ts': code });
    const { logger } = makeLogger();

    const cs = classToFunctions(project, {
      filePath: '/src/app.ts',
      className: 'Utils',
      logger,
    });

    expect(cs.files).toHaveLength(1);
    const modified = cs.files[0].modified;
    expect(modified).toContain('export function greet');
  });

  it('returns empty changeset for nonexistent class', () => {
    const project = makeProject({ '/src/app.ts': 'const x = 1;\n' });
    const { logger } = makeLogger();

    const cs = classToFunctions(project, {
      filePath: '/src/app.ts',
      className: 'Nope',
      logger,
    });

    expect(cs.files).toHaveLength(0);
  });

  it('logs the operation', () => {
    const code = 'class Foo { bar() {} }\n';
    const project = makeProject({ '/src/app.ts': code });
    const { logger, entries } = makeLogger();

    classToFunctions(project, { filePath: '/src/app.ts', className: 'Foo', logger });

    const logs = entries.filter((e) => e.scope === 'class-to-functions');
    expect(logs.length).toBeGreaterThanOrEqual(1);
  });
});
