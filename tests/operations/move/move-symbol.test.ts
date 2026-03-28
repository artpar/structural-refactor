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

  // Issue #1: move symbol appends duplicate when target already has the symbol
  it('skips copy when target already has the symbol', () => {
    const project = makeProject({
      '/src/source.ts': 'export function helper() { return 1; }\nexport const other = 2;\n',
      '/src/target.ts': 'export function helper() { return 2; }\n',
      '/src/app.ts': 'import { helper } from "./source";\nconst x = helper();\n',
    });
    const { logger } = makeLogger();

    const cs = moveSymbol(project, {
      symbolName: 'helper',
      fromFile: '/src/source.ts',
      toFile: '/src/target.ts',
      logger,
    });

    // Target should NOT have a duplicate — still just one helper
    const targetChange = cs.files.find((f) => f.path === '/src/target.ts');
    if (targetChange) {
      const targetSf = parseAst(targetChange.modified);
      const helpers = targetSf.getFunctions().filter((f) => f.getName() === 'helper');
      expect(helpers).toHaveLength(1);
    }

    // Source should have helper removed
    const sourceChange = cs.files.find((f) => f.path === '/src/source.ts')!;
    expect(sourceChange).toBeDefined();
    const sourceSf = parseAst(sourceChange.modified);
    expect(sourceSf.getFunction('helper')).toBeUndefined();

    // App should import from target now
    const appChange = cs.files.find((f) => f.path === '/src/app.ts')!;
    expect(appChange).toBeDefined();
    const appSf = parseAst(appChange.modified);
    const importDecl = appSf.getImportDeclarations()[0];
    expect(importDecl.getModuleSpecifierValue()).toBe('./target');
  });

  // Issue #1: warn when signatures differ
  it('warns when target has symbol with different signature', () => {
    const project = makeProject({
      '/src/source.ts': 'export function fmt(s: string): string { return s; }\n',
      '/src/target.ts': 'export function fmt(s: string, n: number): string { return s; }\n',
    });
    const { logger, entries } = makeLogger();

    moveSymbol(project, {
      symbolName: 'fmt',
      fromFile: '/src/source.ts',
      toFile: '/src/target.ts',
      logger,
    });

    const warnings = entries.filter((e) => e.level === 'warn' && e.scope === 'move-symbol');
    expect(warnings.length).toBeGreaterThanOrEqual(1);
    expect(warnings.some((w) => w.message.includes('signature') || JSON.stringify(w.data).includes('Signature'))).toBe(true);
  });

  // Issue #4: unused imports left behind after move
  it('removes imports only used by the moved symbol', () => {
    const project = makeProject({
      '/src/dep.ts': 'export function dep() { return 42; }\n',
      '/src/source.ts': 'import { dep } from "./dep";\nexport function helper() { return dep(); }\nexport function other() { return 1; }\n',
      '/src/target.ts': '',
    });
    const { logger } = makeLogger();

    const cs = moveSymbol(project, {
      symbolName: 'helper',
      fromFile: '/src/source.ts',
      toFile: '/src/target.ts',
      logger,
    });

    // Source should no longer import dep (only helper used it)
    const sourceChange = cs.files.find((f) => f.path === '/src/source.ts')!;
    expect(sourceChange).toBeDefined();
    const sourceSf = parseAst(sourceChange.modified);
    const imports = sourceSf.getImportDeclarations();
    const depImport = imports.find((d) => d.getModuleSpecifierValue() === './dep');
    expect(depImport).toBeUndefined();
  });

  // Issue #4: shared imports should be kept
  it('keeps imports still used by remaining code', () => {
    const project = makeProject({
      '/src/dep.ts': 'export function dep() { return 42; }\n',
      '/src/source.ts': 'import { dep } from "./dep";\nexport function helper() { return dep(); }\nexport function other() { return dep(); }\n',
      '/src/target.ts': '',
    });
    const { logger } = makeLogger();

    const cs = moveSymbol(project, {
      symbolName: 'helper',
      fromFile: '/src/source.ts',
      toFile: '/src/target.ts',
      logger,
    });

    // Source should STILL import dep (other() uses it)
    const sourceChange = cs.files.find((f) => f.path === '/src/source.ts')!;
    expect(sourceChange).toBeDefined();
    const sourceSf = parseAst(sourceChange.modified);
    const imports = sourceSf.getImportDeclarations();
    const depImport = imports.find((d) => d.getModuleSpecifierValue() === './dep');
    expect(depImport).toBeDefined();
  });

  // Issue #5: non-exported function
  it('moves a non-exported function and adds import back in source', () => {
    const project = makeProject({
      '/src/source.ts': 'function isFloating() { return true; }\nexport function main() { return isFloating(); }\n',
      '/src/target.ts': '',
    });
    const { logger } = makeLogger();

    const cs = moveSymbol(project, {
      symbolName: 'isFloating',
      fromFile: '/src/source.ts',
      toFile: '/src/target.ts',
      logger,
    });

    expect(cs.files.length).toBeGreaterThanOrEqual(2);

    // Target should have the function as an export
    const targetChange = cs.files.find((f) => f.path === '/src/target.ts')!;
    expect(targetChange).toBeDefined();
    const targetSf = parseAst(targetChange.modified);
    const fn = targetSf.getFunction('isFloating');
    expect(fn).toBeDefined();
    expect(fn!.isExported()).toBe(true);

    // Source should import from target
    const sourceChange = cs.files.find((f) => f.path === '/src/source.ts')!;
    expect(sourceChange).toBeDefined();
    const sourceSf = parseAst(sourceChange.modified);
    expect(sourceSf.getFunction('isFloating')).toBeUndefined();
    const importDecl = sourceSf.getImportDeclarations().find(
      (d) => d.getModuleSpecifierValue() === './target'
    );
    expect(importDecl).toBeDefined();
    expect(importDecl!.getNamedImports().some((n) => n.getName() === 'isFloating')).toBe(true);
  });

  // Issue #5: non-exported const
  it('moves a non-exported const', () => {
    const project = makeProject({
      '/src/source.ts': 'const API_URL = "https://api.example.com";\nexport function fetch() { return API_URL; }\n',
      '/src/target.ts': '',
    });
    const { logger } = makeLogger();

    const cs = moveSymbol(project, {
      symbolName: 'API_URL',
      fromFile: '/src/source.ts',
      toFile: '/src/target.ts',
      logger,
    });

    expect(cs.files.length).toBeGreaterThanOrEqual(2);

    // Target should export API_URL
    const targetChange = cs.files.find((f) => f.path === '/src/target.ts')!;
    expect(targetChange).toBeDefined();
    const targetSf = parseAst(targetChange.modified);
    const decl = targetSf.getVariableDeclaration('API_URL');
    expect(decl).toBeDefined();

    // Source should import API_URL from target
    const sourceChange = cs.files.find((f) => f.path === '/src/source.ts')!;
    const sourceSf = parseAst(sourceChange.modified);
    const importDecl = sourceSf.getImportDeclarations().find(
      (d) => d.getModuleSpecifierValue() === './target'
    );
    expect(importDecl).toBeDefined();
  });

  // Issue #16: export keyword placed before leading comment
  it('places export keyword before declaration, not before leading comment', () => {
    const project = makeProject({
      '/src/source.ts': '// Storage utilities\nconst isFloating = () => true;\nexport function main() { return isFloating(); }\n',
      '/src/target.ts': '',
    });
    const { logger } = makeLogger();

    const cs = moveSymbol(project, {
      symbolName: 'isFloating',
      fromFile: '/src/source.ts',
      toFile: '/src/target.ts',
      logger,
    });

    const targetChange = cs.files.find((f) => f.path === '/src/target.ts')!;
    expect(targetChange).toBeDefined();
    // export should be before 'const', not before the comment
    expect(targetChange.modified).not.toMatch(/export\s*\/\//);
    expect(targetChange.modified).toContain('export const isFloating');
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
