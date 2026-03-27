import { describe, it, expect } from 'vitest';
import { createErrorCollector } from '../../src/core/errors.js';

describe('ErrorCollector', () => {
  it('starts empty', () => {
    const collector = createErrorCollector();
    expect(collector.count).toBe(0);
    expect(collector.report().hasErrors).toBe(false);
    expect(collector.report().summary).toBe('no issues');
  });

  it('collects parse errors as warnings', () => {
    const collector = createErrorCollector();
    collector.addParseError('/src/bad.ts', new Error('syntax error'));

    expect(collector.count).toBe(1);
    const report = collector.report();
    expect(report.warnings).toHaveLength(1);
    expect(report.warnings[0].scope).toBe('parser');
    expect(report.warnings[0].filePath).toBe('/src/bad.ts');
    expect(report.hasErrors).toBe(false);
  });

  it('collects resolution errors as warnings', () => {
    const collector = createErrorCollector();
    collector.addResolutionError('/src/app.ts', './missing-module');

    const report = collector.report();
    expect(report.warnings).toHaveLength(1);
    expect(report.warnings[0].message).toContain('./missing-module');
  });

  it('collects operation errors as errors', () => {
    const collector = createErrorCollector();
    collector.addOperationError('rename', 'Symbol not found', 'looked in 5 files');

    const report = collector.report();
    expect(report.errors).toHaveLength(1);
    expect(report.hasErrors).toBe(true);
    expect(report.errors[0].scope).toBe('rename');
  });

  it('produces summary with counts', () => {
    const collector = createErrorCollector();
    collector.addParseError('/a.ts', 'err');
    collector.addParseError('/b.ts', 'err');
    collector.addOperationError('move', 'failed');

    const report = collector.report();
    expect(report.summary).toContain('1 error');
    expect(report.summary).toContain('2 warning');
  });

  it('add() works with arbitrary errors', () => {
    const collector = createErrorCollector();
    collector.add({ severity: 'fatal', scope: 'system', message: 'out of memory' });

    expect(collector.count).toBe(1);
    expect(collector.all[0].severity).toBe('fatal');
  });

  it('all returns a copy', () => {
    const collector = createErrorCollector();
    collector.addParseError('/a.ts', 'err');
    const all1 = collector.all;
    collector.addParseError('/b.ts', 'err');
    const all2 = collector.all;
    expect(all1.length).toBe(1);
    expect(all2.length).toBe(2);
  });
});
