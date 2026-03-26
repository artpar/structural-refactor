import type { SourceFile } from 'ts-morph';

export interface ImportInfo {
  moduleSpecifier: string;
  namedImports?: string[];
  defaultImport?: string;
  namespaceImport?: string;
  isTypeOnly?: boolean;
}

export function getImports(sourceFile: SourceFile): ImportInfo[] {
  const declarations = sourceFile.getImportDeclarations();
  return declarations.map((decl) => {
    const info: ImportInfo = {
      moduleSpecifier: decl.getModuleSpecifierValue(),
    };

    const defaultImport = decl.getDefaultImport();
    if (defaultImport) {
      info.defaultImport = defaultImport.getText();
    }

    const namespaceImport = decl.getNamespaceImport();
    if (namespaceImport) {
      info.namespaceImport = namespaceImport.getText();
    }

    const namedImports = decl.getNamedImports();
    if (namedImports.length > 0) {
      info.namedImports = namedImports.map((n) => n.getName());
    }

    info.isTypeOnly = decl.isTypeOnly();

    return info;
  });
}

export function addImport(sourceFile: SourceFile, info: ImportInfo): void {
  // Check if there's an existing import from the same module
  const existing = sourceFile.getImportDeclaration(info.moduleSpecifier);

  if (existing && info.namedImports) {
    // Merge named imports into existing declaration
    for (const name of info.namedImports) {
      const alreadyHas = existing.getNamedImports().some((n) => n.getName() === name);
      if (!alreadyHas) {
        existing.addNamedImport(name);
      }
    }
    return;
  }

  // Add new import declaration
  const structure: Parameters<SourceFile['addImportDeclaration']>[0] = {
    moduleSpecifier: info.moduleSpecifier,
  };

  if (info.defaultImport) {
    structure.defaultImport = info.defaultImport;
  }

  if (info.namedImports) {
    structure.namedImports = info.namedImports;
  }

  if (info.namespaceImport) {
    structure.namespaceImport = info.namespaceImport;
  }

  sourceFile.addImportDeclaration(structure);
}

export function removeImport(sourceFile: SourceFile, info: ImportInfo): void {
  const decl = sourceFile.getImportDeclaration(info.moduleSpecifier);
  if (!decl) return;

  if (info.namedImports) {
    for (const name of info.namedImports) {
      const specifier = decl.getNamedImports().find((n) => n.getName() === name);
      specifier?.remove();
    }

    // If no specifiers left and no default/namespace import, remove the whole declaration
    const hasNamedLeft = decl.getNamedImports().length > 0;
    const hasDefault = decl.getDefaultImport() !== undefined;
    const hasNamespace = decl.getNamespaceImport() !== undefined;

    if (!hasNamedLeft && !hasDefault && !hasNamespace) {
      decl.remove();
    }
    return;
  }

  // No specific specifiers — remove the entire declaration
  decl.remove();
}

export function updateImportPath(
  sourceFile: SourceFile,
  oldPath: string,
  newPath: string,
): void {
  const declarations = sourceFile.getImportDeclarations();
  for (const decl of declarations) {
    if (decl.getModuleSpecifierValue() === oldPath) {
      decl.setModuleSpecifier(newPath);
    }
  }
}
