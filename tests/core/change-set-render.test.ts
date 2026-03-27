import { describe, it, expect } from 'vitest';
import { createChangeSet, renderDiff } from '../../src/core/change-set.js';

describe('renderDiff', () => {
  it('produces unified diff output for a single file change', () => {
    const cs = createChangeSet('test', [
      { path: '/src/foo.ts', original: 'const x = 1;\n', modified: 'const y = 1;\n' },
    ]);
    const diff = renderDiff(cs);
    expect(diff.length).toBeGreaterThan(0);
    expect(diff).toContain('foo.ts');
  });

  it('returns empty string for empty changeset', () => {
    const cs = createChangeSet('empty', []);
    expect(renderDiff(cs)).toBe('');
  });

  it('handles multiple file changes', () => {
    const cs = createChangeSet('multi', [
      { path: '/a.ts', original: 'a\n', modified: 'b\n' },
      { path: '/b.ts', original: 'c\n', modified: 'd\n' },
    ]);
    const diff = renderDiff(cs);
    expect(diff).toContain('a.ts');
    expect(diff).toContain('b.ts');
  });
});
