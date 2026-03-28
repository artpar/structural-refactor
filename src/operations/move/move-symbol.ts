import { Project, Node, SyntaxKind } from 'ts-morph';
import path from 'node:path';
import type { ChangeSet, FileChange } from '../../core/change-set.js';
import { createChangeSet } from '../../core/change-set.js';
import { addImport, removeImport, updateImportPath } from '../../utils/import-manager.js';
import type { Logger } from '../../core/logger.js';

export interface MoveSymbolArgs {
  symbolName: string;
  fromFile: string;
  toFile: string;
  logger: Logger;
}

function relativeSpecifier(from: string, to: string): string {
  const fromDir = path.dirname(from);
  let rel = path.relative(fromDir, to).replace(/\.(ts|tsx|js|jsx|mjs|cjs)$/, '');
  if (!rel.startsWith('.')) rel = './' + rel;
  return rel;
}

export function moveSymbol(project: Project, args: MoveSymbolArgs): ChangeSet {
  const { symbolName, fromFile, toFile, logger } = args;

  logger.info('move-symbol', 'starting move', { symbolName, fromFile, toFile });

  const sourceSf = project.getSourceFile(fromFile);
  const targetSf = project.getSourceFile(toFile);

  if (!sourceSf || !targetSf) {
    logger.warn('move-symbol', 'source or target file not found', { fromFile, toFile });
    return createChangeSet('Move (file not found)', []);
  }

  // Capture originals
  const originalContents = new Map<string, string>();
  for (const sf of project.getSourceFiles()) {
    originalContents.set(sf.getFilePath(), sf.getFullText());
  }

  const startMs = performance.now();

  // Find declaration by name — exported first, then non-exported
  const decl = findDeclaration(sourceSf, symbolName);
  if (!decl) {
    logger.warn('move-symbol', 'symbol not found in source', { symbolName, fromFile });
    return createChangeSet('Move (symbol not found)', []);
  }

  const isExported = isNodeExported(decl);

  // Issue #1: Check if target already has a symbol with the same name
  const existingInTarget = findDeclaration(targetSf, symbolName);
  if (existingInTarget) {
    // Check for signature mismatch and warn
    const sourceSig = getSignature(decl);
    const targetSig = getSignature(existingInTarget);
    if (sourceSig && targetSig && !signaturesCompatible(sourceSig, targetSig)) {
      logger.warn('move-symbol', 'target has symbol with different signature', {
        symbolName,
        sourceSignature: sourceSig.text,
        targetSignature: targetSig.text,
      });
    }
    logger.info('move-symbol', 'target already has symbol, skipping copy', { symbolName });
  } else {
    // Add the declaration to the target file
    let declText = decl.getFullText();

    // Issue #5: If source symbol is not exported, add export in target
    if (!isExported) {
      declText = ensureExported(declText);
    }

    targetSf.addStatements(declText);
  }

  // Remove from source
  removeNode(decl);

  // Issue #5: If symbol was non-exported, add import in source so references still work
  if (!isExported) {
    addImport(sourceSf, {
      moduleSpecifier: relativeSpecifier(fromFile, toFile),
      namedImports: [symbolName],
    });
  }

  // Issue #4: Clean up unused imports in source after removing the declaration
  removeUnusedImports(sourceSf);

  // Update imports in all files that imported this symbol from the source
  if (isExported) {
    const oldSpecifierFromSource = (importerPath: string) => relativeSpecifier(importerPath, fromFile);
    const newSpecifierToTarget = (importerPath: string) => relativeSpecifier(importerPath, toFile);

    for (const sf of project.getSourceFiles()) {
      const sfPath = sf.getFilePath();
      if (sfPath === fromFile || sfPath === toFile) continue;

      const importDecls = sf.getImportDeclarations();
      for (const importDecl of importDecls) {
        if (importDecl.getModuleSpecifierValue() === oldSpecifierFromSource(sfPath)) {
          const namedImport = importDecl.getNamedImports().find((n) => n.getName() === symbolName);
          if (namedImport) {
            // Remove this specifier from the old import
            namedImport.remove();

            // If no imports left, remove the declaration
            if (importDecl.getNamedImports().length === 0 && !importDecl.getDefaultImport() && !importDecl.getNamespaceImport()) {
              importDecl.remove();
            }

            // Add import from the new target
            addImport(sf, { moduleSpecifier: newSpecifierToTarget(sfPath), namedImports: [symbolName] });
          }
        }
      }
    }
  }

  // Collect changes
  const files: FileChange[] = [];
  for (const sf of project.getSourceFiles()) {
    const sfPath = sf.getFilePath();
    const original = originalContents.get(sfPath) ?? '';
    const modified = sf.getFullText();
    if (original !== modified) {
      files.push({ path: sfPath, original, modified });
    }
  }

  const durationMs = Math.round(performance.now() - startMs);

  logger.info('move-symbol', 'move complete', {
    symbolName,
    fromFile,
    toFile,
    filesChanged: files.length,
    durationMs,
  });

  return createChangeSet(`Move '${symbolName}' from '${fromFile}' to '${toFile}'`, files);
}

