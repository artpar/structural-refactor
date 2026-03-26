import { describe, it, expect } from 'vitest';
import { Project, SyntaxKind } from 'ts-morph';
import { extractVariable } from '../../../src/operations/extract/extract-variable.js';
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

describe('extractVariable', () => {
  it('extracts a numeric literal into a const', () => {
    const project = makeProject({
      '/src/app.ts': 'const area = 3.14 * r * r;\n',
    });
    const { logger } = makeLogger();

    const cs = extractVariable(project, {
      filePath: '/src/app.ts',
      startLine: 1,
      startCol: 14,  // start of '3.14'
      endLine: 1,
      endCol: 18,    // end of '3.14'
      variableName: 'PI',
      kind: 'const',
      logger,
    });

    expect(cs.files).toHaveLength(1);
    const sf = parseAst(cs.files[0].modified);
    // Should have a new variable declaration for PI
    const piDecl = sf.getVariableDeclaration('PI');
    expect(piDecl).toBeDefined();
  });

  it('extracts a complex expression', () => {
    const project = makeProject({
      '/src/app.ts': 'function calc(x: number) {\n  return x * 2 + 1;\n}\n',
    });
    const { logger } = makeLogger();

    const cs = extractVariable(project, {
      filePath: '/src/app.ts',
      startLine: 2,
      startCol: 10,  // start of 'x * 2 + 1'
      endLine: 2,
      endCol: 19,    // end of 'x * 2 + 1' (1-indexed, exclusive end)
      variableName: 'result',
      kind: 'const',
      logger,
    });

    expect(cs.files).toHaveLength(1);
    const sf = parseAst(cs.files[0].modified);
    // getVariableDeclarations() only finds top-level — use descendants for nested
    const allVarDecls = sf.getDescendantsOfKind(SyntaxKind.VariableDeclaration);
    const names = allVarDecls.map((d) => d.getName());
    expect(names).toContain('result');
  });

  it('extracts a string expression', () => {
    const project = makeProject({
      '/src/app.ts': 'console.log("hello" + " " + "world");\n',
    });
    const { logger } = makeLogger();

    const cs = extractVariable(project, {
      filePath: '/src/app.ts',
      startLine: 1,
      startCol: 13, // start of '"hello" + " " + "world"'
      endLine: 1,
      endCol: 36,
      variableName: 'greeting',
      kind: 'const',
      logger,
    });

    expect(cs.files).toHaveLength(1);
    const sf = parseAst(cs.files[0].modified);
    expect(sf.getVariableDeclaration('greeting')).toBeDefined();
  });

  it('supports let kind', () => {
    const project = makeProject({
      '/src/app.ts': 'const x = 42;\n',
    });
    const { logger } = makeLogger();

    const cs = extractVariable(project, {
      filePath: '/src/app.ts',
      startLine: 1,
      startCol: 11, // '42'
      endLine: 1,
      endCol: 13,
      variableName: 'answer',
      kind: 'let',
      logger,
    });

    expect(cs.files).toHaveLength(1);
    // Verify the declaration uses 'let'
    const modified = cs.files[0].modified;
    const sf = parseAst(modified);
    const decl = sf.getVariableDeclaration('answer');
    expect(decl).toBeDefined();
    // The variable statement should use let
    const stmt = decl!.getVariableStatement()!;
    expect(stmt.getDeclarationKind().toString()).toBe('let');
  });

  it('returns empty changeset for invalid range', () => {
    const project = makeProject({
      '/src/app.ts': 'const x = 1;\n',
    });
    const { logger } = makeLogger();

    const cs = extractVariable(project, {
      filePath: '/src/app.ts',
      startLine: 99,
      startCol: 1,
      endLine: 99,
      endCol: 5,
      variableName: 'y',
      kind: 'const',
      logger,
    });

    expect(cs.files).toHaveLength(0);
  });

  it('logs the operation', () => {
    const project = makeProject({
      '/src/app.ts': 'const x = 42;\n',
    });
    const { logger, entries } = makeLogger();

    extractVariable(project, {
      filePath: '/src/app.ts',
      startLine: 1,
      startCol: 11,
      endLine: 1,
      endCol: 13,
      variableName: 'answer',
      kind: 'const',
      logger,
    });

    const logs = entries.filter((e) => e.scope === 'extract-variable');
    expect(logs.length).toBeGreaterThanOrEqual(1);
  });
});
