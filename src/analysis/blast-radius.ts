import type { ImportGraph } from '../indexing/import-graph.js';
import { importersOf, isReachableFrom } from '../indexing/import-graph.js';
import type { SymbolIndex } from '../indexing/symbol-index.js';
import { referencesOf } from '../indexing/symbol-index.js';
import type { Logger } from '../core/logger.js';

export interface BlastRadiusResult {
  affectedFiles: string[];
}

export type BlastRadiusInput =
  | RenameInput
  | ExtractInput
  | MoveFileInput;

interface RenameInput {
  operation: 'rename';
  symbolName: string;
  definitionFile: string;
  graph: ImportGraph;
  symbols: SymbolIndex;
  logger: Logger;
}

interface ExtractInput {
  operation: 'extract';
  targetFile: string;
  graph: ImportGraph;
  symbols: SymbolIndex;
  logger: Logger;
}

interface MoveFileInput {
  operation: 'move-file';
  targetFile: string;
  graph: ImportGraph;
  symbols: SymbolIndex;
  logger: Logger;
}

export function computeBlastRadius(input: BlastRadiusInput): BlastRadiusResult {
  const startMs = performance.now();
  let result: BlastRadiusResult;

  switch (input.operation) {
    case 'rename':
      result = computeRenameBlastRadius(input);
      break;
    case 'extract':
      result = { affectedFiles: [input.targetFile] };
      break;
    case 'move-file':
      result = computeMoveFileBlastRadius(input);
      break;
  }

  const durationMs = Math.round(performance.now() - startMs);
  input.logger.info('blast-radius', 'computed blast radius', {
    operation: input.operation,
    affectedCount: result.affectedFiles.length,
    affectedFiles: result.affectedFiles,
    durationMs,
  });

  return result;
}

function computeRenameBlastRadius(input: RenameInput): BlastRadiusResult {
  const { symbolName, definitionFile, graph, symbols, logger } = input;
  const affected = new Set<string>();
  affected.add(definitionFile);

  // Find all files that reference this symbol (from AST-built symbol index)
  const referencing = referencesOf(symbols, symbolName);

  logger.debug('blast-radius', 'symbol references found', {
    symbolName,
    referencingFileCount: referencing.length,
  });

  for (const file of referencing) {
    // Verify the file actually imports from the definition (directly or transitively)
    if (isReachableFrom(graph, definitionFile, file)) {
      affected.add(file);
    }
  }

  return { affectedFiles: [...affected] };
}

function computeMoveFileBlastRadius(input: MoveFileInput): BlastRadiusResult {
  const { targetFile, graph, logger } = input;
  const affected = new Set<string>();
  affected.add(targetFile);

  // All files that import from the target file need their import paths updated
  const importers = importersOf(graph, targetFile);

  logger.debug('blast-radius', 'importers of target file', {
    targetFile,
    importerCount: importers.length,
  });

  for (const importer of importers) {
    affected.add(importer);
  }

  return { affectedFiles: [...affected] };
}
