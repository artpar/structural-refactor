import { describe, it, expect } from 'vitest';
import { Project, SyntaxKind } from 'ts-morph';
import { inlineFunction } from '../../../src/operations/inline/inline-function.js';
import { createLogger, type LogEntry } from '../../../src/core/logger.js';
import { makeLogger, makeProject, parseAst } from "../../helpers/index.js";
describe('inlineFunction', () => {
  it('inlines a simple function with single return at a call site', () => {
    const code = 'function double(n: number) { return n * 2; }\nconst x = double(5);\n';
    const project = makeProject({ '/src/app.ts': code });
    const { logger } = makeLogger();

    const cs = inlineFunction(project, {
      filePath: '/src/app.ts',
      line: 1,
      col: 10, // 'double'
      logger,
    });

    expect(cs.files).toHaveLength(1);
    const sf = parseAst(cs.files[0].modified);
    // 'double' function should be removed
    expect(sf.getFunction('double')).toBeUndefined();
    // The call should be replaced with the inlined expression
    const modified = cs.files[0].modified;
    expect(modified).toContain('5 * 2');
  });

  it('inlines at multiple call sites', () => {
    const code = 'function inc(n: number) { return n + 1; }\nconst a = inc(1);\nconst b = inc(2);\n';
    const project = makeProject({ '/src/app.ts': code });
    const { logger } = makeLogger();

    const cs = inlineFunction(project, {
      filePath: '/src/app.ts',
      line: 1,
      col: 10, // 'inc'
      logger,
    });

    expect(cs.files).toHaveLength(1);
    const modified = cs.files[0].modified;
    expect(modified).toContain('1 + 1');
    expect(modified).toContain('2 + 1');
  });

  it('returns empty changeset for non-function identifier', () => {
    const project = makeProject({
      '/src/app.ts': 'const x = 42;\n',
    });
    const { logger } = makeLogger();

    const cs = inlineFunction(project, {
      filePath: '/src/app.ts',
      line: 1,
      col: 7,
      logger,
    });

    expect(cs.files).toHaveLength(0);
  });

  // Issue #6: non-exported module-scoped function defined after caller
  it('inlines a non-exported module-scoped function defined after its caller', () => {
    const code = 'export function main() { return fmt("hello"); }\nfunction fmt(s: string) { return s.trim(); }\n';
    const project = makeProject({ '/src/app.ts': code });
    const { logger } = makeLogger();

    const cs = inlineFunction(project, {
      filePath: '/src/app.ts',
      line: 2,
      col: 10, // 'fmt' on line 2
      logger,
    });

    expect(cs.files).toHaveLength(1);
    const modified = cs.files[0].modified;
    // fmt should be removed
    const sf = parseAst(modified);
    expect(sf.getFunction('fmt')).toBeUndefined();
    // call site should be inlined
    expect(modified).toContain('"hello".trim()');
  });

  // Issue #6: cursor on function keyword instead of name
  it('finds function when cursor is on function keyword, not name', () => {
    const code = 'function double(n: number) { return n * 2; }\nconst x = double(5);\n';
    const project = makeProject({ '/src/app.ts': code });
    const { logger } = makeLogger();

    const cs = inlineFunction(project, {
      filePath: '/src/app.ts',
      line: 1,
      col: 1, // 'function' keyword, not 'double'
      logger,
    });

    // Should either inline successfully or give a clear precondition failure
    // It should NOT silently produce no output
    if (cs.files.length > 0) {
      const modified = cs.files[0].modified;
      expect(modified).toContain('5 * 2');
    } else {
      // Acceptable: precondition failure with message
      expect(cs.description).toContain('Precondition failed');
    }
  });

  it('logs the operation', () => {
    const code = 'function f() { return 1; }\nconst x = f();\n';
    const project = makeProject({ '/src/app.ts': code });
    const { logger, entries } = makeLogger();

    inlineFunction(project, {
      filePath: '/src/app.ts',
      line: 1,
      col: 10,
      logger,
    });

    const logs = entries.filter((e) => e.scope === 'inline-function');
    expect(logs.length).toBeGreaterThanOrEqual(1);
  });
});
