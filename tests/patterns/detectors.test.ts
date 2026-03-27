import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { analyzePatterns } from '../../src/patterns/assembler.js';
import { createLogger } from '../../src/core/logger.js';

const FIXTURES = path.resolve(import.meta.dirname, '../fixtures');

function makeLogger() {
  return createLogger({ level: 'error', sink: () => {} });
}

describe('Pattern Detection', () => {
  describe('angular-project', () => {
    it('detects Angular services (@Injectable)', () => {
      const report = analyzePatterns(path.join(FIXTURES, 'angular-project'), makeLogger());
      const angularServices = report.patterns.find((p) => p.pattern === 'angular-services');
      expect(angularServices).toBeDefined();
      expect(angularServices!.relatedUnits).toContain('UserService');
    });

    it('detects Angular components (@Component)', () => {
      const report = analyzePatterns(path.join(FIXTURES, 'angular-project'), makeLogger());
      const components = report.patterns.find((p) => p.pattern === 'angular-components');
      expect(components).toBeDefined();
      expect(components!.relatedUnits).toContain('AppComponent');
    });

    it('detects dependency injection', () => {
      const report = analyzePatterns(path.join(FIXTURES, 'angular-project'), makeLogger());
      const di = report.patterns.find((p) => p.pattern === 'dependency-injection');
      expect(di).toBeDefined();
    });
  });

  describe('react-project', () => {
    it('detects React hooks', () => {
      const report = analyzePatterns(path.join(FIXTURES, 'react-project'), makeLogger());
      const hooks = report.patterns.find((p) => p.pattern === 'react-hooks');
      expect(hooks).toBeDefined();
      expect(hooks!.relatedUnits).toContain('useCounter');
    });

    it('detects React components', () => {
      const report = analyzePatterns(path.join(FIXTURES, 'react-project'), makeLogger());
      const components = report.patterns.find((p) => p.pattern === 'react-components');
      expect(components).toBeDefined();
    });
  });

  describe('simple-project', () => {
    it('detects barrel modules', () => {
      const report = analyzePatterns(path.join(FIXTURES, 'simple-project'), makeLogger());
      const barrel = report.patterns.find((p) => p.pattern === 'barrel-module');
      expect(barrel).toBeDefined();
    });
  });

  describe('self (this project)', () => {
    it('detects patterns in structural-refactor itself', () => {
      const report = analyzePatterns(path.resolve(FIXTURES, '../..'), makeLogger());
      expect(report.stats.totalPatterns).toBeGreaterThanOrEqual(1);
      expect(report.layers.length).toBeGreaterThanOrEqual(1);
    });

    it('detects factory pattern (create* functions)', () => {
      const report = analyzePatterns(path.resolve(FIXTURES, '../..'), makeLogger());
      const factories = report.patterns.filter((p) => p.pattern === 'factory');
      expect(factories.length).toBeGreaterThanOrEqual(1);
    });

    it('produces an architecture report with layers', () => {
      const report = analyzePatterns(path.resolve(FIXTURES, '../..'), makeLogger());
      expect(report.layers.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('report structure', () => {
    it('groups patterns by category', () => {
      const report = analyzePatterns(path.join(FIXTURES, 'angular-project'), makeLogger());
      expect(report.patternsByCategory).toBeDefined();
      expect(report.patternsByCategory.framework).toBeDefined();
    });

    it('computes coverage percent', () => {
      const report = analyzePatterns(path.join(FIXTURES, 'simple-project'), makeLogger());
      expect(report.stats.coveragePercent).toBeGreaterThanOrEqual(0);
      expect(report.stats.coveragePercent).toBeLessThanOrEqual(100);
    });

    it('includes project type', () => {
      const report = analyzePatterns(path.join(FIXTURES, 'react-project'), makeLogger());
      expect(report.projectType).toContain('react');
    });

    it('includes framework', () => {
      const report = analyzePatterns(path.join(FIXTURES, 'react-project'), makeLogger());
      expect(report.framework).toBe('react');
    });
  });
});
