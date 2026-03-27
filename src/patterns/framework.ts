import type { CodeUnitRecord } from '../scanner/types.js';
import type { DetectedPattern, PatternLocation } from './types.js';
import { isTestFile, loc } from './helpers.js';

export function detectFrameworkPatterns(units: CodeUnitRecord[], filePaths: Map<string, string>): DetectedPattern[] {
  // Filter out test files from framework pattern detection
  const sourceUnits = units.filter((u) => !isTestFile(filePaths.get(u.name) ?? ''));
  const patterns: DetectedPattern[] = [];

  patterns.push(...detectReactPatterns(sourceUnits, filePaths));
  patterns.push(...detectAngularPatterns(sourceUnits, filePaths));

  return patterns;
}

function detectReactPatterns(units: CodeUnitRecord[], filePaths: Map<string, string>): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];

  // React hooks: exported functions named use*
  const hooks = units.filter(
    (u) => (u.kind === 'function' || u.kind === 'arrow') && u.name.startsWith('use') && u.name.length > 3,
  );

  if (hooks.length > 0) {
    patterns.push({
      pattern: 'react-hooks',
      category: 'framework',
      confidence: 0.95,
      locations: hooks.map((h) => loc(h, filePaths)),
      evidence: [`${hooks.length} custom hooks: ${hooks.map((h) => h.name).join(', ')}`],
      relatedUnits: hooks.map((h) => h.name),
    });
  }

  // React components: functions returning JSX (detected by nodeTypes containing JSX*)
  const components = units.filter((u) => {
    if (u.kind !== 'function' && u.kind !== 'arrow') return false;
    return u.nodeTypes.some((t) => t.startsWith('JSX'));
  });

  if (components.length > 0) {
    patterns.push({
      pattern: 'react-components',
      category: 'framework',
      confidence: 0.9,
      locations: components.map((c) => loc(c, filePaths)),
      evidence: [`${components.length} components: ${components.slice(0, 10).map((c) => c.name).join(', ')}${components.length > 10 ? '...' : ''}`],
      relatedUnits: components.map((c) => c.name),
    });
  }

  // HOC pattern: functions that take a component and return a component
  const hocs = units.filter((u) => {
    if (u.kind !== 'function' && u.kind !== 'arrow') return false;
    if (!u.name.startsWith('with') || u.name.length <= 4) return false;
    return u.params.length >= 1;
  });

  if (hocs.length > 0) {
    patterns.push({
      pattern: 'react-hoc',
      category: 'framework',
      confidence: 0.7,
      locations: hocs.map((h) => loc(h, filePaths)),
      evidence: [`${hocs.length} HOCs: ${hocs.map((h) => h.name).join(', ')}`],
      relatedUnits: hocs.map((h) => h.name),
    });
  }

  return patterns;
}

function detectAngularPatterns(units: CodeUnitRecord[], filePaths: Map<string, string>): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];

  // Angular services: classes with @Injectable decorator
  const services = units.filter(
    (u) => u.kind === 'class' && u.decorators?.some((d) => d.name === 'Injectable'),
  );

  if (services.length > 0) {
    patterns.push({
      pattern: 'angular-services',
      category: 'framework',
      confidence: 0.95,
      locations: services.map((s) => loc(s, filePaths)),
      evidence: [`${services.length} injectable services: ${services.map((s) => s.name).join(', ')}`],
      relatedUnits: services.map((s) => s.name),
    });
  }

  // Angular components: classes with @Component decorator
  const components = units.filter(
    (u) => u.kind === 'class' && u.decorators?.some((d) => d.name === 'Component'),
  );

  if (components.length > 0) {
    patterns.push({
      pattern: 'angular-components',
      category: 'framework',
      confidence: 0.95,
      locations: components.map((c) => loc(c, filePaths)),
      evidence: [`${components.length} components: ${components.map((c) => c.name).join(', ')}`],
      relatedUnits: components.map((c) => c.name),
    });
  }

  // Angular modules: classes with @NgModule decorator
  const modules = units.filter(
    (u) => u.kind === 'class' && u.decorators?.some((d) => d.name === 'NgModule'),
  );

  if (modules.length > 0) {
    patterns.push({
      pattern: 'angular-modules',
      category: 'framework',
      confidence: 0.95,
      locations: modules.map((m) => loc(m, filePaths)),
      evidence: [`${modules.length} modules: ${modules.map((m) => m.name).join(', ')}`],
      relatedUnits: modules.map((m) => m.name),
    });
  }

  return patterns;
}
