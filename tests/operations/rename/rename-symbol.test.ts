import { describe, it, expect } from 'vitest';
import { Project } from 'ts-morph';
import { renameSymbol } from '../../../src/operations/rename/rename-symbol.js';
import { createLogger, type LogEntry } from '../../../src/core/logger.js';
import type { ChangeSet } from '../../../src/core/change-set.js';

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

describe('renameSymbol', () => {
  it('renames a variable in a single file', () => {
    const project = makeProject({
      '/src/math.ts': 'const myVar = 42;\nconsole.log(myVar);\n',
    });
    const { logger } = makeLogger();

    const cs = renameSymbol(project, {
      filePath: '/src/math.ts',
      line: 1,
      col: 7, // position of 'myVar'
      newName: 'renamedVar',
      logger,
    });

    expect(cs.files).toHaveLength(1);
    expect(cs.files[0].path).toBe('/src/math.ts');
    // Verify the modified content has the new name via AST re-parse
    const checkProject = new Project({ useInMemoryFileSystem: true });
    const sf = checkProject.createSourceFile('/check.ts', cs.files[0].modified);
    const varDecl = sf.getVariableDeclarationOrThrow('renamedVar');
    expect(varDecl.getName()).toBe('renamedVar');
  });

  it('renames across multiple files', () => {
    const project = makeProject({
      '/src/math.ts': 'export function add(a: number, b: number) { return a + b; }\n',
      '/src/app.ts': 'import { add } from "./math";\nconst result = add(1, 2);\n',
    });
    const { logger } = makeLogger();

    const cs = renameSymbol(project, {
      filePath: '/src/math.ts',
      line: 1,
      col: 17, // position of 'add'
      newName: 'sum',
      logger,
    });

    expect(cs.files.length).toBeGreaterThanOrEqual(2);

    // Check definition file
    const mathChange = cs.files.find((f) => f.path === '/src/math.ts')!;
    expect(mathChange).toBeDefined();
    const checkProject1 = new Project({ useInMemoryFileSystem: true });
    const mathSf = checkProject1.createSourceFile('/check.ts', mathChange.modified);
    expect(mathSf.getFunction('sum')).toBeDefined();
    expect(mathSf.getFunction('add')).toBeUndefined();

    // Check import file
    const appChange = cs.files.find((f) => f.path === '/src/app.ts')!;
    expect(appChange).toBeDefined();
    const checkProject2 = new Project({ useInMemoryFileSystem: true });
    const appSf = checkProject2.createSourceFile('/check.ts', appChange.modified);
    const imports = appSf.getImportDeclarations();
    const namedImports = imports[0].getNamedImports().map((n) => n.getName());
    expect(namedImports).toContain('sum');
    expect(namedImports).not.toContain('add');
  });

  it('renames a class', () => {
    const project = makeProject({
      '/src/model.ts': 'export class OldName {\n  value = 1;\n}\n',
      '/src/app.ts': 'import { OldName } from "./model";\nconst x = new OldName();\n',
    });
    const { logger } = makeLogger();

    const cs = renameSymbol(project, {
      filePath: '/src/model.ts',
      line: 1,
      col: 14, // position of 'OldName'
      newName: 'NewName',
      logger,
    });

    const modelChange = cs.files.find((f) => f.path === '/src/model.ts')!;
    const checkProject = new Project({ useInMemoryFileSystem: true });
    const sf = checkProject.createSourceFile('/check.ts', modelChange.modified);
    expect(sf.getClass('NewName')).toBeDefined();
    expect(sf.getClass('OldName')).toBeUndefined();
  });

  it('renames an interface', () => {
    const project = makeProject({
      '/src/types.ts': 'export interface IUser {\n  name: string;\n}\n',
      '/src/app.ts': 'import { IUser } from "./types";\nconst user: IUser = { name: "test" };\n',
    });
    const { logger } = makeLogger();

    const cs = renameSymbol(project, {
      filePath: '/src/types.ts',
      line: 1,
      col: 18, // position of 'IUser'
      newName: 'User',
      logger,
    });

    const typesChange = cs.files.find((f) => f.path === '/src/types.ts')!;
    const checkProject = new Project({ useInMemoryFileSystem: true });
    const sf = checkProject.createSourceFile('/check.ts', typesChange.modified);
    expect(sf.getInterface('User')).toBeDefined();
  });

  it('returns empty changeset when symbol not found', () => {
    const project = makeProject({
      '/src/math.ts': '   \n',
    });
    const { logger } = makeLogger();

    const cs = renameSymbol(project, {
      filePath: '/src/math.ts',
      line: 1,
      col: 1,
      newName: 'foo',
      logger,
    });

    expect(cs.files).toHaveLength(0);
  });

  it('logs the rename operation', () => {
    const project = makeProject({
      '/src/math.ts': 'const x = 1;\n',
    });
    const { logger, entries } = makeLogger();

    renameSymbol(project, {
      filePath: '/src/math.ts',
      line: 1,
      col: 7,
      newName: 'y',
      logger,
    });

    const infoLogs = entries.filter((e) => e.level === 'info' && e.scope === 'rename-symbol');
    expect(infoLogs.length).toBeGreaterThanOrEqual(1);
  });

  it('preserves files that did not change', () => {
    const project = makeProject({
      '/src/math.ts': 'export const localOnly = 1;\n',
      '/src/app.ts': 'import { foo } from "./other";\n',
    });
    const { logger } = makeLogger();

    const cs = renameSymbol(project, {
      filePath: '/src/math.ts',
      line: 1,
      col: 14, // 'localOnly'
      newName: 'renamedLocal',
      logger,
    });

    // Only math.ts should be in the changeset
    expect(cs.files).toHaveLength(1);
    expect(cs.files[0].path).toBe('/src/math.ts');
  });
});
