import { describe, it, expect } from 'vitest';
import { Project } from 'ts-morph';
import { moveSymbol } from '../../../src/operations/move/move-symbol.js';
import { createLogger, type LogEntry } from '../../../src/core/logger.js';
import { makeLogger, makeProject, parseAst } from "../../helpers/index.js";
describe('moveSymbol', () => {
  it('moves an exported function to another file', () => {
    const project = makeProject({
      '/src/source.ts': 'export function helper() { return 1; }\nexport const other = 2;\n',
      '/src/target.ts': 'export const existing = 3;\n',
      '/src/app.ts': 'import { helper } from "./source";\nconst x = helper();\n',
    });
    const { logger } = makeLogger();

    const cs = moveSymbol(project, {
      symbolName: 'helper',
      fromFile: '/src/source.ts',
      toFile: '/src/target.ts',
      logger,
    });

    // Source should no longer export helper
    const sourceChange = cs.files.find((f) => f.path === '/src/source.ts')!;
    expect(sourceChange).toBeDefined();
    const sourceSf = parseAst(sourceChange.modified);
    expect(sourceSf.getFunction('helper')).toBeUndefined();
    expect(sourceSf.getVariableDeclaration('other')).toBeDefined();

    // Target should now have helper
    const targetChange = cs.files.find((f) => f.path === '/src/target.ts')!;
    expect(targetChange).toBeDefined();
    const targetSf = parseAst(targetChange.modified);
    expect(targetSf.getFunction('helper')).toBeDefined();

    // App should import from target now
    const appChange = cs.files.find((f) => f.path === '/src/app.ts')!;
    expect(appChange).toBeDefined();
    const appSf = parseAst(appChange.modified);
    const importDecl = appSf.getImportDeclarations()[0];
    expect(importDecl.getModuleSpecifierValue()).toBe('./target');
  });

  it('moves an exported variable', () => {
    const project = makeProject({
      '/src/source.ts': 'export const PI = 3.14;\nexport const E = 2.71;\n',
      '/src/target.ts': '',
    });
    const { logger } = makeLogger();

    const cs = moveSymbol(project, {
      symbolName: 'PI',
      fromFile: '/src/source.ts',
      toFile: '/src/target.ts',
      logger,
    });

    const sourceChange = cs.files.find((f) => f.path === '/src/source.ts')!;
    const sourceSf = parseAst(sourceChange.modified);
    expect(sourceSf.getVariableDeclaration('PI')).toBeUndefined();
    expect(sourceSf.getVariableDeclaration('E')).toBeDefined();

    const targetChange = cs.files.find((f) => f.path === '/src/target.ts')!;
    const targetSf = parseAst(targetChange.modified);
    expect(targetSf.getVariableDeclaration('PI')).toBeDefined();
  });

  it('returns empty changeset when symbol not found', () => {
    const project = makeProject({
      '/src/source.ts': 'export const x = 1;\n',
      '/src/target.ts': '',
    });
    const { logger } = makeLogger();

    const cs = moveSymbol(project, {
      symbolName: 'nonexistent',
      fromFile: '/src/source.ts',
      toFile: '/src/target.ts',
      logger,
    });

    expect(cs.files).toHaveLength(0);
  });

  it('logs the move operation', () => {
    const project = makeProject({
      '/src/source.ts': 'export function fn() {}\n',
      '/src/target.ts': '',
    });
    const { logger, entries } = makeLogger();

    moveSymbol(project, {
      symbolName: 'fn',
      fromFile: '/src/source.ts',
      toFile: '/src/target.ts',
      logger,
    });

    const infoLogs = entries.filter((e) => e.scope === 'move-symbol');
    expect(infoLogs.length).toBeGreaterThanOrEqual(1);
  });
});
