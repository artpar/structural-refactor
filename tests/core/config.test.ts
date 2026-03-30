import { describe, it, expect } from 'vitest';
import {
  type SrefConfig,
  defaultConfig,
  mergeConfig,
} from '../../src/core/config.js';

describe('SrefConfig', () => {
  describe('defaultConfig', () => {
    it('provides sensible defaults', () => {
      const cfg = defaultConfig();
      expect(cfg.tsconfig).toBe('tsconfig.json');
      expect(cfg.exclude).toEqual([]);
    });
  });

  describe('mergeConfig', () => {
    it('overrides defaults with provided values', () => {
      const cfg = mergeConfig(defaultConfig(), { tsconfig: 'tsconfig.build.json' });
      expect(cfg.tsconfig).toBe('tsconfig.build.json');
    });

    it('preserves unset defaults', () => {
      const cfg = mergeConfig(defaultConfig(), { exclude: ['vendor/**'] });
      expect(cfg.tsconfig).toBe('tsconfig.json');
      expect(cfg.exclude).toEqual(['vendor/**']);
    });

    it('merges multiple overrides', () => {
      const cfg = mergeConfig(defaultConfig(), {
        tsconfig: 'custom.json',
        exclude: ['dist/**'],
      });
      expect(cfg.tsconfig).toBe('custom.json');
      expect(cfg.exclude).toEqual(['dist/**']);
    });
  });
});
