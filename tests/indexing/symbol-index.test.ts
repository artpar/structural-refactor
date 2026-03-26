import { describe, it, expect } from 'vitest';
import {
  type SymbolIndex,
  createSymbolIndex,
  addSymbols,
  definitionsOf,
  referencesOf,
} from '../../src/indexing/symbol-index.js';

describe('SymbolIndex', () => {
  describe('createSymbolIndex', () => {
    it('starts empty', () => {
      const idx = createSymbolIndex();
      expect(definitionsOf(idx, 'foo')).toEqual([]);
      expect(referencesOf(idx, 'foo')).toEqual([]);
    });
  });

  describe('addSymbols', () => {
    it('records definitions', () => {
      let idx = createSymbolIndex();
      idx = addSymbols(idx, '/src/math.ts', { definitions: ['add', 'multiply'], references: [] });
      expect(definitionsOf(idx, 'add')).toEqual(['/src/math.ts']);
      expect(definitionsOf(idx, 'multiply')).toEqual(['/src/math.ts']);
    });

    it('records references', () => {
      let idx = createSymbolIndex();
      idx = addSymbols(idx, '/src/app.ts', { definitions: [], references: ['add', 'PI'] });
      expect(referencesOf(idx, 'add')).toEqual(['/src/app.ts']);
      expect(referencesOf(idx, 'PI')).toEqual(['/src/app.ts']);
    });

    it('accumulates across multiple files', () => {
      let idx = createSymbolIndex();
      idx = addSymbols(idx, '/src/math.ts', { definitions: ['add'], references: [] });
      idx = addSymbols(idx, '/src/utils.ts', { definitions: [], references: ['add'] });
      idx = addSymbols(idx, '/src/app.ts', { definitions: [], references: ['add'] });
      expect(definitionsOf(idx, 'add')).toEqual(['/src/math.ts']);
      expect(referencesOf(idx, 'add')).toEqual(['/src/utils.ts', '/src/app.ts']);
    });

    it('is immutable — does not modify original', () => {
      const idx1 = createSymbolIndex();
      const idx2 = addSymbols(idx1, '/src/foo.ts', { definitions: ['foo'], references: [] });
      expect(definitionsOf(idx1, 'foo')).toEqual([]);
      expect(definitionsOf(idx2, 'foo')).toEqual(['/src/foo.ts']);
    });

    it('handles symbol that is both defined and referenced in same file', () => {
      let idx = createSymbolIndex();
      idx = addSymbols(idx, '/src/math.ts', { definitions: ['add'], references: ['add'] });
      expect(definitionsOf(idx, 'add')).toEqual(['/src/math.ts']);
      expect(referencesOf(idx, 'add')).toEqual(['/src/math.ts']);
    });
  });
});