/** Find a declaration by name — checks exported first, then non-exported */
function findDeclaration(sourceFile: ReturnType<Project['getSourceFileOrThrow']>, name: string): Node | undefined {
  // Check function declarations
  const fn = sourceFile.getFunction(name);
  if (fn) return fn;

  // Check variable declarations — return the full variable statement
  for (const stmt of sourceFile.getVariableStatements()) {
    for (const decl of stmt.getDeclarations()) {
      if (decl.getName() === name) {
        return stmt;
      }
    }
  }

  // Check class declarations
  const cls = sourceFile.getClass(name);
  if (cls) return cls;

  // Check interface declarations
  const iface = sourceFile.getInterface(name);
  if (iface) return iface;

  // Check type aliases
  const typeAlias = sourceFile.getTypeAlias(name);
  if (typeAlias) return typeAlias;

  // Check enum declarations
  const enumDecl = sourceFile.getEnum(name);
  if (enumDecl) return enumDecl;

  return undefined;
}

/** Check if a node is exported */
function isNodeExported(node: Node): boolean {
  if (Node.isFunctionDeclaration(node)) return node.isExported();
  if (Node.isClassDeclaration(node)) return node.isExported();
  if (Node.isInterfaceDeclaration(node)) return node.isExported();
  if (Node.isTypeAliasDeclaration(node)) return node.isExported();
  if (Node.isEnumDeclaration(node)) return node.isExported();
  if (Node.isVariableStatement(node)) return node.isExported();
  return false;
}

/** Remove a node from the AST */
function removeNode(node: Node): void {
  if (Node.isFunctionDeclaration(node)) node.remove();
  else if (Node.isClassDeclaration(node)) node.remove();
  else if (Node.isInterfaceDeclaration(node)) node.remove();
  else if (Node.isTypeAliasDeclaration(node)) node.remove();
  else if (Node.isEnumDeclaration(node)) node.remove();
  else if (Node.isVariableStatement(node)) node.remove();
}

/** Ensure a declaration text has 'export' before the declaration keyword */
function ensureExported(declText: string): string {
  if (/\bexport\b/.test(declText)) return declText;
  // Insert 'export ' before the declaration keyword, not before leading comments
  const declKeywords = /^(const |let |var |function |class |interface |type |enum |abstract |async )/m;
  return declText.replace(declKeywords, 'export $1');
}

/** Remove import specifiers that are no longer referenced in the source file */
function removeUnusedImports(sourceFile: ReturnType<Project['getSourceFileOrThrow']>): void {
  // Collect all identifier names used in the file, excluding import specifiers
  const usedNames = new Set<string>();
  for (const id of sourceFile.getDescendantsOfKind(SyntaxKind.Identifier)) {
    // Skip identifiers that are part of import specifiers
    const parent = id.getParent();
    if (parent && Node.isImportSpecifier(parent)) continue;
    // Skip the module specifier string identifiers
    if (parent && Node.isImportDeclaration(parent)) continue;
    usedNames.add(id.getText());
  }

  // Now check each import declaration
  for (const importDecl of sourceFile.getImportDeclarations()) {
    const namedImports = importDecl.getNamedImports();
    for (const specifier of [...namedImports]) {
      if (!usedNames.has(specifier.getName())) {
        specifier.remove();
      }
    }

    // Remove entire declaration if empty
    if (importDecl.getNamedImports().length === 0 && !importDecl.getDefaultImport() && !importDecl.getNamespaceImport()) {
      importDecl.remove();
    }
  }
}

/** Extract a simple signature string for comparison */
interface FunctionSig {
  paramCount: number;
  paramTypes: string[];
  returnType: string;
  text: string;
}

function getSignature(node: Node): FunctionSig | undefined {
  if (Node.isFunctionDeclaration(node)) {
    const params = node.getParameters();
    const paramTypes = params.map((p) => p.getType().getText());
    const returnType = node.getReturnType().getText();
    return {
      paramCount: params.length,
      paramTypes,
      returnType,
      text: `(${paramTypes.join(', ')}) => ${returnType}`,
    };
  }
  return undefined;
}

function signaturesCompatible(a: FunctionSig, b: FunctionSig): boolean {
  if (a.paramCount !== b.paramCount) return false;
  if (a.returnType !== b.returnType) return false;
  for (let i = 0; i < a.paramTypes.length; i++) {
    if (a.paramTypes[i] !== b.paramTypes[i]) return false;
  }
  return true;
}
