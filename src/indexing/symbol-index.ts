export interface SymbolIndex {
  /** symbol name -> files that define it */
  definitions: Map<string, string[]>;
  /** symbol name -> files that reference it */
  references: Map<string, string[]>;
}

export interface FileSymbols {
  definitions: string[];
  references: string[];
}

export function createSymbolIndex(): SymbolIndex {
  return {
    definitions: new Map(),
    references: new Map(),
  };
}

export function addSymbols(index: SymbolIndex, filePath: string, symbols: FileSymbols): SymbolIndex {
  const definitions = new Map(index.definitions);
  const references = new Map(index.references);

  for (const name of symbols.definitions) {
    const existing = definitions.get(name) ?? [];
    definitions.set(name, [...existing, filePath]);
  }

  for (const name of symbols.references) {
    const existing = references.get(name) ?? [];
    references.set(name, [...existing, filePath]);
  }

  return { definitions, references };
}

export function definitionsOf(index: SymbolIndex, symbolName: string): string[] {
  return index.definitions.get(symbolName) ?? [];
}

export function referencesOf(index: SymbolIndex, symbolName: string): string[] {
  return index.references.get(symbolName) ?? [];
}
