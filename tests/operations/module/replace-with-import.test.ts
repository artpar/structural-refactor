import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { Project } from 'ts-morph';
import { replaceWithImport } from '../../../src/operations/module/replace-with-import.js';
import { makeLogger } from '../../helpers/index.js';

const FIXTURES = path.resolve(import.meta.dirname, '../../fixtures/replace-import-project/src');

function loadProject(...fileNames: string[]): Project {
  const project = new Project({ skipAddingFilesFromTsConfig: true });
  for (const name of fileNames) {
    project.addSourceFileAtPath(path.join(FIXTURES, name));
  }
  return project;
}

describe('replaceWithImport', { timeout: 30_000 }, () => {
  it('replaces local function with import', () => {
    const project = loadProject('consumer.ts');
    const { logger } = makeLogger();
    const cs = replaceWithImport(project, {
      filePath: path.join(FIXTURES, 'consumer.ts'),
      symbolName: 'formatName',
      fromModule: './helpers.js',
      logger,
    });
    expect(cs.files).toHaveLength(1);
    expect(cs.files[0].modified).toContain('import { formatName } from');
    expect(cs.files[0].modified).not.toMatch(/function formatName/);
  });

  it('adds to existing import when file already imports from module', () => {
    const project = loadProject('already-imports.ts');
    const { logger } = makeLogger();
    const cs = replaceWithImport(project, {
      filePath: path.join(FIXTURES, 'already-imports.ts'),
      symbolName: 'formatName',
      fromModule: './helpers',
      logger,
    });
    expect(cs.files).toHaveLength(1);
    // Should have both toUpper and formatName in the import
    expect(cs.files[0].modified).toContain('toUpper');
    expect(cs.files[0].modified).toContain('formatName');
    expect(cs.files[0].modified).not.toMatch(/function formatName/);
  });

  it('refuses to replace exported function', () => {
    const project = loadProject('exported-fn.ts');
    const { logger } = makeLogger();
    const cs = replaceWithImport(project, {
      filePath: path.join(FIXTURES, 'exported-fn.ts'),
      symbolName: 'formatName',
      fromModule: './helpers.js',
      logger,
    });
    expect(cs.description).toContain('Precondition failed');
    expect(cs.files).toHaveLength(0);
  });

  it('returns precondition failure for missing file', () => {
    const project = loadProject('consumer.ts');
    const { logger } = makeLogger();
    const cs = replaceWithImport(project, {
      filePath: '/nonexistent.ts',
      symbolName: 'formatName',
      fromModule: './helpers.js',
      logger,
    });
    expect(cs.description).toContain('Precondition failed');
  });

  it('returns precondition failure for missing symbol', () => {
    const project = loadProject('consumer.ts');
    const { logger } = makeLogger();
    const cs = replaceWithImport(project, {
      filePath: path.join(FIXTURES, 'consumer.ts'),
      symbolName: 'nonexistent',
      fromModule: './helpers.js',
      logger,
    });
    expect(cs.description).toContain('Precondition failed');
  });

  it('logs the operation', () => {
    const project = loadProject('consumer.ts');
    const { logger, entries } = makeLogger();
    replaceWithImport(project, {
      filePath: path.join(FIXTURES, 'consumer.ts'),
      symbolName: 'formatName',
      fromModule: './helpers.js',
      logger,
    });
    const logs = entries.filter((e) => e.scope === 'replace-with-import');
    expect(logs.length).toBeGreaterThanOrEqual(1);
  });
});
