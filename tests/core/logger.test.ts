import { describe, it, expect, beforeEach } from 'vitest';
import {
  type LogEntry,
  type LogLevel,
  type Logger,
  createLogger,
  setLogLevel,
} from '../../src/core/logger.js';

describe('Logger', () => {
  let entries: LogEntry[];
  let logger: Logger;

  beforeEach(() => {
    entries = [];
    logger = createLogger({
      level: 'trace',
      sink: (entry) => entries.push(entry),
    });
  });

  describe('log levels', () => {
    it('logs at trace level', () => {
      logger.trace('indexing', 'parsing file', { path: '/src/foo.ts' });
      expect(entries).toHaveLength(1);
      expect(entries[0].level).toBe('trace');
      expect(entries[0].scope).toBe('indexing');
      expect(entries[0].message).toBe('parsing file');
      expect(entries[0].data).toEqual({ path: '/src/foo.ts' });
    });

    it('logs at debug level', () => {
      logger.debug('import-graph', 'built graph', { fileCount: 100 });
      expect(entries[0].level).toBe('debug');
      expect(entries[0].data).toEqual({ fileCount: 100 });
    });

    it('logs at info level', () => {
      logger.info('cli', 'rename command invoked', { from: 'foo', to: 'bar' });
      expect(entries[0].level).toBe('info');
    });

    it('logs at warn level', () => {
      logger.warn('cache', 'stale cache entry', { path: '/src/old.ts' });
      expect(entries[0].level).toBe('warn');
    });

    it('logs at error level', () => {
      logger.error('parser', 'parse failed', { path: '/src/bad.ts', error: 'syntax error' });
      expect(entries[0].level).toBe('error');
    });
  });

  describe('level filtering', () => {
    it('filters out levels below threshold', () => {
      const filtered = createLogger({
        level: 'info',
        sink: (entry) => entries.push(entry),
      });
      filtered.trace('x', 'should not appear', {});
      filtered.debug('x', 'should not appear', {});
      filtered.info('x', 'should appear', {});
      filtered.warn('x', 'should appear', {});
      filtered.error('x', 'should appear', {});
      expect(entries).toHaveLength(3);
    });

    it('error level only shows errors', () => {
      const errorOnly = createLogger({
        level: 'error',
        sink: (entry) => entries.push(entry),
      });
      errorOnly.trace('x', 'no', {});
      errorOnly.debug('x', 'no', {});
      errorOnly.info('x', 'no', {});
      errorOnly.warn('x', 'no', {});
      errorOnly.error('x', 'yes', {});
      expect(entries).toHaveLength(1);
    });
  });

  describe('setLogLevel', () => {
    it('changes the level dynamically', () => {
      const mutableLogger = createLogger({
        level: 'error',
        sink: (entry) => entries.push(entry),
      });
      mutableLogger.info('x', 'hidden', {});
      expect(entries).toHaveLength(0);

      setLogLevel(mutableLogger, 'info');
      mutableLogger.info('x', 'visible', {});
      expect(entries).toHaveLength(1);
    });
  });

  describe('log entry structure', () => {
    it('includes timestamp', () => {
      logger.info('test', 'msg', {});
      expect(entries[0].timestamp).toBeDefined();
      expect(typeof entries[0].timestamp).toBe('string');
    });

    it('includes all required fields', () => {
      logger.info('scope', 'message', { key: 'value' });
      const entry = entries[0];
      expect(entry).toHaveProperty('timestamp');
      expect(entry).toHaveProperty('level');
      expect(entry).toHaveProperty('scope');
      expect(entry).toHaveProperty('message');
      expect(entry).toHaveProperty('data');
    });
  });
});
