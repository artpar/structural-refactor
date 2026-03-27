import type { CodeUnitRecord, ScanResult } from '../scanner/types.js';
import type { DetectedPattern, PatternLocation } from './types.js';
import { loc } from "./helpers.js";

export function detectStructuralPatterns(
  units: CodeUnitRecord[],
  scanResults: ScanResult[],
  filePaths: Map<string, string>,
): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];

  patterns.push(...detectFacades(units, scanResults, filePaths));
  patterns.push(...detectAdapters(units, filePaths));
  patterns.push(...detectComposites(units, filePaths));

  return patterns;
}

function detectFacades(
  units: CodeUnitRecord[],
  scanResults: ScanResult[],
  filePaths: Map<string, string>,
): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];

  // Facade: file with many imports but few exports (simplifying interface)
  for (const scan of scanResults) {
    const internalImports = scan.imports.filter((i) => !i.isExternal).length;
    const exportCount = scan.exports.length;

    // Exclude pure re-export barrels (that's barrel-module, not facade)
    const reExportCount = scan.exports.filter((e) => e.isReExport).length;
    const isBarrel = reExportCount > exportCount * 0.7;

    if (internalImports >= 4 && exportCount > 0 && exportCount <= internalImports / 3 && !isBarrel) {
      // Find the units in this file
      const fileUnits = units.filter((u) => filePaths.get(u.name) === scan.filePath);

      patterns.push({
        pattern: 'facade',
        category: 'structural',
        confidence: Math.min(0.5 + internalImports * 0.05, 0.9),
        locations: fileUnits.map((u) => loc(u, filePaths)),
        evidence: [
          `imports ${internalImports} internal modules`,
          `exports ${exportCount} items (simplifying interface)`,
        ],
        relatedUnits: fileUnits.map((u) => u.name),
      });
    }
  }

  return patterns;
}

function detectAdapters(units: CodeUnitRecord[], filePaths: Map<string, string>): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];

  for (const unit of units) {
    if (unit.kind !== 'class') continue;
    if (!unit.implements || unit.implements.length === 0) continue;

    // Adapter: implements interface AND has a constructor param of a different type
    // (wrapping another object to conform to the interface)
    if (unit.constructorParams && unit.constructorParams.length >= 1) {
      const paramTypes = unit.constructorParams.map((p) => p.type);
      const implementedTypes = unit.implements;

      // Constructor param types should differ from implemented interfaces
      const wrappedTypes = paramTypes.filter((t) => !implementedTypes.includes(t) && t !== 'unknown');

      if (wrappedTypes.length >= 1) {
        patterns.push({
          pattern: 'adapter',
          category: 'structural',
          confidence: 0.65,
          locations: [loc(unit, filePaths)],
          evidence: [
            `implements ${implementedTypes.join(', ')}`,
            `wraps ${wrappedTypes.join(', ')} via constructor`,
          ],
          relatedUnits: [unit.name, ...implementedTypes],
        });
      }
    }
  }

  return patterns;
}

function detectComposites(units: CodeUnitRecord[], filePaths: Map<string, string>): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];

  for (const unit of units) {
    if (unit.kind !== 'class') continue;

    // Composite: has a collection of its own type (or parent type)
    const selfReferencing = unit.members.filter((m) => {
      if (m.kind !== 'property') return false;
      if (!m.type) return false;
      return m.type.includes(unit.name) || m.type.includes(`${unit.name}[]`) || m.type.includes(`Array<${unit.name}>`);
    });

    if (selfReferencing.length >= 1) {
      const addMethods = unit.members.filter(
        (m) => m.kind === 'method' && (m.name.startsWith('add') || m.name.startsWith('remove')),
      );

      patterns.push({
        pattern: 'composite',
        category: 'structural',
        confidence: addMethods.length > 0 ? 0.85 : 0.6,
        locations: [loc(unit, filePaths)],
        evidence: [
          `has self-referencing field: ${selfReferencing.map((m) => m.name).join(', ')}`,
          ...(addMethods.length > 0 ? [`has add/remove methods: ${addMethods.map((m) => m.name).join(', ')}`] : []),
        ],
        relatedUnits: [unit.name],
      });
    }
  }

  return patterns;
}
