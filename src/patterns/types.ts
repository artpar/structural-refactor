export type PatternCategory = 'creational' | 'structural' | 'behavioral' | 'architectural' | 'framework';

export interface PatternLocation {
  filePath: string;
  unitName: string;
  line: number;
}

export interface DetectedPattern {
  pattern: string;
  category: PatternCategory;
  confidence: number;
  locations: PatternLocation[];
  evidence: string[];
  relatedUnits: string[];
}

export interface LayerInfo {
  name: string;
  directory: string;
  files: string[];
  dependsOn: string[];
  patterns: string[];
}

export interface ArchitectureReport {
  projectType: string;
  framework?: string;
  layers: LayerInfo[];
  patterns: DetectedPattern[];
  patternsByCategory: Record<PatternCategory, DetectedPattern[]>;
  stats: {
    totalPatterns: number;
    byCategory: Record<string, number>;
    coveragePercent: number;
  };
}
