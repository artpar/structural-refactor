import { describe, it, expect } from 'vitest';
import { Project } from 'ts-morph';
import { renameSymbol } from '../../src/operations/rename/rename-symbol.js';
import { renameFile } from '../../src/operations/rename/rename-file.js';
import { moveSymbol } from '../../src/operations/move/move-symbol.js';
import { extractVariable } from '../../src/operations/extract/extract-variable.js';
import { extractFunction } from '../../src/operations/extract/extract-function.js';
import { extractInterface } from '../../src/operations/extract/extract-interface.js';
import { inlineVariable } from '../../src/operations/inline/inline-variable.js';
import { inlineFunction } from '../../src/operations/inline/inline-function.js';
import { inlineTypeAlias } from '../../src/operations/inline/inline-type-alias.js';
import { encapsulateField } from '../../src/operations/member/encapsulate.js';
import { toArrow } from '../../src/operations/signature/to-arrow.js';
import { toAsync } from '../../src/operations/signature/to-async.js';
import { changeSignature } from '../../src/operations/signature/change-signature.js';
import { safeDelete } from '../../src/operations/type/safe-delete.js';
import { convertTypeInterface } from '../../src/operations/type/convert-type-interface.js';
import { classToFunctions } from '../../src/operations/class/to-functions.js';
import { replaceInheritanceWithComposition } from '../../src/operations/class/composition.js';
import { cjsToEsm } from '../../src/operations/module/cjs-to-esm.js';
import { defaultToNamed } from '../../src/operations/module/default-to-named.js';
import { createLogger } from '../../src/core/logger.js';

function makeProject(files: Record<string, string>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [name, content] of Object.entries(files)) {
    project.createSourceFile(name, content);
  }
  return project;
}

const logger = createLogger({ level: 'error', sink: () => {} });

