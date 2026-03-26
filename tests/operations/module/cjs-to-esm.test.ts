import { describe, it, expect } from 'vitest';
import { Project, SyntaxKind } from 'ts-morph';
import { cjsToEsm } from '../../../src/operations/module/cjs-to-esm.js';
import { createLogger, type LogEntry } from '../../../src/core/logger.js';

function makeProject(files: Record<string, string>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [name, content] of Object.entries(files)) {
    project.createSourceFile(name, content);
  }
  return project;
}

function makeLogger() {
  const entries: LogEntry[] = [];
  const logger = createLogger({ level: 'trace', sink: (e) => entries.push(e) });
  return { logger, entries };
}

function parseAst(code: string) {
  const p = new Project({ useInMemoryFileSystem: true });
  return p.createSourceFile('/check.ts', code);
}

describe('cjsToEsm', () => {
  it('converts const x = require("mod") to import', () => {
    const code = 'const fs = require("fs");\nfs.readFileSync("a");\n';
    const project = makeProject({ '/src/app.ts': code });
    const { logger } = makeLogger();

    const cs = cjsToEsm(project, { filePath: '/src/app.ts', logger });

    expect(cs.files).toHaveLength(1);
    const sf = parseAst(cs.files[0].modified);
    const imports = sf.getImportDeclarations();
    expect(imports).toHaveLength(1);
    expect(imports[0].getModuleSpecifierValue()).toBe('fs');
    expect(imports[0].getDefaultImport()?.getText()).toBe('fs');
  });

  it('converts destructured require to named imports', () => {
    const code = 'const { readFileSync, writeFileSync } = require("fs");\n';
    const project = makeProject({ '/src/app.ts': code });
    const { logger } = makeLogger();

    const cs = cjsToEsm(project, { filePath: '/src/app.ts', logger });

    expect(cs.files).toHaveLength(1);
    const sf = parseAst(cs.files[0].modified);
    const imports = sf.getImportDeclarations();
    expect(imports).toHaveLength(1);
    const namedImports = imports[0].getNamedImports().map((n) => n.getName());
    expect(namedImports).toContain('readFileSync');
    expect(namedImports).toContain('writeFileSync');
  });

  it('converts module.exports = to export default', () => {
    const code = 'function main() { return 1; }\nmodule.exports = main;\n';
    const project = makeProject({ '/src/app.ts': code });
    const { logger } = makeLogger();

    const cs = cjsToEsm(project, { filePath: '/src/app.ts', logger });

    expect(cs.files).toHaveLength(1);
    const modified = cs.files[0].modified;
    expect(modified).toContain('export default');
    expect(modified).not.toContain('module.exports');
  });

  it('converts exports.name = to export const', () => {
    const code = 'exports.add = function(a, b) { return a + b; };\nexports.PI = 3.14;\n';
    const project = makeProject({ '/src/app.ts': code });
    const { logger } = makeLogger();

    const cs = cjsToEsm(project, { filePath: '/src/app.ts', logger });

    expect(cs.files).toHaveLength(1);
    const modified = cs.files[0].modified;
    expect(modified).toContain('export');
    expect(modified).not.toContain('exports.');
  });

  it('returns empty changeset for already-ESM file', () => {
    const code = 'import { foo } from "./bar";\nexport const x = 1;\n';
    const project = makeProject({ '/src/app.ts': code });
    const { logger } = makeLogger();

    const cs = cjsToEsm(project, { filePath: '/src/app.ts', logger });

    expect(cs.files).toHaveLength(0);
  });

  it('logs the conversion', () => {
    const code = 'const x = require("x");\n';
    const project = makeProject({ '/src/app.ts': code });
    const { logger, entries } = makeLogger();

    cjsToEsm(project, { filePath: '/src/app.ts', logger });

    const logs = entries.filter((e) => e.scope === 'cjs-to-esm');
    expect(logs.length).toBeGreaterThanOrEqual(1);
  });
});
