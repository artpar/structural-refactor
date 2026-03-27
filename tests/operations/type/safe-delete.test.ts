import { describe, it, expect } from 'vitest';
import { Project } from 'ts-morph';
import { safeDelete } from '../../../src/operations/type/safe-delete.js';
import { createLogger, type LogEntry } from '../../../src/core/logger.js';
import { makeLogger, makeProject, parseAst } from "../../helpers/index.js";
describe('safeDelete', () => {
  it('deletes an unreferenced function', () => {
    const project = makeProject({
      '/src/app.ts': 'function unused() { return 1; }\nconst x = 42;\n',
    });
    const { logger } = makeLogger();

    const cs = safeDelete(project, {
      filePath: '/src/app.ts',
      symbolName: 'unused',
      logger,
    });

    expect(cs.files).toHaveLength(1);
    const sf = parseAst(cs.files[0].modified);
    expect(sf.getFunction('unused')).toBeUndefined();
    expect(sf.getVariableDeclaration('x')).toBeDefined();
  });

  it('refuses to delete a referenced symbol', () => {
    const project = makeProject({
      '/src/app.ts': 'function used() { return 1; }\nconst x = used();\n',
    });
    const { logger } = makeLogger();

    const cs = safeDelete(project, {
      filePath: '/src/app.ts',
      symbolName: 'used',
      logger,
    });

    expect(cs.files).toHaveLength(0);
  });

  it('refuses to delete an exported symbol with importers', () => {
    const project = makeProject({
      '/src/utils.ts': 'export function helper() { return 1; }\n',
      '/src/app.ts': 'import { helper } from "./utils";\nhelper();\n',
    });
    const { logger } = makeLogger();

    const cs = safeDelete(project, {
      filePath: '/src/utils.ts',
      symbolName: 'helper',
      logger,
    });

    expect(cs.files).toHaveLength(0);
  });

  it('deletes an unreferenced type alias', () => {
    const project = makeProject({
      '/src/app.ts': 'type Unused = string;\nconst x = 1;\n',
    });
    const { logger } = makeLogger();

    const cs = safeDelete(project, {
      filePath: '/src/app.ts',
      symbolName: 'Unused',
      logger,
    });

    expect(cs.files).toHaveLength(1);
    const sf = parseAst(cs.files[0].modified);
    expect(sf.getTypeAlias('Unused')).toBeUndefined();
  });

  it('deletes an unreferenced interface', () => {
    const project = makeProject({
      '/src/app.ts': 'interface IUnused { x: number; }\nconst y = 1;\n',
    });
    const { logger } = makeLogger();

    const cs = safeDelete(project, {
      filePath: '/src/app.ts',
      symbolName: 'IUnused',
      logger,
    });

    expect(cs.files).toHaveLength(1);
  });

  it('returns empty changeset for nonexistent symbol', () => {
    const project = makeProject({ '/src/app.ts': 'const x = 1;\n' });
    const { logger } = makeLogger();

    const cs = safeDelete(project, {
      filePath: '/src/app.ts',
      symbolName: 'nope',
      logger,
    });

    expect(cs.files).toHaveLength(0);
  });

  it('logs the operation', () => {
    const project = makeProject({ '/src/app.ts': 'function f() {}\n' });
    const { logger, entries } = makeLogger();

    safeDelete(project, { filePath: '/src/app.ts', symbolName: 'f', logger });

    const logs = entries.filter((e) => e.scope === 'safe-delete');
    expect(logs.length).toBeGreaterThanOrEqual(1);
  });
});
