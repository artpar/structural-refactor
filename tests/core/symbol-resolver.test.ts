import { describe, it, expect } from 'vitest';
import { Project } from 'ts-morph';
import {
  resolveSymbolAt,
  type ResolvedSymbol,
} from '../../src/core/symbol-resolver.js';

function projectWithFile(fileName: string, code: string): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile(fileName, code);
  return project;
}

describe('resolveSymbolAt', () => {
  it('resolves a variable declaration', () => {
    const project = projectWithFile('/src/foo.ts', 'const myVar = 42;\n');
    const result = resolveSymbolAt(project, '/src/foo.ts', 1, 7); // 'myVar' starts at col 7
    expect(result).toBeDefined();
    expect(result!.name).toBe('myVar');
    expect(result!.kind).toBe('variable');
    expect(result!.filePath).toBe('/src/foo.ts');
  });

  it('resolves a function declaration', () => {
    const project = projectWithFile('/src/foo.ts', 'function greet(name: string) { return name; }\n');
    const result = resolveSymbolAt(project, '/src/foo.ts', 1, 10); // 'greet' starts at col 10
    expect(result).toBeDefined();
    expect(result!.name).toBe('greet');
    expect(result!.kind).toBe('function');
  });

  it('resolves a class declaration', () => {
    const project = projectWithFile('/src/foo.ts', 'class MyClass {}\n');
    const result = resolveSymbolAt(project, '/src/foo.ts', 1, 7); // 'MyClass' starts at col 7
    expect(result).toBeDefined();
    expect(result!.name).toBe('MyClass');
    expect(result!.kind).toBe('class');
  });

  it('resolves an interface declaration', () => {
    const project = projectWithFile('/src/foo.ts', 'interface IFoo { x: number; }\n');
    const result = resolveSymbolAt(project, '/src/foo.ts', 1, 11); // 'IFoo' starts at col 11
    expect(result).toBeDefined();
    expect(result!.name).toBe('IFoo');
    expect(result!.kind).toBe('interface');
  });

  it('resolves a type alias', () => {
    const project = projectWithFile('/src/foo.ts', 'type ID = string;\n');
    const result = resolveSymbolAt(project, '/src/foo.ts', 1, 6); // 'ID' starts at col 6
    expect(result).toBeDefined();
    expect(result!.name).toBe('ID');
    expect(result!.kind).toBe('type');
  });

  it('resolves an enum declaration', () => {
    const project = projectWithFile('/src/foo.ts', 'enum Color { Red, Green, Blue }\n');
    const result = resolveSymbolAt(project, '/src/foo.ts', 1, 6); // 'Color' starts at col 6
    expect(result).toBeDefined();
    expect(result!.name).toBe('Color');
    expect(result!.kind).toBe('enum');
  });

  it('returns undefined for whitespace position', () => {
    const project = projectWithFile('/src/foo.ts', '   \nconst x = 1;\n');
    const result = resolveSymbolAt(project, '/src/foo.ts', 1, 1);
    expect(result).toBeUndefined();
  });

  it('returns undefined for nonexistent file', () => {
    const project = projectWithFile('/src/foo.ts', 'const x = 1;\n');
    const result = resolveSymbolAt(project, '/src/bar.ts', 1, 1);
    expect(result).toBeUndefined();
  });
});
