import { describe, it, expect } from 'vitest';
import { consoleSink, type LogEntry } from '../../src/core/logger.js';

describe('consoleSink', () => {
  it('writes JSON to stderr', () => {
    const chunks: string[] = [];
    const origWrite = process.stderr.write;
    process.stderr.write = ((chunk: any) => { chunks.push(String(chunk)); return true; }) as any;

    try {
      const entry: LogEntry = {
        timestamp: '2026-01-01T00:00:00Z',
        level: 'info',
        scope: 'test',
        message: 'hello',
        data: { key: 'value' },
      };
      consoleSink(entry);

      const output = chunks.join('');
      const parsed = JSON.parse(output.trim());
      expect(parsed.scope).toBe('test');
      expect(parsed.message).toBe('hello');
    } finally {
      process.stderr.write = origWrite;
    }
  });
});
