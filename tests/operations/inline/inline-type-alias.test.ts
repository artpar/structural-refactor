import { describe, it, expect } from 'vitest';
import { Project } from 'ts-morph';
import { inlineTypeAlias } from '../../../src/operations/inline/inline-type-alias.js';
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

describe('inlineTypeAlias', () => {
  it('replaces type alias usages with its definition', () => {
    const code = 'type ID = string;\nconst userId: ID = "abc";\nfunction getUser(id: ID) { return id; }\n';
    const project = makeProject({ '/src/app.ts': code });
    const { logger } = makeLogger();

    const cs = inlineTypeAlias(project, {
      filePath: '/src/app.ts',
      line: 1,
      col: 6, // 'ID'
      logger,
    });

    expect(cs.files).toHaveLength(1);
    const modified = cs.files[0].modified;
    // Type alias should be removed
    expect(modified).not.toContain('type ID');
    // Usages should be replaced with 'string'
    expect(modified).toContain('userId: string');
    expect(modified).toContain('id: string');
  });

  it('returns empty changeset for non-type-alias', () => {
    const project = makeProject({ '/src/app.ts': 'const x = 1;\n' });
    const { logger } = makeLogger();

    const cs = inlineTypeAlias(project, {
      filePath: '/src/app.ts',
      line: 1,
      col: 7,
      logger,
    });

    expect(cs.files).toHaveLength(0);
  });

  it('logs the operation', () => {
    const code = 'type ID = string;\nconst x: ID = "a";\n';
    const project = makeProject({ '/src/app.ts': code });
    const { logger, entries } = makeLogger();

    inlineTypeAlias(project, {
      filePath: '/src/app.ts',
      line: 1,
      col: 6,
      logger,
    });

    const logs = entries.filter((e) => e.scope === 'inline-type-alias');
    expect(logs.length).toBeGreaterThanOrEqual(1);
  });
});
