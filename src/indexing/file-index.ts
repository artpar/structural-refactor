import fg from 'fast-glob';
import path from 'node:path';
import type { Logger } from '../core/logger.js';

export interface DiscoverOptions {
  extensions?: string[];
  exclude?: string[];
}

const DEFAULT_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
const DEFAULT_EXCLUDE = ['**/node_modules/**', '**/dist/**', '**/.git/**'];

export function discoverFiles(
  rootDir: string,
  logger: Logger,
  options: DiscoverOptions = {},
): string[] {
  const extensions = options.extensions ?? DEFAULT_EXTENSIONS;
  const exclude = options.exclude ?? DEFAULT_EXCLUDE;

  const pattern = extensions.length === 1
    ? `**/*${extensions[0]}`
    : `**/*{${extensions.join(',')}}`;

  logger.debug('file-index', 'starting discovery', { rootDir, pattern, exclude });

  const startMs = performance.now();
  const files = fg.sync(pattern, {
    cwd: rootDir,
    absolute: true,
    ignore: exclude,
    dot: false,
  });
  const durationMs = Math.round(performance.now() - startMs);

  logger.info('file-index', 'discovery complete', {
    rootDir,
    fileCount: files.length,
    durationMs,
  });

  return files;
}
