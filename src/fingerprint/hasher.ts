/**
 * Merkle-style AST subtree hashing.
 * Based on: "Hash-Based Tree Similarity" (arxiv.org/abs/2107.10640)
 *
 * Each node is hashed bottom-up: leaf nodes hash their type,
 * internal nodes combine their type with sorted child hashes.
 * Variable names are excluded (Type II clone invariance).
 * Commutative operators sort their children for canonical ordering.
 *
 * Similarity measured via Sørensen-Dice coefficient on subtree hash sets.
 */

const COMMUTATIVE_OPS = new Set(['+', '*', '&', '|', '^', '&&', '||', '==', '===', '!=', '!==']);

// Simple fast hash (FNV-1a 32-bit)
function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash;
}

function combineHashes(parentType: string, childHashes: number[]): number {
  let str = parentType;
  for (const h of childHashes) {
    str += ':' + h.toString(36);
  }
  return fnv1a(str);
}

/**
 * Compute Merkle hash for an AST node (bottom-up).
 * Hashes node types only — ignores identifier names for Type II invariance.
 */
export function merkleHash(node: any): number {
  if (!node || typeof node !== 'object' || !node.type) {
    return 0;
  }

  // Leaf-like nodes: hash their type (and operator if applicable)
  const children = getAstChildren(node);

  if (children.length === 0) {
    // Leaf node — hash just the type
    return fnv1a(node.type);
  }

  // Compute child hashes
  let childHashes = children.map((child: any) => merkleHash(child));

  // For commutative binary expressions, sort children for canonical ordering
  if (node.type === 'BinaryExpression' && COMMUTATIVE_OPS.has(node.operator)) {
    childHashes = childHashes.sort((a, b) => a - b);
  }

  // Include the operator for expressions that have one
  const typeKey = node.operator ? `${node.type}:${node.operator}` : node.type;

  return combineHashes(typeKey, childHashes);
}

/**
 * Collect all subtree hashes (post-order).
 * Returns the hash of every subtree in the AST.
 */
export function subtreeHashes(node: any): number[] {
  const hashes: number[] = [];

  function collect(n: any): number {
    if (!n || typeof n !== 'object' || !n.type) return 0;

    const children = getAstChildren(n);

    let childHashes = children.map((child: any) => collect(child));

    if (n.type === 'BinaryExpression' && COMMUTATIVE_OPS.has(n.operator)) {
      childHashes = childHashes.sort((a, b) => a - b);
    }

    const typeKey = n.operator ? `${n.type}:${n.operator}` : n.type;
    const hash = children.length === 0 ? fnv1a(n.type) : combineHashes(typeKey, childHashes);

    hashes.push(hash);
    return hash;
  }

  collect(node);
  return hashes;
}

/**
 * Sørensen-Dice coefficient on two hash multisets.
 * D(A,B) = 2·|A ∩ B| / (|A| + |B|)
 * Uses sorted merge for O(n log n) computation.
 */
export function diceSimilarity(hashesA: number[], hashesB: number[]): number {
  if (hashesA.length === 0 && hashesB.length === 0) return 1.0;
  if (hashesA.length === 0 || hashesB.length === 0) return 0.0;

  const sortedA = [...hashesA].sort((a, b) => a - b);
  const sortedB = [...hashesB].sort((a, b) => a - b);

  let intersection = 0;
  let i = 0;
  let j = 0;

  while (i < sortedA.length && j < sortedB.length) {
    if (sortedA[i] === sortedB[j]) {
      intersection++;
      i++;
      j++;
    } else if (sortedA[i] < sortedB[j]) {
      i++;
    } else {
      j++;
    }
  }

  return (2 * intersection) / (sortedA.length + sortedB.length);
}

/** Get structural children of an AST node (skip identifier names and literal values) */
function getAstChildren(node: any): any[] {
  const children: any[] = [];

  for (const key of Object.keys(node)) {
    // Skip metadata and identifier/literal values (for Type II invariance)
    if (key === 'type' || key === 'start' || key === 'end' || key === 'name' ||
        key === 'value' || key === 'raw' || key === 'operator' || key === 'regex' ||
        key === 'leadingComments' || key === 'trailingComments') continue;

    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item === 'object' && item.type) children.push(item);
      }
    } else if (child && typeof child === 'object' && child.type) {
      children.push(child);
    }
  }

  return children;
}
