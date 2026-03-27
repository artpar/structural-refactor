import { Project, Node } from 'ts-morph';
import type { ChangeSet, FileChange } from '../../core/change-set.js';
import { createChangeSet } from '../../core/change-set.js';
import type { Logger } from '../../core/logger.js';

export interface RenameSymbolArgs {
  filePath: string;
  line: number;
  col: number;
  newName: string;
  logger: Logger;
}

export function renameSymbol(project: Project, args: RenameSymbolArgs): ChangeSet {
  const { filePath, line, col, newName, logger } = args;

  const sourceFile = project.getSourceFile(filePath);
  if (!sourceFile) {
    logger.warn('rename-symbol', 'source file not found', { filePath });
    return createChangeSet('Rename (no changes)', []);
  }

  // Capture original content of all source files before mutation
  const originalContents = new Map<string, string>();
  for (const sf of project.getSourceFiles()) {
    originalContents.set(sf.getFilePath(), sf.getFullText());
  }

  // Find the identifier at the given position using AST
  let pos: number;
  try {
    pos = sourceFile.compilerNode.getPositionOfLineAndCharacter(line - 1, col - 1);
  } catch {
    logger.warn('rename-symbol', 'position out of range', { filePath, line, col,
      maxLine: sourceFile.getEndLineNumber() });
    return createChangeSet(`Rename failed: line ${line} col ${col} is out of range in ${filePath}`, []);
  }
  const node = sourceFile.getDescendantAtPos(pos);

  if (!node || !Node.isIdentifier(node)) {
    logger.warn('rename-symbol', 'no identifier at position', { filePath, line, col });
    return createChangeSet('Rename (no symbol found)', []);
  }

  const oldName = node.getText();
  logger.info('rename-symbol', 'renaming symbol', {
    oldName,
    newName,
    filePath,
    line,
    col,
  });

  // Use ts-morph's built-in rename which handles all references across files
  const startMs = performance.now();
  node.rename(newName);
  const durationMs = Math.round(performance.now() - startMs);

  // Collect changes by comparing before/after
  const files: FileChange[] = [];
  for (const sf of project.getSourceFiles()) {
    const sfPath = sf.getFilePath();
    const original = originalContents.get(sfPath);
    const modified = sf.getFullText();

    if (original !== undefined && original !== modified) {
      files.push({ path: sfPath, original, modified });
    }
  }

  logger.info('rename-symbol', 'rename complete', {
    oldName,
    newName,
    filesChanged: files.length,
    durationMs,
  });

  return createChangeSet(`Rename '${oldName}' to '${newName}'`, files);
}
