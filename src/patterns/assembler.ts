import fs from 'node:fs';
import type { Logger } from '../core/logger.js';
import type { ScanResult, CodeUnitRecord } from '../scanner/types.js';
import { discoverFiles } from '../indexing/file-index.js';
import { extractAll } from '../scanner/extractors.js';
import { detectProject } from '../analysis/project-detector.js';
import { detectCreationalPatterns } from './creational.js';
import { detectBehavioralPatterns } from './behavioral.js';
import { detectStructuralPatterns } from './structural.js';
import { detectArchitecturalPatterns, detectLayers } from './architectural.js';
import { detectFrameworkPatterns } from './framework.js';
import type { ArchitectureReport, DetectedPattern, PatternCategory } from './types.js';

export function analyzePatterns(rootDir: string, logger: Logger): ArchitectureReport {
  logger.info('patterns', 'analyzing architecture patterns', { rootDir });
  const startMs = performance.now();

  // Scan all files
  const projectInfo = detectProject(rootDir, logger);
  const files = discoverFiles(rootDir, logger);
  const scanResults: ScanResult[] = [];
  const allUnits: CodeUnitRecord[] = [];
  const filePaths = new Map<string, string>();

  for (const filePath of files) {
    const sourceText = fs.readFileSync(filePath, 'utf-8');
    try {
      const result = extractAll(filePath, sourceText, '');
      scanResults.push(result);
      for (const unit of result.codeUnits) {
        allUnits.push(unit);
        filePaths.set(unit.name, filePath);
      }
    } catch {
      logger.warn('patterns', 'scan failed, skipping', { filePath });
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

  // Sort by confidence descending
  allPatterns.sort((a, b) => b.confidence - a.confidence);

  // Group by category
  const byCategory: Record<PatternCategory, DetectedPattern[]> = {
    creational: [],
    structural: [],
    behavioral: [],
    architectural: [],
    framework: [],
  };
  for (const p of allPatterns) {
    byCategory[p.category].push(p);
  }

  // Compute stats
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

  // Detect layers
  const layers = detectLayers(scanResults, rootDir);
  // Annotate layers with patterns found in them
  for (const layer of layers) {
    const layerPatterns = new Set<string>();
    for (const p of allPatterns) {
      for (const loc of p.locations) {
        if (layer.files.includes(loc.filePath)) layerPatterns.add(p.pattern);
      }
    }
    layer.patterns = [...layerPatterns];
  }

  const durationMs = Math.round(performance.now() - startMs);
  logger.info('patterns', 'pattern analysis complete', {
    totalPatterns: allPatterns.length,
    byCategory: byCategoryCount,
    durationMs,
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
      coveragePercent: files.length > 0 ? Math.round((filesInPatterns.size / files.length) * 100) : 0,
    },
  };
}
