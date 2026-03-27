/**
 * Persistent scan cache using msgpack serialization.
 * Keyed by file path + mtime for fast invalidation without hashing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { encode, decode } from '@msgpack/msgpack';
import type { ScanResult } from './types.js';
import type { Logger } from '../core/logger.js';

export interface CacheEntry {
  mtimeMs: number;
  scanResult: ScanResult;
}

export interface ScanCache {
  version: number;
  entries: Map<string, CacheEntry>;
}

const CACHE_FILE = 'scan-cache.msgpack';
const CACHE_VERSION = 1;

export function loadCache(cacheDir: string, logger: Logger): ScanCache | undefined {
  const cachePath = path.join(cacheDir, CACHE_FILE);

  if (!fs.existsSync(cachePath)) {
    logger.debug('cache', 'no cache file found', { cachePath });
    return undefined;
  }

  try {
    const startMs = performance.now();
    const data = fs.readFileSync(cachePath);
    const raw = decode(data) as any;

    if (raw.version !== CACHE_VERSION) {
      logger.info('cache', 'cache version mismatch, discarding', { found: raw.version, expected: CACHE_VERSION });
      return undefined;
    }

    // Reconstruct Map from serialized array of [key, value] pairs
    const entries = new Map<string, CacheEntry>();
    if (Array.isArray(raw.entries)) {
      for (const [key, value] of raw.entries) {
        entries.set(key, value as CacheEntry);
      }
    }

    const durationMs = Math.round(performance.now() - startMs);
    logger.info('cache', 'cache loaded', { entryCount: entries.size, durationMs });

    return { version: CACHE_VERSION, entries };
  } catch (e) {
    logger.warn('cache', 'failed to load cache, starting fresh', { error: String(e) });
    return undefined;
  }
}

export function saveCache(cacheDir: string, cache: ScanCache, logger: Logger): void {
  try {
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    const startMs = performance.now();

    // Convert Map to array for msgpack serialization
    const serializable = {
      version: cache.version,
      entries: [...cache.entries.entries()],
    };

    const data = encode(serializable);
    const cachePath = path.join(cacheDir, CACHE_FILE);
    fs.writeFileSync(cachePath, data);

    const durationMs = Math.round(performance.now() - startMs);
    const sizeKB = Math.round(data.byteLength / 1024);

    logger.info('cache', 'cache saved', { entryCount: cache.entries.size, sizeKB, durationMs });
  } catch (e) {
    logger.warn('cache', 'failed to save cache', { error: String(e) });
  }
}

export function clearCache(cacheDir: string, logger: Logger): void {
  const cachePath = path.join(cacheDir, CACHE_FILE);
  if (fs.existsSync(cachePath)) {
    fs.unlinkSync(cachePath);
    logger.info('cache', 'cache cleared', { cachePath });
  }
}
