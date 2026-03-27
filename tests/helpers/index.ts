/**
 * Shared test helpers — single source of truth.
 * Previously duplicated 69 times across 30+ test files.
 */
import { Project } from 'ts-morph';
import { createLogger, type LogEntry, type Logger } from '../../src/core/logger.js';

/** Create a test logger that captures entries for assertions */
export function makeLogger(): { logger: Logger; entries: LogEntry[] } {
  const entries: LogEntry[] = [];
  const logger = createLogger({ level: 'trace', sink: (e) => entries.push(e) });
  return { logger, entries };
}

/** Create an in-memory ts-morph Project with the given files */
export function makeProject(files: Record<string, string>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [name, content] of Object.entries(files)) {
    project.createSourceFile(name, content);
  }
  return project;
}

/** Parse code into a ts-morph SourceFile for verification */
export function parseAst(code: string) {
  const p = new Project({ useInMemoryFileSystem: true });
  return p.createSourceFile('/check.ts', code);
}
