/**
 * Shared AST walking utilities. Single source of truth.
 * Previously duplicated in call-graph.ts, discovery.ts, extractors.ts.
 */

/** Walk an AST pre-order with parent tracking */
export function walkAst(node: any, visitor: (node: any, parents: any[]) => void, parents: any[] = []): void {
  if (!node || typeof node !== 'object') return;
  if (node.type) {
    visitor(node, parents);
    parents = [...parents, node];
  }
  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'start' || key === 'end') continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child) walkAst(item, visitor, parents);
    } else if (child && typeof child === 'object' && child.type) {
      walkAst(child, visitor, parents);
    }
  }
}

/** Walk an AST post-order (children before parents) */
export function walkAstPostOrder(node: any, visitor: (node: any) => void): void {
  if (!node || typeof node !== 'object') return;
  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'start' || key === 'end') continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child) walkAstPostOrder(item, visitor);
    } else if (child && typeof child === 'object' && child.type) {
      walkAstPostOrder(child, visitor);
    }
  }
  if (node.type) visitor(node);
}
