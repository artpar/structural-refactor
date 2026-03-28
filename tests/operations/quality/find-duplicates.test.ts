import { describe, it, expect } from 'vitest';
import { findDuplicates } from '../../../src/operations/quality/find-duplicates.js';
import { makeLogger, makeProject } from '../../helpers/index.js';

describe('findDuplicates', () => {
  it('finds two files with identical function bodies', () => {
    const project = makeProject({
      '/src/a.ts': 'export function greet(name: string) { return "Hello " + name; }\n',
      '/src/b.ts': 'export function greet(name: string) { return "Hello " + name; }\n',
    });
    const { logger } = makeLogger();

    const cs = findDuplicates(project, { logger });

    // Should report the duplicate — description should mention the files and function name
    expect(cs.description).toContain('greet');
    expect(cs.description).toContain('/src/a.ts');
    expect(cs.description).toContain('/src/b.ts');
  });

  it('does not report functions with different bodies', () => {
    const project = makeProject({
      '/src/a.ts': 'export function greet(name: string) { return "Hello " + name; }\n',
      '/src/b.ts': 'export function greet(name: string) { return "Hi " + name; }\n',
    });
    const { logger } = makeLogger();

    const cs = findDuplicates(project, { logger });

    // Different bodies — should not be flagged
    expect(cs.description).not.toContain('greet');
  });

  it('respects scope option', () => {
    const project = makeProject({
      '/src/a.ts': 'export function greet(name: string) { return "Hello " + name; }\n',
      '/src/b.ts': 'export function greet(name: string) { return "Hello " + name; }\n',
      '/lib/c.ts': 'export function greet(name: string) { return "Hello " + name; }\n',
    });
    const { logger } = makeLogger();

    const cs = findDuplicates(project, { scope: '/src', logger });

    // Should only report duplicates within /src
    expect(cs.description).toContain('/src/a.ts');
    expect(cs.description).toContain('/src/b.ts');
    expect(cs.description).not.toContain('/lib/c.ts');
  });

  it('reports function names and file paths in output', () => {
    const project = makeProject({
      '/src/utils1.ts': 'export function add(a: number, b: number) { return a + b; }\n',
      '/src/utils2.ts': 'export function add(a: number, b: number) { return a + b; }\n',
    });
    const { logger } = makeLogger();

    const cs = findDuplicates(project, { logger });

    expect(cs.description).toContain('add');
    expect(cs.description).toContain('/src/utils1.ts');
    expect(cs.description).toContain('/src/utils2.ts');
  });
});
