/**
 * Worker pool for parallel oxc parsing.
 * Creates N worker threads (cpus - 1), dispatches file batches, collects results.
 */
import { Worker } from 'node:worker_threads';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fsModule from 'node:fs';
import type { ScanResult } from './types.js';
import type { WorkerRequest, WorkerResponse } from './worker.js';
import { extractAll } from './extractors.js';
import type { Logger } from '../core/logger.js';

const BATCH_SIZE = 200;

export interface PoolResult {
  results: ScanResult[];
  errors: { filePath: string; error: string }[];
}

export async function scanWithPool(
  files: { path: string; contentHash: string }[],
  logger: Logger,
): Promise<PoolResult> {
  const workerCount = Math.max(cpus().length - 1, 1);
  logger.info('pool', 'starting worker pool', { workerCount, fileCount: files.length });

  if (files.length === 0) {
    return { results: [], errors: [] };
  }

  // For small file counts, don't bother with workers
  if (files.length < BATCH_SIZE) {
    return scanSequential(files, logger);
  }

  const startMs = performance.now();

  // Split files into batches
  const batches: { path: string; contentHash: string }[][] = [];
  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    batches.push(files.slice(i, i + BATCH_SIZE));
  }

  // Distribute batches across workers round-robin
  const workerBatches: { path: string; contentHash: string }[][][] = Array.from({ length: workerCount }, () => []);
  for (let i = 0; i < batches.length; i++) {
    workerBatches[i % workerCount].push(batches[i]);
  }

  // Resolve worker script path
  const workerPath = resolveWorkerPath();

  const allResults: ScanResult[] = [];
  const allErrors: { filePath: string; error: string }[] = [];

  // Launch workers
  const workerPromises = workerBatches
    .filter((wb) => wb.length > 0)
    .map((wb) => runWorker(workerPath, wb, logger));

  const workerResults = await Promise.allSettled(workerPromises);

  for (const wr of workerResults) {
    if (wr.status === 'fulfilled') {
      allResults.push(...wr.value.results);
      allErrors.push(...wr.value.errors);
    } else {
      logger.error('pool', 'worker failed', { error: String(wr.reason) });
    }
  }

  const durationMs = Math.round(performance.now() - startMs);
  logger.info('pool', 'worker pool complete', {
    fileCount: files.length,
    resultCount: allResults.length,
    errorCount: allErrors.length,
    workerCount,
    durationMs,
  });

  return { results: allResults, errors: allErrors };
}

/** Sequential fallback for small file counts or when workers aren't available */
export function scanSequential(
  files: { path: string; contentHash: string }[],
  logger: Logger,
): PoolResult {
  const results: ScanResult[] = [];
  const errors: { filePath: string; error: string }[] = [];

  for (const file of files) {
    try {
      const sourceText = fsModule.readFileSync(file.path, 'utf-8');
      results.push(extractAll(file.path, sourceText, file.contentHash));
    } catch (e) {
      errors.push({ filePath: file.path, error: String(e) });
    }
  }

  return { results, errors };
}

function runWorker(
  workerPath: string,
  batches: { path: string; contentHash: string }[][],
  logger: Logger,
): Promise<PoolResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerPath);
    const results: ScanResult[] = [];
    const errors: { filePath: string; error: string }[] = [];
    let batchIndex = 0;

    worker.on('message', (msg: WorkerResponse) => {
      results.push(...msg.results);
      errors.push(...msg.errors);

      batchIndex++;
      if (batchIndex < batches.length) {
        const request: WorkerRequest = { type: 'scan', files: batches[batchIndex] };
        worker.postMessage(request);
      } else {
        worker.terminate();
        resolve({ results, errors });
      }
    });

    worker.on('error', (err) => {
      logger.error('pool', 'worker error', { error: String(err) });
      reject(err);
    });

    worker.on('exit', (code) => {
      if (code !== 0 && batchIndex < batches.length) {
        reject(new Error(`Worker exited with code ${code}`));
      }
    });

    // Send first batch
    if (batches.length > 0) {
      const request: WorkerRequest = { type: 'scan', files: batches[0] };
      worker.postMessage(request);
    } else {
      worker.terminate();
      resolve({ results, errors });
    }
  });
}

function resolveWorkerPath(): string {
  // In ESM, __filename isn't available, use import.meta.url
  const thisFile = fileURLToPath(import.meta.url);
  const thisDir = path.dirname(thisFile);
  return path.join(thisDir, 'worker.js');
}
