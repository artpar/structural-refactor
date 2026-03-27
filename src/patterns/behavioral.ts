import type { CodeUnitRecord } from '../scanner/types.js';
import type { DetectedPattern, PatternLocation } from './types.js';
import { loc } from "./helpers.js";

export function detectBehavioralPatterns(units: CodeUnitRecord[], filePaths: Map<string, string>): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];

  patterns.push(...detectObservers(units, filePaths));
  patterns.push(...detectMiddleware(units, filePaths));
  patterns.push(...detectCommands(units, filePaths));
  patterns.push(...detectStrategy(units, filePaths));

  return patterns;
}

function detectObservers(units: CodeUnitRecord[], filePaths: Map<string, string>): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];
  const observerMethods = new Set(['on', 'off', 'emit', 'addEventListener', 'removeEventListener', 'subscribe', 'unsubscribe', 'notify', 'addListener', 'removeListener']);

  for (const unit of units) {
    if (unit.kind !== 'class') continue;

    const methodNames = unit.members.filter((m) => m.kind === 'method').map((m) => m.name);
    const matchingMethods = methodNames.filter((n) => observerMethods.has(n));

    const evidence: string[] = [];
    let confidence = 0;

    if (unit.extends === 'EventEmitter' || unit.extends === 'EventTarget') {
      evidence.push(`extends ${unit.extends}`);
      confidence += 0.5;
    }

    if (matchingMethods.length >= 2) {
      evidence.push(`has observer methods: ${matchingMethods.join(', ')}`);
      confidence += 0.2 * Math.min(matchingMethods.length, 3);
    }

    if (confidence >= 0.4) {
      patterns.push({
        pattern: 'observer',
        category: 'behavioral',
        confidence: Math.min(confidence, 1.0),
        locations: [loc(unit, filePaths)],
        evidence,
        relatedUnits: [unit.name],
      });
    }
  }

  return patterns;
}

function detectMiddleware(units: CodeUnitRecord[], filePaths: Map<string, string>): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];

  for (const unit of units) {
    if (unit.kind !== 'function' && unit.kind !== 'arrow') continue;

    const params = unit.params;
    const paramNames = params.map((p) => p.name);
    const paramTypes = params.map((p) => p.type.toLowerCase());
    const evidence: string[] = [];
    let confidence = 0;

    // PRIMARY: Type-based detection — last param type contains Next/NextFunction
    const lastParamType = params.length > 0 ? params[params.length - 1].type : '';
    const hasNextType = /next|NextFunction/i.test(lastParamType);

    if (hasNextType && params.length >= 2) {
      evidence.push(`last parameter type is '${lastParamType}' (next function)`);
      confidence += 0.7;

      // Type-based Request/Response check (stronger than name-based)
      if (paramTypes.some((t) => /request|req/i.test(t))) {
        evidence.push('has Request-typed parameter');
        confidence += 0.1;
      }
    }

    // SECONDARY: Name-based (weaker signal, requires type backup or strong name match)
    if (confidence === 0 && paramNames.length === 3) {
      const hasReq = paramNames.some((n) => n === 'req' || n === 'request');
      const hasRes = paramNames.some((n) => n === 'res' || n === 'response');
      const hasNext = paramNames.some((n) => n === 'next');
      if (hasReq && hasRes && hasNext) {
        evidence.push('Express-style middleware signature (req, res, next)');
        confidence += 0.75;
      }
    }

    if (confidence === 0 && paramNames.length === 2) {
      const hasCtx = paramNames.some((n) => n === 'ctx' || n === 'context');
      const hasNext = paramNames.some((n) => n === 'next');
      if (hasCtx && hasNext) {
        evidence.push('Koa-style middleware signature (ctx, next)');
        confidence += 0.7;
      }
    }

    if (confidence >= 0.7) {
      patterns.push({
        pattern: 'middleware',
        category: 'behavioral',
        confidence: Math.min(confidence, 1.0),
        locations: [loc(unit, filePaths)],
        evidence,
        relatedUnits: [unit.name],
      });
    }
  }

  return patterns;
}

function detectCommands(units: CodeUnitRecord[], filePaths: Map<string, string>): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];
  const commandMethods = new Set(['execute', 'run', 'handle', 'invoke', 'perform']);

  for (const unit of units) {
    if (unit.kind !== 'class') continue;

    const methods = unit.members.filter((m) => m.kind === 'method').map((m) => m.name);
    const hasCommand = methods.some((m) => commandMethods.has(m));
    const hasSinglePublicMethod = methods.filter((m) => m !== 'constructor').length === 1;

    if (hasCommand && hasSinglePublicMethod) {
      const cmdMethod = methods.find((m) => commandMethods.has(m))!;
      patterns.push({
        pattern: 'command',
        category: 'behavioral',
        confidence: 0.75,
        locations: [loc(unit, filePaths)],
        evidence: [`single public method: ${cmdMethod}`],
        relatedUnits: [unit.name],
      });
    }
  }

  return patterns;
}

function detectStrategy(units: CodeUnitRecord[], filePaths: Map<string, string>): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];

  // Find interfaces with single method → potential strategy
  const singleMethodInterfaces = units.filter(
    (u) => u.kind === 'interface' && u.members.filter((m) => m.kind === 'method').length === 1,
  );

  for (const iface of singleMethodInterfaces) {
    // Find classes implementing this interface
    const implementors = units.filter(
      (u) => u.kind === 'class' && u.implements?.includes(iface.name),
    );

    if (implementors.length >= 2) {
      patterns.push({
        pattern: 'strategy',
        category: 'behavioral',
        confidence: 0.8,
        locations: [loc(iface, filePaths), ...implementors.map((u) => loc(u, filePaths))],
        evidence: [
          `interface ${iface.name} with single method`,
          `${implementors.length} implementations: ${implementors.map((u) => u.name).join(', ')}`,
        ],
        relatedUnits: [iface.name, ...implementors.map((u) => u.name)],
      });
    }
  }

  return patterns;
}
