import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { Project } from 'ts-morph';
import { deduplicate } from '../../../src/operations/quality/deduplicate.js';
import { makeLogger } from '../../helpers/index.js';

const FIXTURES = path.resolve(import.meta.dirname, '../../fixtures/dedup-project/src');

function loadProject(...fileNames: string[]): Project {
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { strict: false, skipLibCheck: true },
  });
  for (const name of fileNames) {
    project.addSourceFileAtPath(path.join(FIXTURES, name));
  }
  return project;
}

describe('deduplicate', { timeout: 30_000 }, () => {
  it('replaces duplicate function definitions with imports from canonical', () => {
    const project = loadProject('canonical.ts', 'feature-a.ts', 'feature-b.ts');
    const { logger } = makeLogger();

    const cs = deduplicate(project, {
      symbolName: 'formatDate',
      canonicalFile: path.join(FIXTURES, 'canonical.ts'),
      logger,
    });

    expect(cs.files.length).toBeGreaterThanOrEqual(2);
    const changedPaths = cs.files.map((f) => path.basename(f.path));
    expect(changedPaths).toContain('feature-a.ts');
    expect(changedPaths).toContain('feature-b.ts');

    for (const file of cs.files) {
      expect(file.modified).toContain('import');
      expect(file.modified).toContain('formatDate');
      expect(file.modified).not.toMatch(/function formatDate/);
    }
  });

  it('returns precondition failure when canonical file not in project', () => {
    const project = loadProject('feature-a.ts');
    const { logger } = makeLogger();

    const cs = deduplicate(project, {
      symbolName: 'formatDate',
      canonicalFile: '/nonexistent/canonical.ts',
      logger,
    });

    expect(cs.description).toContain('Precondition failed');
    expect(cs.files).toHaveLength(0);
  });

  it('returns precondition failure when symbol not found in canonical', () => {
    const project = loadProject('canonical.ts', 'feature-a.ts');
    const { logger } = makeLogger();

    const cs = deduplicate(project, {
      symbolName: 'nonExistentSymbol',
      canonicalFile: path.join(FIXTURES, 'canonical.ts'),
      logger,
    });

    expect(cs.description).toContain('Precondition failed');
    expect(cs.files).toHaveLength(0);
  });

  it('returns no changes when no duplicates exist', () => {
    const project = loadProject('canonical.ts', 'no-dupes.ts');
    const { logger } = makeLogger();

    const cs = deduplicate(project, {
      symbolName: 'formatDate',
      canonicalFile: path.join(FIXTURES, 'canonical.ts'),
      logger,
    });

    expect(cs.files).toHaveLength(0);
  });

  it('skips files with incompatible function signatures', () => {
    const project = loadProject('canonical.ts', 'feature-a.ts', 'feature-c.ts');
    const { logger, entries } = makeLogger();

    const cs = deduplicate(project, {
      symbolName: 'formatDate',
      canonicalFile: path.join(FIXTURES, 'canonical.ts'),
      logger,
    });

    const changedPaths = cs.files.map((f) => path.basename(f.path));
    expect(changedPaths).toContain('feature-a.ts');
    expect(changedPaths).not.toContain('feature-c.ts');

    const warnings = entries.filter((e) => e.level === 'warn' && e.scope === 'deduplicate');
    expect(warnings.length).toBeGreaterThanOrEqual(1);
  });

  it('handles duplicate interface declarations', () => {
    const project = loadProject('canonical.ts', 'types-a.ts');
    const { logger } = makeLogger();

    const cs = deduplicate(project, {
      symbolName: 'Config',
      canonicalFile: path.join(FIXTURES, 'canonical.ts'),
      logger,
    });

    expect(cs.files.length).toBeGreaterThanOrEqual(1);
    const typesChange = cs.files.find((f) => path.basename(f.path) === 'types-a.ts');
    expect(typesChange).toBeDefined();
    expect(typesChange!.modified).toContain('import');
    expect(typesChange!.modified).toContain('Config');
  });

  it('handles duplicate enum declarations', () => {
    const project = loadProject('canonical.ts', 'types-b.ts');
    const { logger } = makeLogger();

    const cs = deduplicate(project, {
      symbolName: 'Mode',
      canonicalFile: path.join(FIXTURES, 'canonical.ts'),
      logger,
    });

    expect(cs.files.length).toBeGreaterThanOrEqual(1);
    const typesChange = cs.files.find((f) => path.basename(f.path) === 'types-b.ts');
    expect(typesChange).toBeDefined();
    expect(typesChange!.modified).toContain('import');
    expect(typesChange!.modified).toContain('Mode');
  });

  it('respects scope option to limit search', () => {
    const project = loadProject('canonical.ts', 'feature-a.ts', 'feature-b.ts');
    const { logger } = makeLogger();

    const cs = deduplicate(project, {
      symbolName: 'formatDate',
      canonicalFile: path.join(FIXTURES, 'canonical.ts'),
      scope: 'feature-a',
      logger,
    });

    const changedPaths = cs.files.map((f) => path.basename(f.path));
    expect(changedPaths).toContain('feature-a.ts');
    expect(changedPaths).not.toContain('feature-b.ts');
  });

  it('logs deduplication activity', () => {
    const project = loadProject('canonical.ts', 'feature-a.ts');
    const { logger, entries } = makeLogger();

    deduplicate(project, {
      symbolName: 'formatDate',
      canonicalFile: path.join(FIXTURES, 'canonical.ts'),
      logger,
    });

    const dedupLogs = entries.filter((e) => e.scope === 'deduplicate');
    expect(dedupLogs.length).toBeGreaterThanOrEqual(1);
  });
});
