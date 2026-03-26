import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { discoverFiles } from '../../src/indexing/file-index.js';
import { createLogger, type LogEntry } from '../../src/core/logger.js';

const FIXTURES = path.resolve(import.meta.dirname, '../fixtures/simple-project');

describe('discoverFiles', () => {
  function makeLogger() {
    const entries: LogEntry[] = [];
    const logger = createLogger({ level: 'trace', sink: (e) => entries.push(e) });
    return { logger, entries };
  }

  it('discovers .ts files in fixture project', () => {
    const { logger } = makeLogger();
    const files = discoverFiles(FIXTURES, logger);
    expect(files.length).toBeGreaterThanOrEqual(4);
    expect(files.every((f) => f.endsWith('.ts'))).toBe(true);
  });

  it('returns absolute paths', () => {
    const { logger } = makeLogger();
    const files = discoverFiles(FIXTURES, logger);
    expect(files.every((f) => path.isAbsolute(f))).toBe(true);
  });

  it('finds all expected fixture files', () => {
    const { logger } = makeLogger();
    const files = discoverFiles(FIXTURES, logger);
    const basenames = files.map((f) => path.basename(f));
    expect(basenames).toContain('math.ts');
    expect(basenames).toContain('utils.ts');
    expect(basenames).toContain('index.ts');
    expect(basenames).toContain('app.ts');
  });

  it('respects custom extensions', () => {
    const { logger } = makeLogger();
    const files = discoverFiles(FIXTURES, logger, { extensions: ['.tsx'] });
    expect(files).toEqual([]);
  });

  it('logs discovery stats', () => {
    const { logger, entries } = makeLogger();
    discoverFiles(FIXTURES, logger);
    const infoLogs = entries.filter((e) => e.level === 'info' && e.scope === 'file-index');
    expect(infoLogs.length).toBeGreaterThanOrEqual(1);
    expect(infoLogs[0].data).toHaveProperty('fileCount');
  });
});
