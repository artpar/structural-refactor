import { describe, it, expect } from 'vitest';
import { Project } from 'ts-morph';
import { renameFile } from '../../../src/operations/rename/rename-file.js';
import { createLogger, type LogEntry } from '../../../src/core/logger.js';
import { makeLogger, makeProject } from "../../helpers/index.js";
describe('renameFile', () => {
  it('updates imports in files that reference the renamed file', () => {
    const project = makeProject({
      '/src/math.ts': 'export function add(a: number, b: number) { return a + b; }\n',
      '/src/app.ts': 'import { add } from "./math";\nconst x = add(1, 2);\n',
    });
    const { logger } = makeLogger();

    const cs = renameFile(project, {
      oldPath: '/src/math.ts',
      newPath: '/src/arithmetic.ts',
      logger,
    });

    // app.ts should have updated import path
    const appChange = cs.files.find((f) => f.path === '/src/app.ts');
    expect(appChange).toBeDefined();

    const checkProject = new Project({ useInMemoryFileSystem: true });
    const sf = checkProject.createSourceFile('/check.ts', appChange!.modified);
    const importDecl = sf.getImportDeclarations()[0];
    expect(importDecl.getModuleSpecifierValue()).toBe('./arithmetic');
  });

  it('handles files in different directories', () => {
    const project = makeProject({
      '/src/utils/math.ts': 'export const PI = 3.14;\n',
      '/src/app.ts': 'import { PI } from "./utils/math";\nconsole.log(PI);\n',
    });
    const { logger } = makeLogger();

    const cs = renameFile(project, {
      oldPath: '/src/utils/math.ts',
      newPath: '/src/helpers/math.ts',
      logger,
    });

    const appChange = cs.files.find((f) => f.path === '/src/app.ts');
    expect(appChange).toBeDefined();

    const checkProject = new Project({ useInMemoryFileSystem: true });
    const sf = checkProject.createSourceFile('/check.ts', appChange!.modified);
    const importDecl = sf.getImportDeclarations()[0];
    expect(importDecl.getModuleSpecifierValue()).toBe('./helpers/math');
  });

  it('handles multiple importers', () => {
    const project = makeProject({
      '/src/math.ts': 'export const add = (a: number, b: number) => a + b;\n',
      '/src/app1.ts': 'import { add } from "./math";\n',
      '/src/app2.ts': 'import { add } from "./math";\n',
    });
    const { logger } = makeLogger();

    const cs = renameFile(project, {
      oldPath: '/src/math.ts',
      newPath: '/src/calc.ts',
      logger,
    });

    const changedPaths = cs.files.map((f) => f.path);
    expect(changedPaths).toContain('/src/app1.ts');
    expect(changedPaths).toContain('/src/app2.ts');
  });

  it('returns empty changeset for file with no importers', () => {
    const project = makeProject({
      '/src/standalone.ts': 'console.log("hello");\n',
    });
    const { logger } = makeLogger();

    const cs = renameFile(project, {
      oldPath: '/src/standalone.ts',
      newPath: '/src/renamed.ts',
      logger,
    });

    expect(cs.files).toHaveLength(0);
  });

  it('logs the operation', () => {
    const project = makeProject({
      '/src/math.ts': 'export const x = 1;\n',
      '/src/app.ts': 'import { x } from "./math";\n',
    });
    const { logger, entries } = makeLogger();

    renameFile(project, {
      oldPath: '/src/math.ts',
      newPath: '/src/calc.ts',
      logger,
    });

    const infoLogs = entries.filter((e) => e.scope === 'rename-file');
    expect(infoLogs.length).toBeGreaterThanOrEqual(1);
  });
});
