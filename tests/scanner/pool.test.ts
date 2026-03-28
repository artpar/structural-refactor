import { describe, it, expect } from 'vitest';
import path from 'node:path';
import fg from 'fast-glob';
import { scanSequential, scanWithPool } from '../../src/scanner/pool.js';
import { makeLogger } from '../helpers/index.js';

const FIXTURES = path.resolve(import.meta.dirname, '../fixtures/simple-project');

function fixtureFiles(): { path: string; contentHash: string }[] {
  const paths = fg.sync('**/*.ts', { cwd: FIXTURES, absolute: true });
  return paths.map((p) => ({ path: p, contentHash: '' }));
}

describe('scanSequential', () => {
  it('returns scan results for real fixture files', () => {
    const { logger } = makeLogger();
    const files = fixtureFiles();
    const result = scanSequential(files, logger);

    expect(result.results.length).toBe(files.length);
    expect(result.errors).toHaveLength(0);

    for (const r of result.results) {
      expect(r.filePath).toBeTruthy();
      expect(r.exports).toBeDefined();
      expect(r.imports).toBeDefined();
      expect(r.codeUnits).toBeDefined();
    }
  });

  it('collects errors for nonexistent files without crashing', () => {
    const { logger } = makeLogger();
    const files = [
      { path: '/nonexistent/file.ts', contentHash: '' },
      ...fixtureFiles().slice(0, 1),
    ];
    const result = scanSequential(files, logger);

    expect(result.errors.length).toBe(1);
    expect(result.errors[0].filePath).toBe('/nonexistent/file.ts');
    // The valid file still produced a result
    expect(result.results.length).toBe(1);
  });

  it('returns empty for empty file list', () => {
    const { logger } = makeLogger();
    const result = scanSequential([], logger);

    expect(result.results).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });
});

describe('scanWithPool', () => {
  it('returns empty for empty file list', async () => {
    const { logger } = makeLogger();
    const result = await scanWithPool([], logger);

    expect(result.results).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it('scans real fixture files (sequential path for small batches)', async () => {
    const { logger } = makeLogger();
    const files = fixtureFiles();
    const result = await scanWithPool(files, logger);

    expect(result.results.length).toBe(files.length);
    expect(result.errors).toHaveLength(0);

    for (const r of result.results) {
      expect(r.filePath).toBeTruthy();
      expect(r.codeUnits).toBeDefined();
    }
  });
});
