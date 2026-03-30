import { describe, it, expect, afterEach } from 'vitest';
import { startSpinner } from '../../src/cli/progress.js';

describe('startSpinner', () => {
  const origNoColor = process.env['NO_COLOR'];
  const origCI = process.env['CI'];

  afterEach(() => {
    if (origNoColor === undefined) delete process.env['NO_COLOR'];
    else process.env['NO_COLOR'] = origNoColor;
    if (origCI === undefined) delete process.env['CI'];
    else process.env['CI'] = origCI;
  });

  it('returns a noop spinner when NO_COLOR is set', () => {
    process.env['NO_COLOR'] = '1';
    const spinner = startSpinner('test');
    spinner.stop();
  });

  it('returns a noop spinner when CI is set', () => {
    process.env['CI'] = 'true';
    const spinner = startSpinner('test');
    spinner.stop();
  });

  it('returns a spinner with a stop method', () => {
    const spinner = startSpinner('loading...');
    expect(typeof spinner.stop).toBe('function');
    spinner.stop();
  });
});
