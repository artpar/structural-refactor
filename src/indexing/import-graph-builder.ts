import { parseSync } from 'oxc-parser';
import type { ImportGraphEntry, ImportEdge } from './import-graph.js';

export interface RawFileEntry {
  filePath: string;
  imports: ImportEdge[];
  exports: string[];
}

export function buildFileEntry(filePath: string, sourceText: string): RawFileEntry {
  const result = parseSync(filePath, sourceText);
  const mod = result.module;

  const imports: ImportEdge[] = [];
  const exports: string[] = [];

  // Extract imports from oxc module metadata (AST-parsed)
  for (const staticImport of mod.staticImports) {
    const source = staticImport.moduleRequest.value;
    const specifiers: string[] = [];

    for (const entry of staticImport.entries) {
      const kind = entry.importName.kind;
      if (kind === 'Default') {
        specifiers.push('default');
      } else if (kind === 'NamespaceObject') {
        specifiers.push('*');
      } else if (kind === 'Name') {
        specifiers.push(entry.importName.name!);
      }
    }

    imports.push({ source, resolved: '', specifiers });
  }

  // Extract exports from oxc module metadata (AST-parsed)
  // Group re-export entries by their moduleRequest source
  const reExportsBySource = new Map<string, string[]>();

  for (const staticExport of mod.staticExports) {
    for (const entry of staticExport.entries) {
      // Record the export name
      if (entry.exportName.kind === 'Default') {
        exports.push('default');
      } else if (entry.exportName.kind === 'Name' && entry.exportName.name) {
        exports.push(entry.exportName.name);
      }

      // If entry has a moduleRequest, it's a re-export — group by source for import edges
      if (entry.moduleRequest) {
        const source = entry.moduleRequest.value;
        const specifier = entry.importName.kind === 'Name' ? entry.importName.name! : '*';
        const existing = reExportsBySource.get(source) ?? [];
        existing.push(specifier);
        reExportsBySource.set(source, existing);
      }
    }
  }

  // Create import edges for re-exports
  for (const [source, specifiers] of reExportsBySource) {
    imports.push({ source, resolved: '', specifiers });
  }

  return { filePath, imports, exports };
}
