/**
 * Persistent file summary index with mtime-based invalidation.
 * Inspired by Salsa's demand-driven incremental computation.
 *
 * Startup: load index → diff mtimes → re-index only changed files → save.
 * Warm startup for 300k files with 10 changed: ~200ms.
 */
import fs from 'node:fs';
import path from 'node:path';
import { encode, decode } from '@msgpack/msgpack';
import type { Logger } from '../core/logger.js';
import type { FileSummary } from './file-summary.js';
import { extractFileSummary } from './file-summary.js';
import { discoverFiles } from '../indexing/file-index.js';

export interface ProjectIndex {
  summaries: Map<string, FileSummary>;
  /** O(1) lookup: name → file paths that define/export it */
  nameToFiles: Map<string, string[]>;
}

const INDEX_FILE = 'file-index.msgpack';
const INDEX_VERSION = 2;

/**
 * Build or update the project index. Incremental: only re-indexes changed files.
 */
export function buildProjectIndex(rootDir: string, logger: Logger, cacheDir?: string): ProjectIndex {
  const effectiveCacheDir = cacheDir ?? path.join(rootDir, '.sref', 'cache');
  const startMs = performance.now();

  // 1. Load cached index
  const cached = loadIndex(effectiveCacheDir, logger);

  // 2. Discover current files
  const filePaths = discoverFiles(rootDir, logger);

  // 3. Diff against cache — only re-index changed files
  const summaries = new Map<string, FileSummary>();
  let cachedCount = 0;
  let reindexedCount = 0;

  for (const filePath of filePaths) {
    let mtimeMs: number;
    try {
      mtimeMs = fs.statSync(filePath).mtimeMs;
    } catch {
      continue;
    }

    const cachedSummary = cached?.get(filePath);
    if (cachedSummary && cachedSummary.mtimeMs === mtimeMs) {
      summaries.set(filePath, cachedSummary);
      cachedCount++;
    } else {
      try {
        const sourceText = fs.readFileSync(filePath, 'utf-8');
        const summary = extractFileSummary(filePath, sourceText);
        summary.mtimeMs = mtimeMs;
        summaries.set(filePath, summary);
        reindexedCount++;
      } catch {
        // Parse failure — skip file
        reindexedCount++;
      }
    }
  }

  // 4. Build name→files lookup
  const nameToFiles = new Map<string, string[]>();
  for (const [filePath, summary] of summaries) {
    for (const name of summary.topLevelNames) {
      const list = nameToFiles.get(name);
      if (list) list.push(filePath);
      else nameToFiles.set(name, [filePath]);
    }
    for (const name of summary.exports) {
      if (name === 'default') continue;
      const list = nameToFiles.get(name);
      if (list) { if (!list.includes(filePath)) list.push(filePath); }
      else nameToFiles.set(name, [filePath]);
    }
  }

  // 5. Save index
  saveIndex(effectiveCacheDir, summaries, logger);

  const durationMs = Math.round(performance.now() - startMs);
  logger.info('index-store', 'project index built', {
    totalFiles: summaries.size,
    cached: cachedCount,
    reindexed: reindexedCount,
    names: nameToFiles.size,
    durationMs,
  });

  return { summaries, nameToFiles };
}

function loadIndex(cacheDir: string, logger: Logger): Map<string, FileSummary> | undefined {
  const indexPath = path.join(cacheDir, INDEX_FILE);
  if (!fs.existsSync(indexPath)) return undefined;

  try {
    const data = fs.readFileSync(indexPath);
    const raw = decode(data) as any;
    if (raw.version !== INDEX_VERSION) return undefined;

    const result = new Map<string, FileSummary>();
    if (Array.isArray(raw.entries)) {
      for (const [key, value] of raw.entries) {
        result.set(key, value as FileSummary);
      }
    }

    logger.debug('index-store', 'loaded cached index', { entryCount: result.size });
    return result;
  } catch {
    return undefined;
  }
}

function saveIndex(cacheDir: string, summaries: Map<string, FileSummary>, logger: Logger): void {
  try {
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

    const data = encode({
      version: INDEX_VERSION,
      entries: [...summaries.entries()],
    });

    fs.writeFileSync(path.join(cacheDir, INDEX_FILE), data);
    logger.debug('index-store', 'saved index', { size: Math.round(data.byteLength / 1024) + 'KB' });
  } catch (e) {
    logger.warn('index-store', 'failed to save index', { error: String(e) });
  }
}
