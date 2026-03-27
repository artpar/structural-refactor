/**
 * Creational pattern detectors.
 * Based on GEML structural operators (arxiv:2401.07042):
 * - Factory: requires createObj (NewExpression) + project-type return
 * - Singleton: requires private constructor + static self-typed field
 * - Builder: requires fluent setters + build method
 *
 * Names are weak signals (0.1 max), NOT primary indicators.
 */
import type { CodeUnitRecord } from '../scanner/types.js';
import type { DetectedPattern, PatternLocation } from './types.js';
import {
  containsNewExpression,
  returnTypeIsProjectType,
  isExcludedReturnType,
  isReactHook,
  isTestFile,
} from './helpers.js';

export function detectCreationalPatterns(units: CodeUnitRecord[], filePaths: Map<string, string>): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];

  patterns.push(...detectSingletons(units, filePaths));
  patterns.push(...detectFactories(units, filePaths));
  patterns.push(...detectBuilders(units, filePaths));

  return patterns;
}

function detectSingletons(units: CodeUnitRecord[], filePaths: Map<string, string>): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];

  for (const unit of units) {
    if (unit.kind !== 'class') continue;

    const hasPrivateConstructor = unit.members.some(
      (m) => m.kind === 'constructor' && m.visibility === 'private',
    );
    const hasStaticInstance = unit.members.some(
      (m) => m.isStatic && m.kind === 'property' && (m.name === 'instance' || m.name === '_instance'),
    );
    const hasGetInstance = unit.members.some(
      (m) => m.isStatic && m.kind === 'method' && (m.name === 'getInstance' || m.name === 'instance'),
    );

    // Require private constructor as mandatory structural signal
    if (!hasPrivateConstructor) continue;

    const evidence: string[] = ['private constructor'];
    let confidence = 0.4;

    if (hasStaticInstance) { evidence.push('static instance field'); confidence += 0.3; }
    if (hasGetInstance) { evidence.push('static getInstance method'); confidence += 0.25; }

    patterns.push({
      pattern: 'singleton',
      category: 'creational',
      confidence: Math.min(confidence, 1.0),
      locations: [loc(unit, filePaths)],
      evidence,
      relatedUnits: [unit.name],
    });
  }

  return patterns;
}

function detectFactories(units: CodeUnitRecord[], filePaths: Map<string, string>): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];
  const factoryNamePattern = /^(create|make|build|from|of)[A-Z]/;

  for (const unit of units) {
    if (unit.kind !== 'function' && unit.kind !== 'arrow') continue;

    const fp = filePaths.get(unit.name) ?? '';

    // Hard exclusions — these are never factories
    if (isTestFile(fp)) continue;
    if (isReactHook(unit.name)) continue;
    if (isExcludedReturnType(unit.returnType)) continue;

    // PRIMARY SIGNAL: structural — body contains NewExpression (createObj operator)
    const hasNewExpr = containsNewExpression(unit);

    // PRIMARY SIGNAL: return type is a project-defined class/interface/type
    const returnsProjectType = returnTypeIsProjectType(unit.returnType, units);

    // Without at least one structural signal, skip entirely
    if (!hasNewExpr && !returnsProjectType) continue;

    const evidence: string[] = [];
    let confidence = 0;

    // Structural signals (primary — high weight)
    if (hasNewExpr) {
      evidence.push('creates object instances (NewExpression in body)');
      confidence += 0.4;
    }

    if (returnsProjectType) {
      evidence.push(`returns project type: ${unit.returnType}`);
      confidence += 0.3;
    }

    // Behavioral signal: conditional construction (multiple paths)
    if (unit.complexity >= 2 && hasNewExpr) {
      evidence.push('conditional construction logic');
      confidence += 0.15;
    }

    // Name is a WEAK signal — only a small boost
    if (factoryNamePattern.test(unit.name)) {
      evidence.push(`name matches factory pattern: ${unit.name}`);
      confidence += 0.1;
    }

    // Minimum threshold: need at least one strong structural signal
    if (confidence >= 0.4) {
      patterns.push({
        pattern: 'factory',
        category: 'creational',
        confidence: Math.min(confidence, 1.0),
        locations: [loc(unit, filePaths)],
        evidence,
        relatedUnits: [unit.name],
      });
    }
  }

  return patterns;
}

function detectBuilders(units: CodeUnitRecord[], filePaths: Map<string, string>): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];

  for (const unit of units) {
    if (unit.kind !== 'class') continue;

    const chainMethods = unit.members.filter(
      (m) => m.kind === 'method' && m.name !== 'constructor',
    );
    const hasBuild = chainMethods.some((m) => m.name === 'build' || m.name === 'create' || m.name === 'make');
    const hasSetters = chainMethods.filter(
      (m) => m.name.startsWith('set') || m.name.startsWith('with') || m.name.startsWith('add'),
    );

    if (hasBuild && hasSetters.length >= 2) {
      patterns.push({
        pattern: 'builder',
        category: 'creational',
        confidence: 0.8,
        locations: [loc(unit, filePaths)],
        evidence: [
          'has build/create method',
          `has ${hasSetters.length} setter/with methods: ${hasSetters.map((m) => m.name).join(', ')}`,
        ],
        relatedUnits: [unit.name],
      });
    }
  }

  return patterns;
}

function loc(unit: CodeUnitRecord, filePaths: Map<string, string>): PatternLocation {
  return { filePath: filePaths.get(unit.name) ?? '', unitName: unit.name, line: unit.line };
}
