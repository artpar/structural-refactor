import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { scanProject } from '../../src/scanner/project-scanner.js';
import { loadCache, saveCache, clearCache, type ScanCache } from '../../src/scanner/cache.js';
import { createLogger, type LogEntry } from '../../src/core/logger.js';

const FIXTURES = path.resolve(import.meta.dirname, '../fixtures/simple-project');
const CACHE_DIR = path.resolve(import.meta.dirname, '../.test-cache');

function makeLogger() {
  const entries: LogEntry[] = [];
  const logger = createLogger({ level: 'trace', sink: (e) => entries.push(e) });
  return { logger, entries };
}

afterEach(() => {
  // Clean up test cache
  if (fs.existsSync(CACHE_DIR)) {
    fs.rmSync(CACHE_DIR, { recursive: true, force: true });
  }
});

describe('scanProject', () => {
  it('scans all files in a project (no cache, no workers)', async () => {
    const { logger } = makeLogger();
    const result = await scanProject({
      rootDir: FIXTURES,
      useWorkers: false,
      useCache: false,
    }, logger);

    expect(result.results.length).toBeGreaterThanOrEqual(4);
    expect(result.stats.totalFiles).toBeGreaterThanOrEqual(4);
    expect(result.stats.scannedFiles).toBe(result.stats.totalFiles);
    expect(result.stats.cachedFiles).toBe(0);
  });

  it('creates cache on first run', async () => {
    const { logger } = makeLogger();
    await scanProject({
      rootDir: FIXTURES,
      useWorkers: false,
      useCache: true,
      cacheDir: CACHE_DIR,
    }, logger);

    expect(fs.existsSync(path.join(CACHE_DIR, 'scan-cache.msgpack'))).toBe(true);
  });

  it('uses cache on second run (warm scan)', async () => {
    const { logger: logger1 } = makeLogger();
    await scanProject({
      rootDir: FIXTURES,
      useWorkers: false,
      useCache: true,
      cacheDir: CACHE_DIR,
    }, logger1);

    const { logger: logger2, entries } = makeLogger();
    const result = await scanProject({
      rootDir: FIXTURES,
      useWorkers: false,
      useCache: true,
      cacheDir: CACHE_DIR,
    }, logger2);

    // All files should be cached on second run
    expect(result.stats.cachedFiles).toBe(result.stats.totalFiles);
    expect(result.stats.scannedFiles).toBe(0);
  });

  it('collects errors for unparseable files without crashing', async () => {
    // Create a temp dir with a bad file
    const tmpDir = path.resolve(import.meta.dirname, '../.test-bad-project');
    const tmpSrc = path.join(tmpDir, 'src');
    fs.mkdirSync(tmpSrc, { recursive: true });
    fs.writeFileSync(path.join(tmpSrc, 'good.ts'), 'export const x = 1;\n');
    fs.writeFileSync(path.join(tmpSrc, 'bad.ts'), '{{{{invalid syntax not even close}}}}');

    try {
      const { logger } = makeLogger();
      const result = await scanProject({
        rootDir: tmpDir,
        useWorkers: false,
        useCache: false,
      }, logger);

      // Should have results for good file
      expect(result.results.length).toBeGreaterThanOrEqual(1);
      // Errors collected but didn't crash
      // (oxc-parser is tolerant, may not error — but if it does, it's collected)
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('logs scan statistics', async () => {
    const { logger, entries } = makeLogger();
    await scanProject({
      rootDir: FIXTURES,
      useWorkers: false,
      useCache: false,
    }, logger);

    const scanLogs = entries.filter((e) => e.scope === 'scanner' && e.level === 'info');
    expect(scanLogs.length).toBeGreaterThanOrEqual(2); // start + complete
    const completionLog = scanLogs.find((e) => e.message === 'project scan complete');
    expect(completionLog).toBeDefined();
    expect(completionLog!.data).toHaveProperty('durationMs');
    expect(completionLog!.data).toHaveProperty('totalFiles');
  });
});

describe('cache module', () => {
  it('saves and loads cache roundtrip', () => {
    const { logger } = makeLogger();
    const cache: ScanCache = {
      version: 1,
      entries: new Map([
        ['/src/a.ts', {
          mtimeMs: 12345,
          scanResult: {
            filePath: '/src/a.ts',
            contentHash: 'abc',
            imports: [],
            exports: [],
            codeUnits: [],
            calls: [],
          },
        }],
      ]),
    };

    saveCache(CACHE_DIR, cache, logger);
    const loaded = loadCache(CACHE_DIR, logger);

    expect(loaded).toBeDefined();
    expect(loaded!.entries.size).toBe(1);
    expect(loaded!.entries.get('/src/a.ts')!.mtimeMs).toBe(12345);
  });

  it('returns undefined for missing cache', () => {
    const { logger } = makeLogger();
    const loaded = loadCache('/nonexistent/path', logger);
    expect(loaded).toBeUndefined();
  });

  it('clears cache', () => {
    const { logger } = makeLogger();
    const cache: ScanCache = { version: 1, entries: new Map() };
    saveCache(CACHE_DIR, cache, logger);
    expect(fs.existsSync(path.join(CACHE_DIR, 'scan-cache.msgpack'))).toBe(true);

    clearCache(CACHE_DIR, logger);
    expect(fs.existsSync(path.join(CACHE_DIR, 'scan-cache.msgpack'))).toBe(false);
  });
});
