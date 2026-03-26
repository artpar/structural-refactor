import { describe, it, expect } from 'vitest';
import { Project, SyntaxKind } from 'ts-morph';
import { inlineVariable } from '../../../src/operations/inline/inline-variable.js';
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

describe('inlineVariable', () => {
  it('inlines a simple const with single usage', () => {
    const project = makeProject({
      '/src/app.ts': 'const x = 42;\nconsole.log(x);\n',
    });
    const { logger } = makeLogger();

    const cs = inlineVariable(project, {
      filePath: '/src/app.ts',
      line: 1,
      col: 7, // position of 'x'
      logger,
    });

    expect(cs.files).toHaveLength(1);
    const sf = parseAst(cs.files[0].modified);
    // x should be gone — replaced with 42 inline
    const varDecls = sf.getVariableDeclarations();
    expect(varDecls.find((d) => d.getName() === 'x')).toBeUndefined();
    // console.log should now have 42 directly
    const callExprs = sf.getDescendantsOfKind(SyntaxKind.CallExpression);
    const logCall = callExprs.find((c) => c.getText().includes('console.log'));
    expect(logCall?.getText()).toBe('console.log(42)');
  });

  it('inlines a variable with multiple usages', () => {
    const project = makeProject({
      '/src/app.ts': 'const msg = "hello";\nconsole.log(msg);\nalert(msg);\n',
    });
    const { logger } = makeLogger();

    const cs = inlineVariable(project, {
      filePath: '/src/app.ts',
      line: 1,
      col: 7,
      logger,
    });

    expect(cs.files).toHaveLength(1);
    const modified = cs.files[0].modified;
    // Should not contain 'const msg'
    const sf = parseAst(modified);
    expect(sf.getVariableDeclaration('msg')).toBeUndefined();
  });

  it('returns empty changeset when no identifier at position', () => {
    const project = makeProject({
      '/src/app.ts': '   \n',
    });
    const { logger } = makeLogger();

    const cs = inlineVariable(project, {
      filePath: '/src/app.ts',
      line: 1,
      col: 1,
      logger,
    });

    expect(cs.files).toHaveLength(0);
  });

  it('logs the operation', () => {
    const project = makeProject({
      '/src/app.ts': 'const x = 1;\nconsole.log(x);\n',
    });
    const { logger, entries } = makeLogger();

    inlineVariable(project, {
      filePath: '/src/app.ts',
      line: 1,
      col: 7,
      logger,
    });

    const logs = entries.filter((e) => e.scope === 'inline-variable');
    expect(logs.length).toBeGreaterThanOrEqual(1);
  });
});
