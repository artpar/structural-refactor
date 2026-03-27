import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createExecutionContext, createProject, applyChangeSet, handleResult } from '../../src/cli/execute.js';
import { createChangeSet } from '../../src/core/change-set.js';
import { createLogger } from '../../src/core/logger.js';

describe('execute module', () => {
  describe('createExecutionContext', () => {
    it('creates context with defaults', () => {
      const ctx = createExecutionContext({});
      expect(ctx.dryRun).toBe(false);
      expect(ctx.json).toBe(false);
      expect(ctx.verbose).toBe(false);
    });

    it('respects all flags', () => {
      const ctx = createExecutionContext({ dryRun: true, json: true, verbose: true, tsconfig: 'custom.json' });
      expect(ctx.dryRun).toBe(true);
      expect(ctx.json).toBe(true);
      expect(ctx.verbose).toBe(true);
      expect(ctx.tsconfig).toBe('custom.json');
    });
  });

  describe('createProject', () => {
    it('creates a ts-morph project', () => {
      const ctx = createExecutionContext({});
      const project = createProject(ctx, []);
      expect(project).toBeDefined();
    });

    it('adds specific files when provided', () => {
      const ctx = createExecutionContext({});
      const testFile = path.resolve('tests/fixtures/simple-project/src/math.ts');
      const project = createProject(ctx, [testFile]);
      expect(project.getSourceFiles().length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('applyChangeSet', () => {
    it('writes modified files to disk', () => {
      const tmpFile = path.resolve('.sref-test-tmp.ts');
      const logger = createLogger({ level: 'error', sink: () => {} });

      try {
        fs.writeFileSync(tmpFile, 'const x = 1;\n');
        const cs = createChangeSet('test', [
          { path: tmpFile, original: 'const x = 1;\n', modified: 'const y = 1;\n' },
        ]);
        applyChangeSet(cs, logger);
        const content = fs.readFileSync(tmpFile, 'utf-8');
        expect(content).toBe('const y = 1;\n');
      } finally {
        if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
      }
    });
  });

  describe('handleResult', () => {
    it('handles empty changeset', () => {
      const ctx = createExecutionContext({});
      const cs = createChangeSet('noop', []);
      // Should not throw
      handleResult(ctx, cs);
    });

    it('outputs JSON when --json flag is set', () => {
      const ctx = createExecutionContext({ json: true, dryRun: true });
      const cs = createChangeSet('test', [
        { path: '/tmp/test.ts', original: 'a', modified: 'b' },
      ]);

      const chunks: string[] = [];
      const origWrite = process.stdout.write;
      process.stdout.write = ((chunk: any) => { chunks.push(String(chunk)); return true; }) as any;

      try {
        handleResult(ctx, cs);
        const output = chunks.join('');
        const parsed = JSON.parse(output);
        expect(parsed.description).toBe('test');
        expect(parsed.files).toHaveLength(1);
      } finally {
        process.stdout.write = origWrite;
      }
    });

    it('shows diff in dry-run mode', () => {
      const ctx = createExecutionContext({ dryRun: true });
      const cs = createChangeSet('test', [
        { path: '/tmp/test.ts', original: 'const x = 1;\n', modified: 'const y = 1;\n' },
      ]);

      const chunks: string[] = [];
      const origWrite = process.stdout.write;
      process.stdout.write = ((chunk: any) => { chunks.push(String(chunk)); return true; }) as any;

      try {
        handleResult(ctx, cs);
        const output = chunks.join('');
        expect(output.length).toBeGreaterThan(0);
      } finally {
        process.stdout.write = origWrite;
      }
    });

    it('applies changes and saves undo when not dry-run', () => {
      const tmpDir = path.resolve('.sref-test-undo');
      const tmpFile = path.join(tmpDir, 'test.ts');

      try {
        fs.mkdirSync(tmpDir, { recursive: true });
        fs.writeFileSync(tmpFile, 'const x = 1;\n');

        const ctx = createExecutionContext({});
        Object.assign(ctx, { cwd: tmpDir });

        const cs = createChangeSet('test apply', [
          { path: tmpFile, original: 'const x = 1;\n', modified: 'const y = 1;\n' },
        ]);

        const origWrite = process.stdout.write;
        process.stdout.write = (() => true) as any;
        try { handleResult(ctx, cs); } finally { process.stdout.write = origWrite; }

        expect(fs.readFileSync(tmpFile, 'utf-8')).toBe('const y = 1;\n');
        expect(fs.existsSync(path.join(tmpDir, '.sref', 'undo-stack.json'))).toBe(true);

        // Apply again to test existing undo stack
        fs.writeFileSync(tmpFile, 'const y = 1;\n');
        const cs2 = createChangeSet('test apply 2', [
          { path: tmpFile, original: 'const y = 1;\n', modified: 'const z = 1;\n' },
        ]);
        process.stdout.write = (() => true) as any;
        try { handleResult(ctx, cs2); } finally { process.stdout.write = origWrite; }

        expect(fs.readFileSync(tmpFile, 'utf-8')).toBe('const z = 1;\n');
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });
});
