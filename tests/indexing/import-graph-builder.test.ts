import { describe, it, expect } from 'vitest';
import { buildFileEntry } from '../../src/indexing/import-graph-builder.js';

describe('buildFileEntry (oxc AST-based)', () => {
  it('extracts named imports from AST', () => {
    const entry = buildFileEntry('/src/app.ts', 'import { foo, bar } from "./utils";');
    expect(entry.imports).toHaveLength(1);
    expect(entry.imports[0].source).toBe('./utils');
    expect(entry.imports[0].specifiers).toEqual(['foo', 'bar']);
  });

  it('extracts default import from AST', () => {
    const entry = buildFileEntry('/src/app.ts', 'import App from "./App";');
    expect(entry.imports).toHaveLength(1);
    expect(entry.imports[0].source).toBe('./App');
    expect(entry.imports[0].specifiers).toEqual(['default']);
  });

  it('extracts namespace import from AST', () => {
    const entry = buildFileEntry('/src/app.ts', 'import * as utils from "./utils";');
    expect(entry.imports).toHaveLength(1);
    expect(entry.imports[0].source).toBe('./utils');
    expect(entry.imports[0].specifiers).toEqual(['*']);
  });

  it('extracts named exports from AST', () => {
    const entry = buildFileEntry('/src/math.ts', 'export function add(a: number, b: number) { return a + b; }');
    expect(entry.exports).toContain('add');
  });

  it('extracts re-exports from AST', () => {
    const entry = buildFileEntry('/src/index.ts', 'export { add, multiply } from "./math";');
    expect(entry.exports).toContain('add');
    expect(entry.exports).toContain('multiply');
    // re-exports also create an import dependency
    expect(entry.imports).toHaveLength(1);
    expect(entry.imports[0].source).toBe('./math');
  });

  it('extracts default export from AST', () => {
    const entry = buildFileEntry('/src/app.ts', 'const App = () => {}; export default App;');
    expect(entry.exports).toContain('default');
  });

  it('extracts export const/let/var declarations from AST', () => {
    const entry = buildFileEntry('/src/config.ts', 'export const PI = 3.14;\nexport let count = 0;');
    expect(entry.exports).toContain('PI');
    expect(entry.exports).toContain('count');
  });

  it('handles type-only imports', () => {
    const entry = buildFileEntry('/src/app.ts', 'import type { Foo } from "./types";');
    expect(entry.imports).toHaveLength(1);
    expect(entry.imports[0].source).toBe('./types');
    expect(entry.imports[0].specifiers).toEqual(['Foo']);
  });

  it('handles type-only exports', () => {
    const entry = buildFileEntry('/src/index.ts', 'export type { Foo } from "./types";');
    expect(entry.exports).toContain('Foo');
  });

  it('handles file with no imports or exports', () => {
    const entry = buildFileEntry('/src/script.ts', 'const x = 1; console.log(x);');
    expect(entry.imports).toEqual([]);
    expect(entry.exports).toEqual([]);
  });

  it('handles multiple imports from different sources', () => {
    const code = `
import { add } from "./math";
import { format } from "./format";
import type { Config } from "./config";
`;
    const entry = buildFileEntry('/src/app.ts', code);
    expect(entry.imports).toHaveLength(3);
    const sources = entry.imports.map(i => i.source);
    expect(sources).toContain('./math');
    expect(sources).toContain('./format');
    expect(sources).toContain('./config');
  });

  it('sets filePath correctly', () => {
    const entry = buildFileEntry('/src/foo.ts', 'export const x = 1;');
    expect(entry.filePath).toBe('/src/foo.ts');
  });
});
