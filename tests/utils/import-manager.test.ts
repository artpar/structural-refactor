import { describe, it, expect } from 'vitest';
import { Project } from 'ts-morph';
import {
  addImport,
  removeImport,
  updateImportPath,
  getImports,
  type ImportInfo,
} from '../../src/utils/import-manager.js';

function projectWithFiles(files: Record<string, string>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [name, content] of Object.entries(files)) {
    project.createSourceFile(name, content);
  }
  return project;
}

describe('import-manager', () => {
  describe('getImports', () => {
    it('extracts named imports from a source file', () => {
      const project = projectWithFiles({
        '/src/app.ts': 'import { foo, bar } from "./utils";\nconst x = foo();',
      });
      const sf = project.getSourceFileOrThrow('/src/app.ts');
      const imports = getImports(sf);

      expect(imports).toHaveLength(1);
      expect(imports[0].moduleSpecifier).toBe('./utils');
      expect(imports[0].namedImports).toEqual(['foo', 'bar']);
      expect(imports[0].defaultImport).toBeUndefined();
    });

    it('extracts default import', () => {
      const project = projectWithFiles({
        '/src/app.ts': 'import App from "./App";\n',
      });
      const sf = project.getSourceFileOrThrow('/src/app.ts');
      const imports = getImports(sf);

      expect(imports[0].defaultImport).toBe('App');
    });

    it('extracts namespace import', () => {
      const project = projectWithFiles({
        '/src/app.ts': 'import * as utils from "./utils";\n',
      });
      const sf = project.getSourceFileOrThrow('/src/app.ts');
      const imports = getImports(sf);

      expect(imports[0].namespaceImport).toBe('utils');
    });

    it('handles mixed imports', () => {
      const project = projectWithFiles({
        '/src/app.ts': 'import React, { useState } from "react";\n',
      });
      const sf = project.getSourceFileOrThrow('/src/app.ts');
      const imports = getImports(sf);

      expect(imports[0].defaultImport).toBe('React');
      expect(imports[0].namedImports).toEqual(['useState']);
    });
  });

  describe('addImport', () => {
    it('adds a named import to a file', () => {
      const project = projectWithFiles({
        '/src/app.ts': 'const x = 1;\n',
      });
      const sf = project.getSourceFileOrThrow('/src/app.ts');

      addImport(sf, { moduleSpecifier: './utils', namedImports: ['foo'] });

      const imports = getImports(sf);
      expect(imports).toHaveLength(1);
      expect(imports[0].moduleSpecifier).toBe('./utils');
      expect(imports[0].namedImports).toEqual(['foo']);
    });

    it('merges into existing import from same module', () => {
      const project = projectWithFiles({
        '/src/app.ts': 'import { foo } from "./utils";\nconst x = foo();\n',
      });
      const sf = project.getSourceFileOrThrow('/src/app.ts');

      addImport(sf, { moduleSpecifier: './utils', namedImports: ['bar'] });

      const imports = getImports(sf);
      expect(imports).toHaveLength(1);
      expect(imports[0].namedImports).toContain('foo');
      expect(imports[0].namedImports).toContain('bar');
    });

    it('adds default import', () => {
      const project = projectWithFiles({
        '/src/app.ts': 'const x = 1;\n',
      });
      const sf = project.getSourceFileOrThrow('/src/app.ts');

      addImport(sf, { moduleSpecifier: './App', defaultImport: 'App' });

      const imports = getImports(sf);
      expect(imports[0].defaultImport).toBe('App');
    });
  });

  describe('removeImport', () => {
    it('removes a named import specifier', () => {
      const project = projectWithFiles({
        '/src/app.ts': 'import { foo, bar } from "./utils";\nconst x = bar();\n',
      });
      const sf = project.getSourceFileOrThrow('/src/app.ts');

      removeImport(sf, { moduleSpecifier: './utils', namedImports: ['foo'] });

      const imports = getImports(sf);
      expect(imports).toHaveLength(1);
      expect(imports[0].namedImports).toEqual(['bar']);
    });

    it('removes entire import when last specifier is removed', () => {
      const project = projectWithFiles({
        '/src/app.ts': 'import { foo } from "./utils";\n',
      });
      const sf = project.getSourceFileOrThrow('/src/app.ts');

      removeImport(sf, { moduleSpecifier: './utils', namedImports: ['foo'] });

      const imports = getImports(sf);
      expect(imports).toHaveLength(0);
    });
  });

  describe('updateImportPath', () => {
    it('updates module specifier for matching imports', () => {
      const project = projectWithFiles({
        '/src/app.ts': 'import { foo } from "./old-utils";\nconst x = foo();\n',
      });
      const sf = project.getSourceFileOrThrow('/src/app.ts');

      updateImportPath(sf, './old-utils', './new-utils');

      const imports = getImports(sf);
      expect(imports[0].moduleSpecifier).toBe('./new-utils');
    });

    it('does not affect imports from other modules', () => {
      const project = projectWithFiles({
        '/src/app.ts': 'import { foo } from "./utils";\nimport { bar } from "./other";\n',
      });
      const sf = project.getSourceFileOrThrow('/src/app.ts');

      updateImportPath(sf, './utils', './new-utils');

      const imports = getImports(sf);
      const specs = imports.map((i) => i.moduleSpecifier);
      expect(specs).toContain('./new-utils');
      expect(specs).toContain('./other');
    });

    it('handles multiple imports from same old path', () => {
      const project = projectWithFiles({
        '/src/app.ts': 'import { foo } from "./utils";\nimport type { Bar } from "./utils";\n',
      });
      const sf = project.getSourceFileOrThrow('/src/app.ts');

      updateImportPath(sf, './utils', './new-utils');

      const imports = getImports(sf);
      expect(imports.every((i) => i.moduleSpecifier === './new-utils')).toBe(true);
    });
  });
});
