import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { extractFileSummary } from '../../src/scanner/file-summary.js';

const FIXTURES = path.resolve(import.meta.dirname, '../fixtures/simple-project/src');

function summarize(fileName: string) {
  const filePath = path.join(FIXTURES, fileName);
  const sourceText = fs.readFileSync(filePath, 'utf-8');
  return extractFileSummary(filePath, sourceText);
}

describe('extractFileSummary', () => {
  it('extracts imports from a real file', () => {
    const summary = summarize('utils.ts');
    expect(summary.imports.length).toBeGreaterThanOrEqual(1);
    const mathImport = summary.imports.find((i) => i.source === './math');
    expect(mathImport).toBeDefined();
    expect(mathImport!.specifiers).toContain('add');
  });

  it('extracts exports from a real file', () => {
    const summary = summarize('math.ts');
    expect(summary.exports).toContain('add');
    expect(summary.exports).toContain('multiply');
    expect(summary.exports).toContain('PI');
  });

  it('extracts top-level names with kinds', () => {
    const summary = summarize('math.ts');
    const addEntry = summary.nameKinds.find((nk) => nk.name === 'add');
    expect(addEntry).toBeDefined();
    expect(addEntry!.kind).toBe('function');

    const piEntry = summary.nameKinds.find((nk) => nk.name === 'PI');
    expect(piEntry).toBeDefined();
    expect(piEntry!.kind).toBe('variable');
  });

  it('detects module files', () => {
    const summary = summarize('math.ts');
    expect(summary.isModule).toBe(true);
  });

  it('extracts re-exports from barrel files', () => {
    const summary = summarize('index.ts');
    expect(summary.reExports.length).toBeGreaterThanOrEqual(1);
    expect(summary.exports).toContain('add');
    expect(summary.exports).toContain('sum');
  });

  it('detects default exports', () => {
    // index.ts has named exports only, no default
    const summary = summarize('index.ts');
    expect(summary.hasDefaultExport).toBe(false);
  });

  it('handles inline source text', () => {
    const summary = extractFileSummary('test.ts', `
      export default function main() { return 1; }
      export const VERSION = '1.0';
    `);
    expect(summary.hasDefaultExport).toBe(true);
    expect(summary.exports).toContain('default');
    expect(summary.exports).toContain('VERSION');
  });

  it('handles CJS require patterns', () => {
    const summary = extractFileSummary('cjs.js', `
      const fs = require('fs');
      const path = require('path');
      module.exports = { hello: 'world' };
    `);
    expect(summary.imports.length).toBeGreaterThanOrEqual(2);
    expect(summary.imports.map((i) => i.source)).toContain('fs');
    expect(summary.imports.map((i) => i.source)).toContain('path');
    expect(summary.exports).toContain('default');
  });

  it('handles CJS exports.name pattern', () => {
    const summary = extractFileSummary('cjs2.js', `
      exports.greet = function() { return 'hi'; };
    `);
    expect(summary.exports).toContain('greet');
  });

  it('extracts class declarations', () => {
    const summary = extractFileSummary('classes.ts', `
      export class MyService {
        run() {}
      }
      class InternalHelper {}
    `);
    const serviceEntry = summary.nameKinds.find((nk) => nk.name === 'MyService');
    expect(serviceEntry).toBeDefined();
    expect(serviceEntry!.kind).toBe('class');
    const helperEntry = summary.nameKinds.find((nk) => nk.name === 'InternalHelper');
    expect(helperEntry).toBeDefined();
    expect(helperEntry!.kind).toBe('class');
  });

  it('extracts interface and type declarations', () => {
    const summary = extractFileSummary('types.ts', `
      export interface Config { host: string; }
      export type Result = { ok: boolean; };
    `);
    const configEntry = summary.nameKinds.find((nk) => nk.name === 'Config');
    expect(configEntry).toBeDefined();
    expect(configEntry!.kind).toBe('interface');
    const resultEntry = summary.nameKinds.find((nk) => nk.name === 'Result');
    expect(resultEntry).toBeDefined();
    expect(resultEntry!.kind).toBe('type');
  });

  it('extracts enum declarations', () => {
    const summary = extractFileSummary('enums.ts', `
      export enum Status { Active, Inactive }
    `);
    const enumEntry = summary.nameKinds.find((nk) => nk.name === 'Status');
    expect(enumEntry).toBeDefined();
    expect(enumEntry!.kind).toBe('enum');
  });

  it('detects arrow function variables', () => {
    const summary = extractFileSummary('arrows.ts', `
      export const handler = () => {};
      const internal = (x: number) => x * 2;
    `);
    const handlerEntry = summary.nameKinds.find((nk) => nk.name === 'handler');
    expect(handlerEntry).toBeDefined();
    expect(handlerEntry!.kind).toBe('arrow');
  });

  it('returns empty arrays for empty file', () => {
    const summary = extractFileSummary('empty.ts', '');
    expect(summary.imports).toHaveLength(0);
    expect(summary.exports).toHaveLength(0);
    expect(summary.topLevelNames).toHaveLength(0);
    expect(summary.isModule).toBe(false);
  });
});
