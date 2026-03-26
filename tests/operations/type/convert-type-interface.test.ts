import { describe, it, expect } from 'vitest';
import { Project } from 'ts-morph';
import { convertTypeInterface } from '../../../src/operations/type/convert-type-interface.js';
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

describe('convertTypeInterface', () => {
  it('converts a type alias with object literal to interface', () => {
    const code = 'type User = {\n  name: string;\n  age: number;\n};\n';
    const project = makeProject({ '/src/app.ts': code });
    const { logger } = makeLogger();

    const cs = convertTypeInterface(project, {
      filePath: '/src/app.ts',
      line: 1,
      col: 6, // 'User'
      logger,
    });

    expect(cs.files).toHaveLength(1);
    const sf = parseAst(cs.files[0].modified);
    expect(sf.getTypeAlias('User')).toBeUndefined();
    const iface = sf.getInterface('User');
    expect(iface).toBeDefined();
    const members = iface!.getProperties().map((p) => p.getName());
    expect(members).toContain('name');
    expect(members).toContain('age');
  });

  it('converts an interface to type alias', () => {
    const code = 'interface User {\n  name: string;\n  age: number;\n}\n';
    const project = makeProject({ '/src/app.ts': code });
    const { logger } = makeLogger();

    const cs = convertTypeInterface(project, {
      filePath: '/src/app.ts',
      line: 1,
      col: 11, // 'User'
      logger,
    });

    expect(cs.files).toHaveLength(1);
    const sf = parseAst(cs.files[0].modified);
    expect(sf.getInterface('User')).toBeUndefined();
    const typeAlias = sf.getTypeAlias('User');
    expect(typeAlias).toBeDefined();
  });

  it('returns empty changeset for non-type/interface', () => {
    const project = makeProject({ '/src/app.ts': 'const x = 1;\n' });
    const { logger } = makeLogger();

    const cs = convertTypeInterface(project, {
      filePath: '/src/app.ts',
      line: 1,
      col: 7,
      logger,
    });

    expect(cs.files).toHaveLength(0);
  });

  it('logs the operation', () => {
    const code = 'type X = { a: number; };\n';
    const project = makeProject({ '/src/app.ts': code });
    const { logger, entries } = makeLogger();

    convertTypeInterface(project, { filePath: '/src/app.ts', line: 1, col: 6, logger });

    const logs = entries.filter((e) => e.scope === 'convert-type-interface');
    expect(logs.length).toBeGreaterThanOrEqual(1);
  });
});
