import { describe, it, expect } from 'vitest';
import { Project } from 'ts-morph';
import { toAsync } from '../../../src/operations/signature/to-async.js';
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

describe('toAsync', () => {
  it('adds async keyword to a function declaration', () => {
    const code = 'function fetchData() {\n  return fetch("/api");\n}\n';
    const project = makeProject({ '/src/app.ts': code });
    const { logger } = makeLogger();

    const cs = toAsync(project, {
      filePath: '/src/app.ts',
      line: 1,
      col: 10,
      logger,
    });

    expect(cs.files).toHaveLength(1);
    const sf = parseAst(cs.files[0].modified);
    const fn = sf.getFunction('fetchData');
    expect(fn).toBeDefined();
    expect(fn!.isAsync()).toBe(true);
  });

  it('does not double-async an already async function', () => {
    const code = 'async function fetchData() {\n  return fetch("/api");\n}\n';
    const project = makeProject({ '/src/app.ts': code });
    const { logger } = makeLogger();

    const cs = toAsync(project, {
      filePath: '/src/app.ts',
      line: 1,
      col: 16, // 'fetchData' after 'async function '
      logger,
    });

    expect(cs.files).toHaveLength(0);
  });

  it('wraps return type in Promise<>', () => {
    const code = 'function getData(): string {\n  return "data";\n}\n';
    const project = makeProject({ '/src/app.ts': code });
    const { logger } = makeLogger();

    const cs = toAsync(project, {
      filePath: '/src/app.ts',
      line: 1,
      col: 10,
      logger,
    });

    expect(cs.files).toHaveLength(1);
    const sf = parseAst(cs.files[0].modified);
    const fn = sf.getFunction('getData');
    expect(fn!.isAsync()).toBe(true);
    const returnType = fn!.getReturnTypeNode()?.getText();
    expect(returnType).toBe('Promise<string>');
  });

  it('logs the operation', () => {
    const code = 'function f() {}\n';
    const project = makeProject({ '/src/app.ts': code });
    const { logger, entries } = makeLogger();

    toAsync(project, { filePath: '/src/app.ts', line: 1, col: 10, logger });

    const logs = entries.filter((e) => e.scope === 'to-async');
    expect(logs.length).toBeGreaterThanOrEqual(1);
  });
});
