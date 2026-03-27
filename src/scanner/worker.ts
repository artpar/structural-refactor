/**
 * Worker thread: receives file paths, reads + parses (oxc) + extracts, returns ScanResults.
 * Runs in a worker_threads context. Communicates via parentPort messages.
 */
import { parentPort } from 'node:worker_threads';
import fs from 'node:fs';
import { extractAll } from './extractors.js';

export interface WorkerRequest {
  type: 'scan';
  files: { path: string; contentHash: string }[];
}

export interface WorkerResponse {
  type: 'results';
  results: import('./types.js').ScanResult[];
  errors: { filePath: string; error: string }[];
}

if (parentPort) {
  parentPort.on('message', (msg: WorkerRequest) => {
    if (msg.type === 'scan') {
      const results: import('./types.js').ScanResult[] = [];
      const errors: { filePath: string; error: string }[] = [];

      for (const file of msg.files) {
        try {
          const sourceText = fs.readFileSync(file.path, 'utf-8');
          const result = extractAll(file.path, sourceText, file.contentHash);
          results.push(result);
        } catch (e) {
          errors.push({ filePath: file.path, error: String(e) });
        }
      }

      const response: WorkerResponse = { type: 'results', results, errors };
      parentPort!.postMessage(response);
    }
  });
}
