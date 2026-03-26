import { describe, it, expect } from 'vitest';
import { Project, SyntaxKind } from 'ts-morph';
import { extractFunction } from '../../../src/operations/extract/extract-function.js';
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

describe('extractFunction', () => {
  it('extracts a simple statement into a function', () => {
    const code = 'function main() {\n  const x = 1;\n  console.log(x);\n}\n';
    const project = makeProject({ '/src/app.ts': code });
    const { logger } = makeLogger();

    const cs = extractFunction(project, {
      filePath: '/src/app.ts',
      startLine: 3,
      startCol: 3,   // 'console.log(x);'
      endLine: 3,
      endCol: 18,    // end of 'console.log(x);' (1-indexed exclusive)
      functionName: 'logValue',
      logger,
    });

    expect(cs.files).toHaveLength(1);
    const sf = parseAst(cs.files[0].modified);
    // Should have a new function declaration 'logValue'
    const fn = sf.getFunction('logValue');
    expect(fn).toBeDefined();
    // The extracted function should take 'x' as parameter (since x is from outer scope)
    const params = fn!.getParameters();
    expect(params.length).toBeGreaterThanOrEqual(1);
    expect(params[0].getName()).toBe('x');
  });

  it('extracts expression that uses no outer variables (no parameters)', () => {
    const code = 'function main() {\n  console.log("hello");\n}\n';
    const project = makeProject({ '/src/app.ts': code });
    const { logger } = makeLogger();

    const cs = extractFunction(project, {
      filePath: '/src/app.ts',
      startLine: 2,
      startCol: 3,
      endLine: 2,
      endCol: 24,
      functionName: 'greet',
      logger,
    });

    expect(cs.files).toHaveLength(1);
    const sf = parseAst(cs.files[0].modified);
    const fn = sf.getFunction('greet');
    expect(fn).toBeDefined();
    expect(fn!.getParameters()).toHaveLength(0);
  });

  it('extracts a return-worthy expression with return value', () => {
    const code = 'function calc() {\n  const a = 5;\n  const b = 10;\n  const result = a + b;\n  return result;\n}\n';
    const project = makeProject({ '/src/app.ts': code });
    const { logger } = makeLogger();

    // Extract "const result = a + b;" — needs a, b as params
    const cs = extractFunction(project, {
      filePath: '/src/app.ts',
      startLine: 4,
      startCol: 3,
      endLine: 4,
      endCol: 23,
      functionName: 'computeSum',
      logger,
    });

    expect(cs.files).toHaveLength(1);
    const sf = parseAst(cs.files[0].modified);
    const fn = sf.getFunction('computeSum');
    expect(fn).toBeDefined();
    const paramNames = fn!.getParameters().map((p) => p.getName());
    expect(paramNames).toContain('a');
    expect(paramNames).toContain('b');
  });

  it('returns empty changeset for invalid file', () => {
    const project = makeProject({ '/src/app.ts': 'const x = 1;\n' });
    const { logger } = makeLogger();

    const cs = extractFunction(project, {
      filePath: '/src/nonexistent.ts',
      startLine: 1,
      startCol: 1,
      endLine: 1,
      endCol: 10,
      functionName: 'fn',
      logger,
    });

    expect(cs.files).toHaveLength(0);
  });

  it('logs the extraction', () => {
    const project = makeProject({ '/src/app.ts': 'console.log(1);\n' });
    const { logger, entries } = makeLogger();

    extractFunction(project, {
      filePath: '/src/app.ts',
      startLine: 1,
      startCol: 1,
      endLine: 1,
      endCol: 16,
      functionName: 'fn',
      logger,
    });

    const logs = entries.filter((e) => e.scope === 'extract-function');
    expect(logs.length).toBeGreaterThanOrEqual(1);
  });
});
