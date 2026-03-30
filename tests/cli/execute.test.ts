import { describe, it, expect } from 'vitest';
import { createExecutionContext, loadConfig, validateFilePaths, handleResult } from '../../src/cli/execute.js';
import { createChangeSet } from '../../src/core/change-set.js';
import path from 'node:path';

describe('createExecutionContext', () => {
  it('creates context with defaults', () => {
    const ctx = createExecutionContext({});
    expect(ctx.dryRun).toBe(false);
    expect(ctx.json).toBe(false);
    expect(ctx.verbose).toBe(false);
    expect(ctx.tsconfig).toBe('tsconfig.json');
  });

  it('respects verbose flag', () => {
    const ctx = createExecutionContext({ verbose: true });
    expect(ctx.verbose).toBe(true);
  });

  it('respects dryRun flag', () => {
    const ctx = createExecutionContext({ dryRun: true });
    expect(ctx.dryRun).toBe(true);
  });

  it('respects custom tsconfig', () => {
    const ctx = createExecutionContext({ tsconfig: 'tsconfig.build.json' });
    expect(ctx.tsconfig).toBe('tsconfig.build.json');
  });

  it('includes config in context', () => {
    const ctx = createExecutionContext({});
    expect(ctx.config).toBeDefined();
    expect(ctx.config.tsconfig).toBe('tsconfig.json');
  });
});

describe('loadConfig', () => {
  it('returns default config when no config file exists', () => {
    const config = loadConfig('/tmp/nonexistent-dir-xyz');
    expect(config.tsconfig).toBe('tsconfig.json');
    expect(config.exclude).toEqual([]);
  });

  it('returns default config for cwd', () => {
    const config = loadConfig(process.cwd());
    expect(config.tsconfig).toBeDefined();
  });
});

describe('validateFilePaths', () => {
  it('returns null for existing files', () => {
    const result = validateFilePaths([path.resolve('package.json')]);
    expect(result).toBeNull();
  });

  it('returns error for nonexistent files', () => {
    const result = validateFilePaths(['/tmp/this-file-does-not-exist-xyz.ts']);
    expect(result).toContain('File not found');
  });

  it('returns null for empty array', () => {
    const result = validateFilePaths([]);
    expect(result).toBeNull();
  });
});

describe('handleResult hints', () => {
  it('shows hint for source file not found', () => {
    const ctx = createExecutionContext({});
    const cs = createChangeSet('Precondition failed: source file not found', []);
    const chunks: string[] = [];
    const origWrite = process.stderr.write;
    process.stderr.write = ((chunk: any) => { chunks.push(String(chunk)); return true; }) as any;
    try {
      handleResult(ctx, cs);
    } finally {
      process.stderr.write = origWrite;
    }
    const output = chunks.join('');
    expect(output).toContain('Hint');
    expect(output).toContain('--path');
  });

  it('shows hint for symbol not found', () => {
    const ctx = createExecutionContext({});
    const cs = createChangeSet("Precondition failed: symbol 'Foo' not found in bar.ts", []);
    const chunks: string[] = [];
    const origWrite = process.stderr.write;
    process.stderr.write = ((chunk: any) => { chunks.push(String(chunk)); return true; }) as any;
    try {
      handleResult(ctx, cs);
    } finally {
      process.stderr.write = origWrite;
    }
    const output = chunks.join('');
    expect(output).toContain('sref discover find Foo');
  });

  it('shows hint for no node at position', () => {
    const ctx = createExecutionContext({});
    const cs = createChangeSet('Precondition failed: no node at position', []);
    const chunks: string[] = [];
    const origWrite = process.stderr.write;
    process.stderr.write = ((chunk: any) => { chunks.push(String(chunk)); return true; }) as any;
    try {
      handleResult(ctx, cs);
    } finally {
      process.stderr.write = origWrite;
    }
    const output = chunks.join('');
    expect(output).toContain('Hint');
  });
});
