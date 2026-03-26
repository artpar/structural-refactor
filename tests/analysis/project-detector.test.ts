import { describe, it, expect } from 'vitest';
import path from 'node:path';
import {
  detectProject,
  type ProjectInfo,
  type ProjectType,
} from '../../src/analysis/project-detector.js';
import { createLogger } from '../../src/core/logger.js';

const FIXTURES = path.resolve(import.meta.dirname, '../fixtures');

function makeLogger() {
  return createLogger({ level: 'trace', sink: () => {} });
}

describe('detectProject', () => {
  it('detects a React project', () => {
    const info = detectProject(path.join(FIXTURES, 'react-project'), makeLogger());
    expect(info.types).toContain('react');
    expect(info.framework).toBe('react');
    expect(info.hasTypeScript).toBe(true);
    expect(info.packageName).toBe('my-react-app');
  });

  it('detects an Angular project', () => {
    const info = detectProject(path.join(FIXTURES, 'angular-project'), makeLogger());
    expect(info.types).toContain('angular');
    expect(info.framework).toBe('angular');
  });

  it('detects a Chrome extension', () => {
    const info = detectProject(path.join(FIXTURES, 'chrome-extension'), makeLogger());
    expect(info.types).toContain('chrome-extension');
  });

  it('detects a monorepo', () => {
    const info = detectProject(path.join(FIXTURES, 'monorepo'), makeLogger());
    expect(info.types).toContain('monorepo');
    expect(info.workspacePackages!.length).toBeGreaterThanOrEqual(2);
  });

  it('extracts dependency info from package.json', () => {
    const info = detectProject(path.join(FIXTURES, 'react-project'), makeLogger());
    expect(info.dependencies).toBeDefined();
    expect(info.dependencies!.production).toContain('react');
    expect(info.dependencies!.production).toContain('react-dom');
    expect(info.dependencies!.dev).toContain('typescript');
  });

  it('detects path aliases from tsconfig', () => {
    const info = detectProject(path.join(FIXTURES, 'react-project'), makeLogger());
    expect(info.pathAliases).toBeDefined();
    expect(info.pathAliases!['@/*']).toBeDefined();
    expect(info.pathAliases!['@components/*']).toBeDefined();
  });

  it('returns basic info for simple project', () => {
    const info = detectProject(path.join(FIXTURES, 'simple-project'), makeLogger());
    expect(info.types).toContain('node');
    expect(info.framework).toBeUndefined();
  });
});
