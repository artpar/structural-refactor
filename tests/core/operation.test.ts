import { describe, it, expect } from 'vitest';
import {
  type OperationArgs,
  type ValidationResult,
  type OperationDescriptor,
  createRegistry,
  validationOk,
  validationError,
  parseTargetLocation,
  type TargetLocation,
} from '../../src/core/operation.js';

describe('OperationRegistry', () => {
  it('registers and retrieves an operation', () => {
    const registry = createRegistry();
    const op: OperationDescriptor = {
      name: 'symbol',
      category: 'rename',
    };
    registry.register(op);
    expect(registry.get('rename', 'symbol')).toBe(op);
  });

  it('returns undefined for unregistered operation', () => {
    const registry = createRegistry();
    expect(registry.get('rename', 'nonexistent')).toBeUndefined();
  });

  it('lists all registered operations', () => {
    const registry = createRegistry();
    registry.register({ name: 'symbol', category: 'rename' });
    registry.register({ name: 'file', category: 'rename' });
    registry.register({ name: 'function', category: 'extract' });
    const all = registry.list();
    expect(all).toHaveLength(3);
  });

  it('lists operations by category', () => {
    const registry = createRegistry();
    registry.register({ name: 'symbol', category: 'rename' });
    registry.register({ name: 'file', category: 'rename' });
    registry.register({ name: 'function', category: 'extract' });
    expect(registry.listByCategory('rename')).toHaveLength(2);
    expect(registry.listByCategory('extract')).toHaveLength(1);
    expect(registry.listByCategory('inline')).toHaveLength(0);
  });
});

describe('ValidationResult', () => {
  it('creates ok result', () => {
    const result = validationOk();
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('creates error result with messages', () => {
    const result = validationError(['Symbol not found', 'File not readable']);
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(['Symbol not found', 'File not readable']);
  });
});

describe('parseTargetLocation', () => {
  it('parses file:line:col format', () => {
    const loc = parseTargetLocation('/src/foo.ts:10:5');
    expect(loc).toEqual({ file: '/src/foo.ts', line: 10, col: 5 });
  });

  it('parses file-only format', () => {
    const loc = parseTargetLocation('/src/foo.ts');
    expect(loc).toEqual({ file: '/src/foo.ts', line: undefined, col: undefined });
  });

  it('parses file:line format (no col)', () => {
    const loc = parseTargetLocation('/src/foo.ts:10');
    expect(loc).toEqual({ file: '/src/foo.ts', line: 10, col: undefined });
  });

  it('handles Windows-style paths', () => {
    const loc = parseTargetLocation('C:\\src\\foo.ts:10:5');
    expect(loc).toEqual({ file: 'C:\\src\\foo.ts', line: 10, col: 5 });
  });
});
