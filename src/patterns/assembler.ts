/**
 * Pattern assembler: combines all detectors into an ArchitectureReport.
 * Uses Level 1 index for architectural/structural patterns (imports/exports only).
 * Uses Level 2 deep analysis (extractAll) only for creational/behavioral/framework
 * patterns that need code unit details (members, decorators, etc.).
 */
import fs from 'node:fs';
import type { Logger } from '../core/logger.js';
import type { ScanResult, CodeUnitRecord } from '../scanner/types.js';
import { extractAll } from '../scanner/extractors.js';
import { detectProject } from '../analysis/project-detector.js';
import { buildProjectIndex } from '../scanner/index-store.js';
import { detectCreationalPatterns } from './creational.js';
import { detectBehavioralPatterns } from './behavioral.js';
import { detectStructuralPatterns } from './structural.js';
import { detectArchitecturalPatterns, detectLayers } from './architectural.js';
import { detectFrameworkPatterns } from './framework.js';
import type { ArchitectureReport, DetectedPattern, PatternCategory } from './types.js';

export function analyzePatterns(rootDir: string, logger: Logger): ArchitectureReport {
  logger.info('patterns', 'analyzing architecture patterns', { rootDir });
  const startMs = performance.now();

  const projectInfo = detectProject(rootDir, logger);

  // Level 1: fast index for architectural patterns (imports/exports)
  const index = buildProjectIndex(rootDir, logger);

  // Build ScanResult-like structures from index for structural/architectural detectors
  const scanResults: ScanResult[] = [];
  for (const [filePath, summary] of index.summaries) {
    scanResults.push({
      filePath,
      contentHash: '',
      imports: summary.imports.map((i) => ({
        source: i.source,
        specifiers: i.specifiers,
        resolved: '',
        isExternal: !i.source.startsWith('.'),
      })),
      exports: summary.exports.map((name) => ({
        name,
        isDefault: name === 'default',
        isReExport: (summary.reExports ?? []).includes(name),
      })),
      codeUnits: [],
      calls: [],
    });
  }

  // Level 2: deep analysis for creational/behavioral/framework (needs code units)
  const allUnits: CodeUnitRecord[] = [];
  const filePaths = new Map<string, string>();

  logger.info('patterns', 'deep-analyzing files for pattern detection', { fileCount: index.summaries.size });
  for (const [filePath] of index.summaries) {
    try {
      const sourceText = fs.readFileSync(filePath, 'utf-8');
      const result = extractAll(filePath, sourceText, '');
      for (const unit of result.codeUnits) {
        allUnits.push(unit);
        filePaths.set(unit.name, filePath);
      }
    } catch {
      // Parse failure — skip
    }
  }

  // Run all detectors
  const allPatterns: DetectedPattern[] = [
    ...detectCreationalPatterns(allUnits, filePaths),
    ...detectBehavioralPatterns(allUnits, filePaths),
    ...detectStructuralPatterns(allUnits, scanResults, filePaths),
    ...detectArchitecturalPatterns(allUnits, scanResults, filePaths, rootDir),
    ...detectFrameworkPatterns(allUnits, filePaths),
  ];

  allPatterns.sort((a, b) => b.confidence - a.confidence);

  const byCategory: Record<PatternCategory, DetectedPattern[]> = {
    creational: [], structural: [], behavioral: [], architectural: [], framework: [],
  };
  for (const p of allPatterns) byCategory[p.category].push(p);

  const byCategoryCount: Record<string, number> = {};
  for (const [cat, pats] of Object.entries(byCategory)) {
    if (pats.length > 0) byCategoryCount[cat] = pats.length;
  }

  const filesInPatterns = new Set<string>();
  for (const p of allPatterns) {
    for (const loc of p.locations) {
      if (loc.filePath) filesInPatterns.add(loc.filePath);
    }
  }

  const layers = detectLayers(scanResults, rootDir);
  for (const layer of layers) {
    const layerPats = new Set<string>();
    for (const p of allPatterns) {
      for (const loc of p.locations) {
        if (layer.files.includes(loc.filePath)) layerPats.add(p.pattern);
      }
    }
    layer.patterns = [...layerPats];
  }

  const durationMs = Math.round(performance.now() - startMs);
  logger.info('patterns', 'pattern analysis complete', {
    totalPatterns: allPatterns.length, byCategory: byCategoryCount, durationMs,
  });

  return {
    projectType: projectInfo.types.join(', '),
    framework: projectInfo.framework,
    layers,
    patterns: allPatterns,
    patternsByCategory: byCategory,
    stats: {
      totalPatterns: allPatterns.length,
      byCategory: byCategoryCount,
      coveragePercent: index.summaries.size > 0 ? Math.round((filesInPatterns.size / index.summaries.size) * 100) : 0,
    },
  };
}
