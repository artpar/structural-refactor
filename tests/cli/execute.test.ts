import { describe, it, expect } from 'vitest';
import { createExecutionContext } from '../../src/cli/execute.js';

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
});
