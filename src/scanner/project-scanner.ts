/**
 * Unified project scanner: discover files → check cache → dispatch to workers → merge results.
 * Single entry point for all analysis that needs file-level data.
 */
import fs from 'node:fs';
import type { Logger } from '../core/logger.js';
import type { ScanResult } from './types.js';
import { discoverFiles } from '../indexing/file-index.js';
import { extractAll } from './extractors.js';
import { scanWithPool, scanSequential } from './pool.js';
import { loadCache, saveCache, type ScanCache } from './cache.js';

export interface ScanOptions {
  rootDir: string;
  useWorkers?: boolean;   // default true
  useCache?: boolean;     // default true
  cacheDir?: string;      // default .sref/cache
}

export interface ProjectScanResult {
  results: ScanResult[];
  errors: { filePath: string; error: string }[];
  stats: {
    totalFiles: number;
    cachedFiles: number;
    scannedFiles: number;
    errorCount: number;
    durationMs: number;
  };
}

export async function scanProject(options: ScanOptions, logger: Logger): Promise<ProjectScanResult> {
  const { rootDir, useWorkers = true, useCache = true } = options;
  const cacheDir = options.cacheDir ?? `${rootDir}/.sref/cache`;

  logger.info('scanner', 'starting project scan', { rootDir, useWorkers, useCache });
  const startMs = performance.now();

  // 1. Discover files
  const filePaths = discoverFiles(rootDir, logger);

  // 2. Load cache
  let cache: ScanCache | undefined;
  if (useCache) {
    cache = loadCache(cacheDir, logger);
  }

  // 3. Partition files into cached (hit) and needs-scan (miss)
  const cached: ScanResult[] = [];
  const needsScan: { path: string; contentHash: string }[] = [];
  const mtimeMap = new Map<string, number>();

  for (const filePath of filePaths) {
    const stat = fs.statSync(filePath);
    const mtimeMs = stat.mtimeMs;
    mtimeMap.set(filePath, mtimeMs);

    if (cache) {
      const entry = cache.entries.get(filePath);
      if (entry && entry.mtimeMs === mtimeMs) {
        // mtime match — cache hit without even reading the file
        cached.push(entry.scanResult);
        continue;
      }
    }

    // Cache miss — need to scan
    // Use empty hash for now; the extractor will compute it
    needsScan.push({ path: filePath, contentHash: '' });
  }

  logger.info('scanner', 'cache partition', {
    total: filePaths.length,
    cached: cached.length,
    needsScan: needsScan.length,
  });

  // 4. Scan missed files
  let scanResult: { results: ScanResult[]; errors: { filePath: string; error: string }[] };

  if (needsScan.length === 0) {
    scanResult = { results: [], errors: [] };
  } else if (useWorkers && needsScan.length >= 200) {
    scanResult = await scanWithPool(needsScan, logger);
  } else {
    scanResult = scanSequential(needsScan, logger);
  }

  // 5. Merge cached + fresh results
  const allResults = [...cached, ...scanResult.results];
  const allErrors = scanResult.errors;

  // 6. Save updated cache
  if (useCache) {
    const newCache: ScanCache = {
      version: 1,
      entries: new Map(),
    };

    for (const result of allResults) {
      const mtimeMs = mtimeMap.get(result.filePath) ?? 0;
      newCache.entries.set(result.filePath, { mtimeMs, scanResult: result });
    }

    saveCache(cacheDir, newCache, logger);
  }

  const durationMs = Math.round(performance.now() - startMs);

  logger.info('scanner', 'project scan complete', {
    totalFiles: filePaths.length,
    cachedFiles: cached.length,
    scannedFiles: scanResult.results.length,
    errorCount: allErrors.length,
    durationMs,
  });

  return {
    results: allResults,
    errors: allErrors,
    stats: {
      totalFiles: filePaths.length,
      cachedFiles: cached.length,
      scannedFiles: scanResult.results.length,
      errorCount: allErrors.length,
      durationMs,
    },
  };
}
