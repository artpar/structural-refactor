import { describe, it, expect } from 'vitest';
import { parseSync } from 'oxc-parser';
import {
  extractImports,
  extractExports,
  extractCodeUnits,
  extractCalls,
  extractAll,
} from '../../src/scanner/extractors.js';

function parse(code: string, filename = '/test.ts') {
  return parseSync(filename, code);
}

describe('extractors', () => {
  describe('extractImports', () => {
    it('extracts named imports', () => {
      const result = parse('import { foo, bar } from "./utils";');
      const imports = extractImports(result.module);
      expect(imports).toHaveLength(1);
      expect(imports[0].source).toBe('./utils');
      expect(imports[0].specifiers).toEqual(['foo', 'bar']);
    });

    it('extracts default imports', () => {
      const result = parse('import App from "./App";');
      const imports = extractImports(result.module);
      expect(imports[0].specifiers).toEqual(['default']);
    });

    it('extracts namespace imports', () => {
      const result = parse('import * as utils from "./utils";');
      const imports = extractImports(result.module);
      expect(imports[0].specifiers).toEqual(['*']);
    });
  });

  describe('extractExports', () => {
    it('extracts named exports', () => {
      const result = parse('export function add() {} export const PI = 3;');
      const exports = extractExports(result.module);
      expect(exports.some((e) => e.name === 'add')).toBe(true);
      expect(exports.some((e) => e.name === 'PI')).toBe(true);
    });

    it('extracts re-exports', () => {
      const result = parse('export { foo, bar } from "./utils";');
      const exports = extractExports(result.module);
      expect(exports.some((e) => e.name === 'foo' && e.isReExport)).toBe(true);
    });

    it('extracts default export', () => {
      const result = parse('export default function main() {}');
      const exports = extractExports(result.module);
      expect(exports.some((e) => e.isDefault)).toBe(true);
    });
  });

  describe('extractCodeUnits', () => {
    it('extracts function declarations with params and return type', () => {
      const result = parse('function add(a: number, b: number): number { return a + b; }');
      const units = extractCodeUnits(result.program, 'function add(a: number, b: number): number { return a + b; }');
      expect(units).toHaveLength(1);
      expect(units[0].name).toBe('add');
      expect(units[0].kind).toBe('function');
      expect(units[0].params).toEqual([
        { name: 'a', type: 'number' },
        { name: 'b', type: 'number' },
      ]);
      expect(units[0].returnType).toBe('number');
    });

    it('extracts arrow functions assigned to const', () => {
      const result = parse('const greet = (name: string) => `hello ${name}`;');
      const units = extractCodeUnits(result.program, 'const greet = (name: string) => `hello ${name}`;');
      expect(units.some((u) => u.name === 'greet' && u.kind === 'arrow')).toBe(true);
    });

    it('extracts classes with members', () => {
      const result = parse('class User { name: string = ""; getAge() { return 0; } }');
      const units = extractCodeUnits(result.program, 'class User { name: string = ""; getAge() { return 0; } }');
      const cls = units.find((u) => u.name === 'User');
      expect(cls).toBeDefined();
      expect(cls!.kind).toBe('class');
      expect(cls!.members.some((m) => m.name === 'name' && m.kind === 'property')).toBe(true);
      expect(cls!.members.some((m) => m.name === 'getAge' && m.kind === 'method')).toBe(true);
    });

    it('extracts interfaces', () => {
      const result = parse('interface Config { debug: boolean; port: number; }');
      const units = extractCodeUnits(result.program, 'interface Config { debug: boolean; port: number; }');
      const iface = units.find((u) => u.name === 'Config');
      expect(iface).toBeDefined();
      expect(iface!.kind).toBe('interface');
      expect(iface!.members).toHaveLength(2);
    });

    it('extracts type aliases', () => {
      const result = parse('type ID = string;');
      const units = extractCodeUnits(result.program, 'type ID = string;');
      expect(units.some((u) => u.name === 'ID' && u.kind === 'type')).toBe(true);
    });

    it('captures AST node types in post-order for Merkle hashing', () => {
      const result = parse('function add(a: number, b: number) { return a + b; }');
      const units = extractCodeUnits(result.program, 'function add(a: number, b: number) { return a + b; }');
      expect(units[0].nodeTypes.length).toBeGreaterThan(0);
    });

    it('captures type tokens (not names) for clone detection', () => {
      const result = parse('function add(a: number, b: number) { return a + b; }');
      const units = extractCodeUnits(result.program, 'function add(a: number, b: number) { return a + b; }');
      // Type tokens should have node types like 'ReturnStatement', 'BinaryExpression', etc.
      expect(units[0].typeTokens.length).toBeGreaterThan(0);
      // Should NOT contain variable names (for Type II invariance)
      expect(units[0].typeTokens).not.toContain('a');
      expect(units[0].typeTokens).not.toContain('b');
    });

    it('computes cyclomatic complexity', () => {
      const code = 'function complex(x: number) { if (x > 0) { return 1; } else if (x < 0) { return -1; } return 0; }';
      const result = parse(code);
      const units = extractCodeUnits(result.program, code);
      expect(units[0].complexity).toBeGreaterThanOrEqual(2); // two branches
    });
  });

  describe('extractCalls', () => {
    it('extracts function calls with enclosing function', () => {
      const code = 'function main() { console.log("hi"); Math.max(1, 2); }';
      const result = parse(code);
      const calls = extractCalls(result.program);
      expect(calls.length).toBeGreaterThanOrEqual(2);
      expect(calls.some((c) => c.targetName === 'console.log')).toBe(true);
      expect(calls.some((c) => c.targetName === 'Math.max')).toBe(true);
      expect(calls.every((c) => c.callerName === 'main')).toBe(true);
    });
  });

  describe('class hierarchy extraction', () => {
    it('extracts extends clause', () => {
      const code = 'class Animal { speak() {} }\nclass Dog extends Animal { bark() {} }';
      const result = parse(code);
      const units = extractCodeUnits(result.program, code);
      const dog = units.find((u) => u.name === 'Dog');
      expect(dog).toBeDefined();
      expect(dog!.extends).toBe('Animal');
    });

    it('extracts implements clause', () => {
      const code = 'interface Serializable { serialize(): string; }\nclass User implements Serializable { serialize() { return ""; } }';
      const result = parse(code);
      const units = extractCodeUnits(result.program, code);
      const user = units.find((u) => u.name === 'User');
      expect(user).toBeDefined();
      expect(user!.implements).toContain('Serializable');
    });

    it('extracts decorators on classes', () => {
      const code = 'function Component(opts: any) { return (t: any) => t; }\n@Component({ selector: "app" })\nclass AppComponent {}';
      const result = parse(code);
      const units = extractCodeUnits(result.program, code);
      const app = units.find((u) => u.name === 'AppComponent');
      expect(app).toBeDefined();
      expect(app!.decorators).toBeDefined();
      expect(app!.decorators!.length).toBeGreaterThanOrEqual(1);
      expect(app!.decorators![0].name).toBe('Component');
    });

    it('extracts constructor params', () => {
      const code = 'class Service { constructor(private db: Database, public logger: Logger) {} }';
      const result = parse(code);
      const units = extractCodeUnits(result.program, code);
      const svc = units.find((u) => u.name === 'Service');
      expect(svc).toBeDefined();
      expect(svc!.constructorParams).toBeDefined();
      expect(svc!.constructorParams!.length).toBe(2);
      expect(svc!.constructorParams![0].name).toBe('db');
    });

    it('extracts member visibility and static', () => {
      const code = 'class Foo { private secret = 1; public name = ""; static count = 0; greet() {} }';
      const result = parse(code);
      const units = extractCodeUnits(result.program, code);
      const foo = units.find((u) => u.name === 'Foo');
      expect(foo).toBeDefined();
      const secret = foo!.members.find((m) => m.name === 'secret');
      expect(secret?.visibility).toBe('private');
      const name = foo!.members.find((m) => m.name === 'name');
      expect(name?.visibility).toBe('public');
      const count = foo!.members.find((m) => m.name === 'count');
      expect(count?.isStatic).toBe(true);
    });
  });

  describe('extractAll', () => {
    it('extracts everything in one pass', () => {
      const code = 'import { x } from "./mod";\nexport function add(a: number, b: number) { return x(a + b); }\n';
      const result = extractAll('/src/app.ts', code, 'abc123');
      expect(result.filePath).toBe('/src/app.ts');
      expect(result.contentHash).toBe('abc123');
      expect(result.imports.length).toBeGreaterThanOrEqual(1);
      expect(result.exports.length).toBeGreaterThanOrEqual(1);
      expect(result.codeUnits.length).toBeGreaterThanOrEqual(1);
      expect(result.calls.length).toBeGreaterThanOrEqual(1);
    });
  });
});
