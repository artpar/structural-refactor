/**
 * Deduplicate: find all copies of a symbol, keep the canonical one,
 * replace all others with imports. One command, one ChangeSet.
 *
 * Usage: sref deduplicate parseAst --canonical tests/helpers/index.ts --scope tests/
 */
import { Project, Node } from 'ts-morph';
import path from 'node:path';
import type { ChangeSet } from '../../core/change-set.js';
import type { Logger } from '../../core/logger.js';
import { executeRefactoring, preconditionOk, preconditionFail } from '../engine.js';

export interface DeduplicateArgs {
  symbolName: string;
  canonicalFile: string;
  scope?: string;       // directory to search (default: all project files)
  logger: Logger;
}

export function deduplicate(project: Project, args: DeduplicateArgs): ChangeSet {
  const { symbolName, canonicalFile, scope, logger } = args;

  const canonicalSf = project.getSourceFile(canonicalFile);
  if (!canonicalSf) {
    return executeRefactoring(project, `Deduplicate '${symbolName}'`,
      () => preconditionFail([`canonical file not found: ${canonicalFile}`]), () => {}, logger);
  }

  // Verify the canonical file exports the symbol
  const canonicalDecl =
    canonicalSf.getFunction(symbolName) ??
    canonicalSf.getClass(symbolName) ??
    canonicalSf.getInterface(symbolName) ??
    canonicalSf.getTypeAlias(symbolName) ??
    canonicalSf.getEnum(symbolName) ??
    canonicalSf.getVariableDeclaration(symbolName);

  if (!canonicalDecl) {
    return executeRefactoring(project, `Deduplicate '${symbolName}'`,
      () => preconditionFail([`'${symbolName}' not found in canonical file ${canonicalFile}`]), () => {}, logger);
  }

  // Get the canonical function's signature for compatibility checking
  const canonicalSig = getSignature(canonicalDecl);

  // Find all other files that have a local copy with COMPATIBLE signature
  const duplicateFiles: { sf: ReturnType<Project['getSourceFileOrThrow']>; decl: Node }[] = [];
  const skippedFiles: { filePath: string; reason: string }[] = [];

  for (const sf of project.getSourceFiles()) {
    if (sf.getFilePath() === canonicalSf.getFilePath()) continue;
    if (scope && !sf.getFilePath().includes(scope)) continue;

    const localDecl =
      sf.getFunction(symbolName) ??
      sf.getClass(symbolName) ??
      sf.getInterface(symbolName) ??
      sf.getTypeAlias(symbolName) ??
      sf.getEnum(symbolName) ??
      sf.getVariableDeclaration(symbolName);

    if (localDecl) {
      // Verify signature compatibility before including
      const localSig = getSignature(localDecl);
      if (canonicalSig && localSig && !signaturesCompatible(canonicalSig, localSig)) {
        skippedFiles.push({
          filePath: sf.getFilePath(),
          reason: `incompatible signature: canonical=${canonicalSig.text} vs local=${localSig.text}`,
        });
        continue;
      }
      duplicateFiles.push({ sf, decl: localDecl as Node });
    }
  }

  if (skippedFiles.length > 0) {
    logger.warn('deduplicate', 'skipped files with incompatible signatures', {
      symbolName, skipped: skippedFiles,
    });
  }

  logger.info('deduplicate', 'found duplicates', {
    symbolName,
    canonicalFile,
    duplicateCount: duplicateFiles.length,
    files: duplicateFiles.map((d) => d.sf.getFilePath()),
  });

  if (duplicateFiles.length === 0) {
    return executeRefactoring(project, `Deduplicate '${symbolName}'`,
      () => preconditionOk(['no duplicates found']), () => {}, logger);
  }

  return executeRefactoring(
    project,
    `Deduplicate '${symbolName}': ${duplicateFiles.length} copies → import from ${canonicalFile}`,
    () => preconditionOk(),
    () => {
      for (const { sf, decl } of duplicateFiles) {
        // Compute relative import path from this file to canonical
        const fromDir = path.dirname(sf.getFilePath());
        let relativePath = path.relative(fromDir, canonicalFile);
        // Remove extension, ensure starts with ./
        relativePath = relativePath.replace(/\.(ts|tsx|js|jsx)$/, '.js');
        if (!relativePath.startsWith('.')) relativePath = './' + relativePath;

        // Delete the local declaration
        if (Node.isFunctionDeclaration(decl)) decl.remove();
        else if (Node.isClassDeclaration(decl)) decl.remove();
        else if (Node.isInterfaceDeclaration(decl)) decl.remove();
        else if (Node.isTypeAliasDeclaration(decl)) decl.remove();
        else if (Node.isEnumDeclaration(decl)) decl.remove();
        else if (Node.isVariableDeclaration(decl)) {
          const stmt = decl.getVariableStatement();
          if (stmt && stmt.getDeclarations().length === 1) stmt.remove();
          else decl.remove();
        }

        // Add import from canonical
        const existingImport = sf.getImportDeclaration(relativePath);
        if (existingImport) {
          if (!existingImport.getNamedImports().some((n) => n.getName() === symbolName)) {
            existingImport.addNamedImport(symbolName);
          }
        } else {
          sf.addImportDeclaration({
            moduleSpecifier: relativePath,
            namedImports: [symbolName],
          });
        }
      }

      logger.info('deduplicate', 'deduplication complete', {
        symbolName,
        filesChanged: duplicateFiles.length,
        skippedCount: skippedFiles.length,
      });
    },
    logger,
  );
}

/** Extract a simple signature string for comparison */
interface FunctionSig {
  paramCount: number;
  paramTypes: string[];
  returnType: string;
  text: string;
}

function getSignature(decl: Node): FunctionSig | undefined {
  if (Node.isFunctionDeclaration(decl)) {
    const params = decl.getParameters();
    const paramTypes = params.map((p) => p.getType().getText());
    const returnType = decl.getReturnType().getText();
    return {
      paramCount: params.length,
      paramTypes,
      returnType,
      text: `(${paramTypes.join(', ')}) => ${returnType}`,
    };
  }
  return undefined; // Non-function declarations don't need signature checks
}

function signaturesCompatible(a: FunctionSig, b: FunctionSig): boolean {
  if (a.paramCount !== b.paramCount) return false;
  if (a.returnType !== b.returnType) return false;
  for (let i = 0; i < a.paramTypes.length; i++) {
    if (a.paramTypes[i] !== b.paramTypes[i]) return false;
  }
  return true;
}