describe('operation error paths', () => {
  describe('rename-symbol', () => {
    it('handles missing source file', () => {
      const project = makeProject({});
      const cs = renameSymbol(project, { filePath: '/nope.ts', line: 1, col: 1, newName: 'x', logger });
      expect(cs.files).toHaveLength(0);
    });
  });

  describe('rename-file', () => {
    it('handles file with no importers gracefully', () => {
      const project = makeProject({ '/src/lone.ts': 'export const x = 1;\n' });
      const cs = renameFile(project, { oldPath: '/src/lone.ts', newPath: '/src/moved.ts', logger });
      expect(cs.files).toHaveLength(0);
    });
  });

  describe('move-symbol', () => {
    it('handles missing source file', () => {
      const project = makeProject({ '/src/target.ts': '' });
      const cs = moveSymbol(project, { symbolName: 'x', fromFile: '/nope.ts', toFile: '/src/target.ts', logger });
      expect(cs.files).toHaveLength(0);
    });

    it('handles missing target file', () => {
      const project = makeProject({ '/src/source.ts': 'export const x = 1;\n' });
      const cs = moveSymbol(project, { symbolName: 'x', fromFile: '/src/source.ts', toFile: '/nope.ts', logger });
      expect(cs.files).toHaveLength(0);
    });

    it('handles symbol not found', () => {
      const project = makeProject({ '/src/a.ts': 'export const y = 1;\n', '/src/b.ts': '' });
      const cs = moveSymbol(project, { symbolName: 'x', fromFile: '/src/a.ts', toFile: '/src/b.ts', logger });
      expect(cs.files).toHaveLength(0);
    });

    it('moves a class', () => {
      const project = makeProject({
        '/src/a.ts': 'export class Foo { bar() {} }\n',
        '/src/b.ts': '',
      });
      const cs = moveSymbol(project, { symbolName: 'Foo', fromFile: '/src/a.ts', toFile: '/src/b.ts', logger });
      expect(cs.files.length).toBeGreaterThanOrEqual(1);
    });

    it('moves an interface', () => {
      const project = makeProject({
        '/src/a.ts': 'export interface IFoo { x: number; }\n',
        '/src/b.ts': '',
      });
      const cs = moveSymbol(project, { symbolName: 'IFoo', fromFile: '/src/a.ts', toFile: '/src/b.ts', logger });
      expect(cs.files.length).toBeGreaterThanOrEqual(1);
    });

    it('moves a type alias', () => {
      const project = makeProject({
        '/src/a.ts': 'export type ID = string;\n',
        '/src/b.ts': '',
      });
      const cs = moveSymbol(project, { symbolName: 'ID', fromFile: '/src/a.ts', toFile: '/src/b.ts', logger });
      expect(cs.files.length).toBeGreaterThanOrEqual(1);
    });

    it('moves an enum', () => {
      const project = makeProject({
        '/src/a.ts': 'export enum Color { Red, Green, Blue }\n',
        '/src/b.ts': '',
      });
      const cs = moveSymbol(project, { symbolName: 'Color', fromFile: '/src/a.ts', toFile: '/src/b.ts', logger });
      expect(cs.files.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('extract-variable', () => {
    it('handles missing file', () => {
      const project = makeProject({});
      const cs = extractVariable(project, { filePath: '/nope.ts', startLine: 1, startCol: 1, endLine: 1, endCol: 5, variableName: 'x', kind: 'const', logger });
      expect(cs.files).toHaveLength(0);
    });
  });

  describe('extract-function', () => {
    it('handles missing file', () => {
      const project = makeProject({});
      const cs = extractFunction(project, { filePath: '/nope.ts', startLine: 1, startCol: 1, endLine: 1, endCol: 5, functionName: 'fn', logger });
      expect(cs.files).toHaveLength(0);
    });
  });

  describe('extract-interface', () => {
    it('handles missing file', () => {
      const project = makeProject({});
      const cs = extractInterface(project, { filePath: '/nope.ts', className: 'X', interfaceName: 'IX', logger });
      expect(cs.files).toHaveLength(0);
    });
  });

  describe('inline-variable', () => {
    it('handles missing file', () => {
      const project = makeProject({});
      const cs = inlineVariable(project, { filePath: '/nope.ts', line: 1, col: 1, logger });
      expect(cs.files).toHaveLength(0);
    });

    it('handles variable without initializer', () => {
      const project = makeProject({ '/src/app.ts': 'let x: number;\nx = 5;\n' });
      const cs = inlineVariable(project, { filePath: '/src/app.ts', line: 1, col: 5, logger });
      expect(cs.files).toHaveLength(0);
    });
  });

  describe('inline-function', () => {
    it('handles missing file', () => {
      const project = makeProject({});
      const cs = inlineFunction(project, { filePath: '/nope.ts', line: 1, col: 1, logger });
      expect(cs.files).toHaveLength(0);
    });

    it('handles multi-statement body (cannot inline)', () => {
      const project = makeProject({
        '/src/app.ts': 'function f() { const x = 1; return x; }\nconst y = f();\n',
      });
      const cs = inlineFunction(project, { filePath: '/src/app.ts', line: 1, col: 10, logger });
      expect(cs.files).toHaveLength(0);
    });
  });

  describe('inline-type-alias', () => {
    it('handles missing file', () => {
      const project = makeProject({});
      const cs = inlineTypeAlias(project, { filePath: '/nope.ts', line: 1, col: 1, logger });
      expect(cs.files).toHaveLength(0);
    });

    it('handles non-type-alias identifier', () => {
      const project = makeProject({ '/src/app.ts': 'const x = 1;\n' });
      const cs = inlineTypeAlias(project, { filePath: '/src/app.ts', line: 1, col: 7, logger });
      expect(cs.files).toHaveLength(0);
    });
  });

  describe('to-arrow', () => {
    it('handles missing file', () => {
      const project = makeProject({});
      const cs = toArrow(project, { filePath: '/nope.ts', line: 1, col: 1, logger });
      expect(cs.files).toHaveLength(0);
    });

    it('handles non-function identifier', () => {
      const project = makeProject({ '/src/app.ts': 'const x = 1;\n' });
      const cs = toArrow(project, { filePath: '/src/app.ts', line: 1, col: 7, logger });
      expect(cs.files).toHaveLength(0);
    });

    it('handles async function', () => {
      const project = makeProject({ '/src/app.ts': 'async function fetchData() { return 1; }\n' });
      const cs = toArrow(project, { filePath: '/src/app.ts', line: 1, col: 16, logger });
      expect(cs.files).toHaveLength(1);
      expect(cs.files[0].modified).toContain('async');
      expect(cs.files[0].modified).toContain('=>');
    });
  });

  describe('to-async', () => {
    it('handles missing file', () => {
      const project = makeProject({});
      const cs = toAsync(project, { filePath: '/nope.ts', line: 1, col: 1, logger });
      expect(cs.files).toHaveLength(0);
    });

    it('handles non-function identifier', () => {
      const project = makeProject({ '/src/app.ts': 'const x = 1;\n' });
      const cs = toAsync(project, { filePath: '/src/app.ts', line: 1, col: 7, logger });
      expect(cs.files).toHaveLength(0);
    });
  });

  describe('change-signature', () => {
    it('handles missing file', () => {
      const project = makeProject({});
      const cs = changeSignature(project, { filePath: '/nope.ts', functionName: 'f', logger });
      expect(cs.files).toHaveLength(0);
    });
  });

  describe('safe-delete', () => {
    it('handles missing file', () => {
      const project = makeProject({});
      const cs = safeDelete(project, { filePath: '/nope.ts', symbolName: 'x', logger });
      expect(cs.files).toHaveLength(0);
    });

    it('deletes unreferenced class', () => {
      const project = makeProject({ '/src/app.ts': 'class Unused {}\nconst x = 1;\n' });
      const cs = safeDelete(project, { filePath: '/src/app.ts', symbolName: 'Unused', logger });
      expect(cs.files).toHaveLength(1);
    });

    it('deletes unreferenced enum', () => {
      const project = makeProject({ '/src/app.ts': 'enum Unused { A, B }\nconst x = 1;\n' });
      const cs = safeDelete(project, { filePath: '/src/app.ts', symbolName: 'Unused', logger });
      expect(cs.files).toHaveLength(1);
    });
  });

  describe('convert-type-interface', () => {
    it('handles missing file', () => {
      const project = makeProject({});
      const cs = convertTypeInterface(project, { filePath: '/nope.ts', line: 1, col: 1, logger });
      expect(cs.files).toHaveLength(0);
    });

    it('handles exported type alias', () => {
      const project = makeProject({ '/src/app.ts': 'export type Cfg = { x: number; };\n' });
      const cs = convertTypeInterface(project, { filePath: '/src/app.ts', line: 1, col: 13, logger });
      expect(cs.files).toHaveLength(1);
      expect(cs.files[0].modified).toContain('export interface Cfg');
    });

    it('handles exported interface', () => {
      const project = makeProject({ '/src/app.ts': 'export interface Cfg { x: number; }\n' });
      const cs = convertTypeInterface(project, { filePath: '/src/app.ts', line: 1, col: 18, logger });
      expect(cs.files).toHaveLength(1);
      expect(cs.files[0].modified).toContain('export type Cfg');
    });

    it('rejects non-object type alias', () => {
      const project = makeProject({ '/src/app.ts': 'type ID = string;\n' });
      const cs = convertTypeInterface(project, { filePath: '/src/app.ts', line: 1, col: 6, logger });
      expect(cs.files).toHaveLength(0);
    });
  });

  describe('class-to-functions', () => {
    it('handles missing file', () => {
      const project = makeProject({});
      const cs = classToFunctions(project, { filePath: '/nope.ts', className: 'X', logger });
      expect(cs.files).toHaveLength(0);
    });
  });

  describe('composition', () => {
    it('handles missing file', () => {
      const project = makeProject({});
      const cs = replaceInheritanceWithComposition(project, { filePath: '/nope.ts', className: 'X', logger });
      expect(cs.files).toHaveLength(0);
    });

    it('handles class not found', () => {
      const project = makeProject({ '/src/app.ts': 'const x = 1;\n' });
      const cs = replaceInheritanceWithComposition(project, { filePath: '/src/app.ts', className: 'Nope', logger });
      expect(cs.files).toHaveLength(0);
    });
  });

  describe('cjs-to-esm', () => {
    it('handles missing file', () => {
      const project = makeProject({});
      const cs = cjsToEsm(project, { filePath: '/nope.ts', logger });
      expect(cs.files).toHaveLength(0);
    });
  });

  describe('default-to-named', () => {
    it('handles missing file', () => {
      const project = makeProject({});
      const cs = defaultToNamed(project, { filePath: '/nope.ts', logger });
      expect(cs.files).toHaveLength(0);
    });
  });
});
