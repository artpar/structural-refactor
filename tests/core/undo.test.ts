import { describe, it, expect, beforeEach } from 'vitest';
import {
  type UndoStack,
  type UndoEntry,
  createUndoStack,
  pushUndo,
  popUndo,
  peekUndo,
  serializeUndoStack,
  deserializeUndoStack,
} from '../../src/core/undo.js';

describe('UndoStack', () => {
  let stack: UndoStack;

  const entry1: UndoEntry = {
    timestamp: '2026-03-26T10:00:00Z',
    description: 'Rename foo to bar',
    files: [{ path: '/a.ts', original: 'foo', modified: 'bar' }],
  };

  const entry2: UndoEntry = {
    timestamp: '2026-03-26T10:01:00Z',
    description: 'Move utils.ts',
    files: [{ path: '/b.ts', original: 'old', modified: 'new' }],
  };

  beforeEach(() => {
    stack = createUndoStack();
  });

  it('starts empty', () => {
    expect(stack.entries).toHaveLength(0);
  });

  it('push adds entry to top', () => {
    const s1 = pushUndo(stack, entry1);
    expect(s1.entries).toHaveLength(1);
    const s2 = pushUndo(s1, entry2);
    expect(s2.entries).toHaveLength(2);
  });

  it('pop removes and returns top entry', () => {
    const s1 = pushUndo(pushUndo(stack, entry1), entry2);
    const [popped, s2] = popUndo(s1);
    expect(popped).toEqual(entry2);
    expect(s2.entries).toHaveLength(1);
  });

  it('pop returns undefined on empty stack', () => {
    const [popped, s2] = popUndo(stack);
    expect(popped).toBeUndefined();
    expect(s2.entries).toHaveLength(0);
  });

  it('peek returns top without removing', () => {
    const s1 = pushUndo(stack, entry1);
    expect(peekUndo(s1)).toEqual(entry1);
    expect(s1.entries).toHaveLength(1);
  });

  it('peek returns undefined on empty stack', () => {
    expect(peekUndo(stack)).toBeUndefined();
  });

  it('serializes and deserializes roundtrip', () => {
    const s1 = pushUndo(pushUndo(stack, entry1), entry2);
    const json = serializeUndoStack(s1);
    const s2 = deserializeUndoStack(json);
    expect(s2).toEqual(s1);
  });

  describe('immutability', () => {
    it('push does not mutate original stack', () => {
      const s1 = pushUndo(stack, entry1);
      expect(stack.entries).toHaveLength(0);
      expect(s1.entries).toHaveLength(1);
    });

    it('pop does not mutate original stack', () => {
      const s1 = pushUndo(stack, entry1);
      const [, s2] = popUndo(s1);
      expect(s1.entries).toHaveLength(1);
      expect(s2.entries).toHaveLength(0);
    });
  });
});
