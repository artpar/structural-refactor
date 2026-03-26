import { describe, it, expect } from 'vitest';
import { Project, SyntaxKind } from 'ts-morph';
import { inlineFunction } from '../../../src/operations/inline/inline-function.js';
import { createLogger, type LogEntry } from '../../../src/core/logger.js';

function makeProject(files: Record<string, string>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [name, content] of Object.entries(files)) {
    project.createSourceFile(name, content);
  }
  return project;
}

function makeLogger() {
  const entries: LogEntry[] = [];
  const logger = createLogger({ level: 'trace', sink: (e) => entries.push(e) });
  return { logger, entries };
}

function parseAst(code: string) {
  const p = new Project({ useInMemoryFileSystem: true });
  return p.createSourceFile('/check.ts', code);
}

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
