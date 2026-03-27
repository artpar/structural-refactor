import type { CodeUnitRecord } from '../scanner/types.js';
import type { DetectedPattern, PatternLocation } from './types.js';

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

    const evidence: string[] = [];
    let confidence = 0;

    if (hasPrivateConstructor) { evidence.push('private constructor'); confidence += 0.35; }
    if (hasStaticInstance) { evidence.push('static instance field'); confidence += 0.3; }
    if (hasGetInstance) { evidence.push('static getInstance method'); confidence += 0.3; }

    if (confidence >= 0.3) {
      patterns.push({
        pattern: 'singleton',
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

function detectFactories(units: CodeUnitRecord[], filePaths: Map<string, string>): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];
  const factoryPattern = /^(create|make|build|from|of|new)[A-Z]/;

  for (const unit of units) {
    if (unit.kind !== 'function' && unit.kind !== 'arrow') continue;

    const evidence: string[] = [];
    let confidence = 0;

    if (factoryPattern.test(unit.name)) {
      evidence.push(`name matches factory pattern: ${unit.name}`);
      confidence += 0.5;
    }

    if (unit.returnType && !['void', 'string', 'number', 'boolean', 'undefined'].includes(unit.returnType)) {
      evidence.push(`returns object type: ${unit.returnType}`);
      confidence += 0.3;
    }

    if (unit.complexity >= 2 && unit.returnType) {
      evidence.push('conditional construction logic');
      confidence += 0.2;
    }

    if (confidence >= 0.5) {
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

    // Builder pattern: class with methods returning `this` or the class type, + a build() method
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
