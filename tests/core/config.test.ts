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
      expect(cfg.plugins).toEqual([]);
      expect(cfg.exclude).toEqual([]);
    });
  });

  describe('mergeConfig', () => {
    it('overrides defaults with provided values', () => {
      const cfg = mergeConfig(defaultConfig(), { tsconfig: 'tsconfig.build.json' });
      expect(cfg.tsconfig).toBe('tsconfig.build.json');
    });

    it('preserves unset defaults', () => {
      const cfg = mergeConfig(defaultConfig(), { plugins: ['react'] });
      expect(cfg.tsconfig).toBe('tsconfig.json');
      expect(cfg.plugins).toEqual(['react']);
    });

    it('merges multiple overrides', () => {
      const cfg = mergeConfig(defaultConfig(), {
        tsconfig: 'custom.json',
        plugins: ['react'],
        exclude: ['dist/**'],
      });
      expect(cfg.tsconfig).toBe('custom.json');
      expect(cfg.plugins).toEqual(['react']);
      expect(cfg.exclude).toEqual(['dist/**']);
    });
  });
});
