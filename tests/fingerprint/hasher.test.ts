import { describe, it, expect } from 'vitest';
import { parseSync } from 'oxc-parser';
import {
  merkleHash,
  subtreeHashes,
  diceSimilarity,
} from '../../src/fingerprint/hasher.js';

function getBody(code: string) {
  const result = parseSync('/test.ts', code);
  // Get the function body from the AST
  return result.program.body[0];
}

describe('Merkle AST Hasher', () => {
  describe('merkleHash', () => {
    it('returns a numeric hash for an AST node', () => {
      const ast = getBody('function add(a: number, b: number) { return a + b; }');
      const hash = merkleHash(ast);
      expect(typeof hash).toBe('number');
      expect(hash).not.toBe(0);
    });

    it('same structure produces same hash', () => {
      const ast1 = getBody('function add(a: number, b: number) { return a + b; }');
      const ast2 = getBody('function sum(x: number, y: number) { return x + y; }');
      // Same structure, different names — should hash the same (Type II invariance)
      expect(merkleHash(ast1)).toBe(merkleHash(ast2));
    });

    it('different structure produces different hash', () => {
      const ast1 = getBody('function add(a: number, b: number) { return a + b; }');
      const ast2 = getBody('function mul(a: number, b: number) { return a * b; }');
      // Different operator — different structure
      expect(merkleHash(ast1)).not.toBe(merkleHash(ast2));
    });

    it('handles commutative operations by sorting children', () => {
      // a + b and b + a should have same hash since + is commutative
      const ast1 = getBody('function f() { return 1 + 2; }');
      const ast2 = getBody('function f() { return 2 + 1; }');
      // With commutative sorting, these should be equal
      expect(merkleHash(ast1)).toBe(merkleHash(ast2));
    });
  });

  describe('subtreeHashes', () => {
    it('returns a set of hashes for all subtrees', () => {
      const ast = getBody('function add(a: number, b: number) { return a + b; }');
      const hashes = subtreeHashes(ast);
      expect(hashes.length).toBeGreaterThan(1);
    });

    it('includes the root hash', () => {
      const ast = getBody('function f() { return 1; }');
      const hashes = subtreeHashes(ast);
      const rootHash = merkleHash(ast);
      expect(hashes).toContain(rootHash);
    });
  });

  describe('diceSimilarity', () => {
    it('returns 1.0 for identical hash sets', () => {
      const hashes = [1, 2, 3, 4, 5];
      expect(diceSimilarity(hashes, hashes)).toBe(1.0);
    });

    it('returns 0.0 for completely different hash sets', () => {
      expect(diceSimilarity([1, 2, 3], [4, 5, 6])).toBe(0.0);
    });

    it('returns ~0.67 for 2/3 overlap', () => {
      // |{1,2,3} ∩ {2,3,4}| = 2, Dice = 2*2/(3+3) = 0.667
      const score = diceSimilarity([1, 2, 3], [2, 3, 4]);
      expect(score).toBeCloseTo(0.667, 2);
    });

    it('structurally similar functions have high Dice score', () => {
      const ast1 = getBody('function add(a: number, b: number) { return a + b; }');
      const ast2 = getBody('function sum(x: number, y: number) { return x + y; }');
      const h1 = subtreeHashes(ast1);
      const h2 = subtreeHashes(ast2);
      expect(diceSimilarity(h1, h2)).toBe(1.0); // identical structure
    });

    it('structurally different functions have lower Dice score', () => {
      const ast1 = getBody('function f(x: number) { return x + 1; }');
      const ast2 = getBody('function g(x: number) { if (x > 0) { return x; } else { return -x; } }');
      const h1 = subtreeHashes(ast1);
      const h2 = subtreeHashes(ast2);
      expect(diceSimilarity(h1, h2)).toBeLessThan(0.8);
    });
  });
});
