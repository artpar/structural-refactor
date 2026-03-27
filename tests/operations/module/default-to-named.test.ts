import { describe, it, expect } from 'vitest';
import { Project } from 'ts-morph';
import { defaultToNamed } from '../../../src/operations/module/default-to-named.js';
import { createLogger, type LogEntry } from '../../../src/core/logger.js';
import { makeLogger, makeProject, parseAst } from "../../helpers/index.js";
describe('defaultToNamed', () => {
  it('converts export default function to named export', () => {
    const project = makeProject({
      '/src/utils.ts': 'export default function helper() { return 1; }\n',
      '/src/app.ts': 'import helper from "./utils";\nhelper();\n',
    });
    const { logger } = makeLogger();

    const cs = defaultToNamed(project, {
      filePath: '/src/utils.ts',
      logger,
    });

    expect(cs.files.length).toBeGreaterThanOrEqual(1);

    // Source file should have named export
    const sourceChange = cs.files.find((f) => f.path === '/src/utils.ts')!;
    expect(sourceChange).toBeDefined();
    const sf = parseAst(sourceChange.modified);
    const fn = sf.getFunction('helper');
    expect(fn).toBeDefined();
    expect(fn!.isExported()).toBe(true);
    expect(fn!.isDefaultExport()).toBe(false);

    // Importer should use named import
    const appChange = cs.files.find((f) => f.path === '/src/app.ts')!;
    expect(appChange).toBeDefined();
    const appSf = parseAst(appChange.modified);
    const imports = appSf.getImportDeclarations();
    expect(imports[0].getNamedImports().map((n) => n.getName())).toContain('helper');
    expect(imports[0].getDefaultImport()).toBeUndefined();
  });

  it('converts export default class to named export', () => {
    const project = makeProject({
      '/src/model.ts': 'export default class User { name = ""; }\n',
    });
    const { logger } = makeLogger();

    const cs = defaultToNamed(project, {
      filePath: '/src/model.ts',
      logger,
    });

    expect(cs.files).toHaveLength(1);
    const sf = parseAst(cs.files[0].modified);
    const cls = sf.getClass('User');
    expect(cls).toBeDefined();
    expect(cls!.isExported()).toBe(true);
    expect(cls!.isDefaultExport()).toBe(false);
  });

  it('returns empty changeset when no default export', () => {
    const project = makeProject({
      '/src/app.ts': 'export const x = 1;\n',
    });
    const { logger } = makeLogger();

    const cs = defaultToNamed(project, {
      filePath: '/src/app.ts',
      logger,
    });

    expect(cs.files).toHaveLength(0);
  });

  it('logs the operation', () => {
    const project = makeProject({
      '/src/app.ts': 'export default function fn() {}\n',
    });
    const { logger, entries } = makeLogger();

    defaultToNamed(project, { filePath: '/src/app.ts', logger });

    const logs = entries.filter((e) => e.scope === 'default-to-named');
    expect(logs.length).toBeGreaterThanOrEqual(1);
  });
});
