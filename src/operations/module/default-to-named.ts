import { Project, Node, SyntaxKind } from 'ts-morph';
import type { ChangeSet, FileChange } from '../../core/change-set.js';
import { createChangeSet } from '../../core/change-set.js';
import type { Logger } from '../../core/logger.js';

export interface DefaultToNamedArgs {
  filePath: string;
  logger: Logger;
}

export function defaultToNamed(project: Project, args: DefaultToNamedArgs): ChangeSet {
  const { filePath, logger } = args;

  const sourceFile = project.getSourceFile(filePath);
  if (!sourceFile) {
    logger.warn('default-to-named', 'source file not found', { filePath });
    return createChangeSet('Default to named (no changes)', []);
  }

  // Find the default export
  const defaultExportSymbol = sourceFile.getDefaultExportSymbol();
  if (!defaultExportSymbol) {
    logger.info('default-to-named', 'no default export found', { filePath });
    return createChangeSet('Default to named (no default export)', []);
  }

  // Get the name of the exported declaration
  const declarations = defaultExportSymbol.getDeclarations();
  let exportedName: string | undefined;

  for (const decl of declarations) {
    if (Node.isFunctionDeclaration(decl) && decl.getName()) {
      exportedName = decl.getName()!;
      break;
    }
    if (Node.isClassDeclaration(decl) && decl.getName()) {
      exportedName = decl.getName()!;
      break;
    }
    // export default expression — check ExportAssignment
    if (Node.isExportAssignment(decl)) {
      const expr = decl.getExpression();
      if (Node.isIdentifier(expr)) {
        exportedName = expr.getText();
      }
    }
  }

  if (!exportedName) {
    logger.warn('default-to-named', 'cannot determine export name', { filePath });
    return createChangeSet('Default to named (unnamed export)', []);
  }

  logger.info('default-to-named', 'converting default to named export', {
    filePath, exportedName,
  });

  // Capture originals
  const originalContents = new Map<string, string>();
  for (const sf of project.getSourceFiles()) {
    originalContents.set(sf.getFilePath(), sf.getFullText());
  }

  // Remove the 'default' keyword from the export
  for (const decl of declarations) {
    if (Node.isFunctionDeclaration(decl) && decl.isDefaultExport()) {
      decl.setIsDefaultExport(false);
      decl.setIsExported(true);
      break;
    }
    if (Node.isClassDeclaration(decl) && decl.isDefaultExport()) {
      decl.setIsDefaultExport(false);
      decl.setIsExported(true);
      break;
    }
    if (Node.isExportAssignment(decl)) {
      // Replace "export default X;" with "export { X };" — handled below
      break;
    }
  }

  // Update all importers: change default import to named import
  for (const sf of project.getSourceFiles()) {
    if (sf.getFilePath() === filePath) continue;

    for (const importDecl of sf.getImportDeclarations()) {
      // Check if this import references our file
      const resolvedPath = importDecl.getModuleSpecifierSourceFile()?.getFilePath();
      if (resolvedPath !== filePath) continue;

      const defaultImport = importDecl.getDefaultImport();
      if (defaultImport) {
        const localName = defaultImport.getText();
        // Remove default import and add named import
        importDecl.removeDefaultImport();
        if (localName === exportedName) {
          importDecl.addNamedImport(exportedName);
        } else {
          importDecl.addNamedImport({ name: exportedName, alias: localName });
        }
      }
    }
  }

  // Collect changes
  const files: FileChange[] = [];
  for (const sf of project.getSourceFiles()) {
    const sfPath = sf.getFilePath();
    const original = originalContents.get(sfPath);
    const modified = sf.getFullText();
    if (original !== undefined && original !== modified) {
      files.push({ path: sfPath, original, modified });
    }
  }

  logger.info('default-to-named', 'conversion complete', {
    exportedName, filesChanged: files.length,
  });

  return createChangeSet(`Convert default export to named export '${exportedName}'`, files);
}
