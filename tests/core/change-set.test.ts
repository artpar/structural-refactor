import { describe, it, expect } from 'vitest';
import {
  type FileChange,
  type ChangeSet,
  createChangeSet,
  reverseChangeSet,
  renderJson,
} from '../../src/core/change-set.js';

describe('ChangeSet value type', () => {
  const sampleChange: FileChange = {
    path: '/project/src/foo.ts',
    original: 'const foo = 1;\n',
    modified: 'const bar = 1;\n',
  };

  const sampleChangeSet: ChangeSet = {
    description: 'Rename foo to bar',
    files: [sampleChange],
  };

  describe('createChangeSet', () => {
    it('creates a change set from files and description', () => {
      const cs = createChangeSet('Rename foo to bar', [sampleChange]);
      expect(cs.description).toBe('Rename foo to bar');
      expect(cs.files).toHaveLength(1);
      expect(cs.files[0]).toEqual(sampleChange);
    });

    it('creates an empty change set', () => {
      const cs = createChangeSet('No changes', []);
      expect(cs.files).toHaveLength(0);
    });
  });

  describe('reverseChangeSet', () => {
    it('swaps original and modified for each file', () => {
      const reversed = reverseChangeSet(sampleChangeSet);
      expect(reversed.files).toHaveLength(1);
      expect(reversed.files[0]).toEqual({
        path: '/project/src/foo.ts',
        original: 'const bar = 1;\n',
        modified: 'const foo = 1;\n',
      });
    });

    it('sets description to undo prefix', () => {
      const reversed = reverseChangeSet(sampleChangeSet);
      expect(reversed.description).toBe('Undo: Rename foo to bar');
    });

    it('reversal of reversal restores original values', () => {
      const reversed = reverseChangeSet(sampleChangeSet);
      const doubleReversed = reverseChangeSet(reversed);
      expect(doubleReversed.files).toEqual(sampleChangeSet.files);
    });

    it('handles multiple files', () => {
      const cs = createChangeSet('Multi-file', [
        { path: '/a.ts', original: 'a', modified: 'A' },
        { path: '/b.ts', original: 'b', modified: 'B' },
      ]);
      const reversed = reverseChangeSet(cs);
      expect(reversed.files).toEqual([
        { path: '/a.ts', original: 'A', modified: 'a' },
        { path: '/b.ts', original: 'B', modified: 'b' },
      ]);
    });
  });

  describe('renderJson', () => {
    it('returns a serializable plain object', () => {
      const json = renderJson(sampleChangeSet);
      expect(json).toEqual({
        description: 'Rename foo to bar',
        files: [sampleChange],
      });
    });

    it('roundtrips through JSON serialization', () => {
      const json = renderJson(sampleChangeSet);
      const roundtripped = JSON.parse(JSON.stringify(json));
      expect(roundtripped).toEqual(json);
    });
  });
});
