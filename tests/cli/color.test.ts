import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { colorDiff, errorText, warnText, successText, dimText } from '../../src/cli/color.js';

describe('color utilities', () => {
  const origNoColor = process.env['NO_COLOR'];

  afterEach(() => {
    if (origNoColor === undefined) {
      delete process.env['NO_COLOR'];
    } else {
      process.env['NO_COLOR'] = origNoColor;
    }
  });

  describe('with NO_COLOR set', () => {
    beforeEach(() => {
      process.env['NO_COLOR'] = '1';
    });

    it('colorDiff returns plain text', () => {
      const diff = '--- a/file.ts\n+++ b/file.ts\n@@ -1 +1 @@\n-old\n+new\n';
      expect(colorDiff(diff)).toBe(diff);
    });

    it('errorText returns plain text', () => {
      expect(errorText('fail')).toBe('fail');
    });

    it('warnText returns plain text', () => {
      expect(warnText('caution')).toBe('caution');
    });

    it('successText returns plain text', () => {
      expect(successText('ok')).toBe('ok');
    });

    it('dimText returns plain text', () => {
      expect(dimText('faded')).toBe('faded');
    });
  });

  describe('colorDiff line handling', () => {
    beforeEach(() => {
      delete process.env['NO_COLOR'];
    });

    it('returns empty string for empty input', () => {
      expect(colorDiff('')).toBe('');
    });

    it('preserves context lines unchanged (no color or passthrough)', () => {
      const line = ' unchanged line';
      const result = colorDiff(line);
      // Context lines should contain the original text
      expect(result).toContain('unchanged line');
    });
  });
});
