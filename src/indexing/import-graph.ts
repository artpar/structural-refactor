export interface ImportEdge {
  source: string;
  resolved: string;
  specifiers: string[];
}

export interface ImportGraphEntry {
  filePath: string;
  imports: ImportEdge[];
  exports: string[];
}

export interface ImportGraph {
  entries: Map<string, ImportGraphEntry>;
  /** Reverse index: resolved path -> files that import it */
  reverseEdges: Map<string, string[]>;
}

export function createImportGraph(): ImportGraph {
  return {
    entries: new Map(),
    reverseEdges: new Map(),
  };
}

export function addEntry(graph: ImportGraph, entry: ImportGraphEntry): ImportGraph {
  const entries = new Map(graph.entries);
  entries.set(entry.filePath, entry);

  const reverseEdges = new Map(graph.reverseEdges);
  for (const imp of entry.imports) {
    const existing = reverseEdges.get(imp.resolved) ?? [];
    if (!existing.includes(entry.filePath)) {
      reverseEdges.set(imp.resolved, [...existing, entry.filePath]);
    }
  }

  return { entries, reverseEdges };
}

export function allFiles(graph: ImportGraph): string[] {
  return [...graph.entries.keys()];
}

export function importersOf(graph: ImportGraph, filePath: string): string[] {
  return graph.reverseEdges.get(filePath) ?? [];
}

export function importsOf(graph: ImportGraph, filePath: string): string[] {
  const entry = graph.entries.get(filePath);
  if (!entry) return [];
  return entry.imports.map((imp) => imp.resolved);
}

export function isReachableFrom(graph: ImportGraph, source: string, target: string): boolean {
  if (source === target) return false;

  // BFS from target following its imports to see if we reach source
  const visited = new Set<string>();
  const queue = [target];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    const deps = importsOf(graph, current);
    for (const dep of deps) {
      if (dep === source) return true;
      if (!visited.has(dep)) queue.push(dep);
    }
  }

  return false;
}
