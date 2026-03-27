import path from 'node:path';
import type { CodeUnitRecord, ScanResult } from '../scanner/types.js';
import type { DetectedPattern, PatternLocation, LayerInfo } from './types.js';

export function detectArchitecturalPatterns(
  units: CodeUnitRecord[],
  scanResults: ScanResult[],
  filePaths: Map<string, string>,
  rootDir: string,
): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];

  patterns.push(...detectDependencyInjection(units, filePaths));
  patterns.push(...detectRepositoryPattern(units, filePaths));
  patterns.push(...detectBarrelModules(scanResults));
  patterns.push(...detectMVC(units, scanResults, filePaths, rootDir));

  return patterns;
}

export function detectLayers(scanResults: ScanResult[], rootDir: string): LayerInfo[] {
  // Group files by their first-level directory under src/
  const dirFiles = new Map<string, string[]>();
  const dirImports = new Map<string, Set<string>>();

  for (const scan of scanResults) {
    const rel = path.relative(rootDir, scan.filePath);
    const parts = rel.split(path.sep);
    // Use first meaningful directory (skip 'src' if present)
    const layerDir = parts[0] === 'src' && parts.length > 2 ? parts[1] : parts[0];

    const existing = dirFiles.get(layerDir) ?? [];
    existing.push(scan.filePath);
    dirFiles.set(layerDir, existing);

    // Track inter-layer imports
    const deps = dirImports.get(layerDir) ?? new Set<string>();
    for (const imp of scan.imports) {
      if (imp.isExternal || !imp.resolved) continue;
      const impRel = path.relative(rootDir, imp.resolved);
      const impParts = impRel.split(path.sep);
      const impDir = impParts[0] === 'src' && impParts.length > 2 ? impParts[1] : impParts[0];
      if (impDir !== layerDir) deps.add(impDir);
    }
    dirImports.set(layerDir, deps);
  }

  const layers: LayerInfo[] = [];
  for (const [dir, files] of dirFiles) {
    layers.push({
      name: dir,
      directory: dir,
      files,
      dependsOn: [...(dirImports.get(dir) ?? [])],
      patterns: [],
    });
  }

  return layers.sort((a, b) => a.dependsOn.length - b.dependsOn.length);
}

function detectDependencyInjection(units: CodeUnitRecord[], filePaths: Map<string, string>): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];

  for (const unit of units) {
    if (unit.kind !== 'class') continue;
    if (!unit.constructorParams || unit.constructorParams.length === 0) continue;

    const evidence: string[] = [];
    let confidence = 0;

    // Decorator-based DI
    const hasInjectableDecorator = unit.decorators?.some(
      (d) => d.name === 'Injectable' || d.name === 'Service' || d.name === 'Inject',
    );
    if (hasInjectableDecorator) {
      evidence.push(`@${unit.decorators!.find((d) => ['Injectable', 'Service', 'Inject'].includes(d.name))!.name} decorator`);
      confidence += 0.5;
    }

    // Constructor params with interface/class types (not primitives)
    const typedParams = unit.constructorParams.filter(
      (p) => p.type && !['string', 'number', 'boolean', 'unknown', 'any'].includes(p.type),
    );
    if (typedParams.length >= 1) {
      evidence.push(`constructor injection: ${typedParams.map((p) => `${p.name}: ${p.type}`).join(', ')}`);
      confidence += 0.3 + Math.min(typedParams.length * 0.1, 0.2);
    }

    if (confidence >= 0.3) {
      patterns.push({
        pattern: 'dependency-injection',
        category: 'architectural',
        confidence: Math.min(confidence, 1.0),
        locations: [loc(unit, filePaths)],
        evidence,
        relatedUnits: [unit.name, ...typedParams.map((p) => p.type)],
      });
    }
  }

  return patterns;
}

function detectRepositoryPattern(units: CodeUnitRecord[], filePaths: Map<string, string>): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];
  const crudMethods = new Set(['find', 'findOne', 'findAll', 'findById', 'get', 'getAll', 'getById',
    'create', 'save', 'insert', 'add', 'update', 'patch', 'delete', 'remove', 'destroy']);

  for (const unit of units) {
    if (unit.kind !== 'class') continue;

    const methods = unit.members.filter((m) => m.kind === 'method').map((m) => m.name);
    const matching = methods.filter((m) => crudMethods.has(m));

    if (matching.length >= 3) {
      patterns.push({
        pattern: 'repository',
        category: 'architectural',
        confidence: Math.min(0.5 + matching.length * 0.1, 0.95),
        locations: [loc(unit, filePaths)],
        evidence: [`CRUD methods: ${matching.join(', ')}`],
        relatedUnits: [unit.name],
      });
    }
  }

  return patterns;
}

function detectBarrelModules(scanResults: ScanResult[]): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];

  for (const scan of scanResults) {
    if (!scan.filePath.endsWith('index.ts') && !scan.filePath.endsWith('index.js')) continue;

    const reExports = scan.exports.filter((e) => e.isReExport);
    if (reExports.length >= 2) {
      patterns.push({
        pattern: 'barrel-module',
        category: 'architectural',
        confidence: 0.95,
        locations: [{ filePath: scan.filePath, unitName: path.basename(scan.filePath), line: 1 }],
        evidence: [`re-exports ${reExports.length} items from ${new Set(reExports.map((e) => e.reExportSource)).size} modules`],
        relatedUnits: reExports.map((e) => e.name),
      });
    }
  }

  return patterns;
}

function detectMVC(
  units: CodeUnitRecord[],
  scanResults: ScanResult[],
  filePaths: Map<string, string>,
  rootDir: string,
): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];
  const layers = new Map<string, string[]>();

  for (const scan of scanResults) {
    const rel = path.relative(rootDir, scan.filePath).toLowerCase();
    if (rel.includes('controller') || rel.includes('route')) {
      const existing = layers.get('controllers') ?? [];
      existing.push(scan.filePath);
      layers.set('controllers', existing);
    }
    if (rel.includes('model') || rel.includes('entity') || rel.includes('schema')) {
      const existing = layers.get('models') ?? [];
      existing.push(scan.filePath);
      layers.set('models', existing);
    }
    if (rel.includes('view') || rel.includes('template') || rel.includes('component')) {
      const existing = layers.get('views') ?? [];
      existing.push(scan.filePath);
      layers.set('views', existing);
    }
    if (rel.includes('service') || rel.includes('provider')) {
      const existing = layers.get('services') ?? [];
      existing.push(scan.filePath);
      layers.set('services', existing);
    }
  }

  const presentLayers = [...layers.keys()];
  if (presentLayers.length >= 2) {
    const isFullMVC = presentLayers.includes('controllers') && presentLayers.includes('models');
    patterns.push({
      pattern: isFullMVC ? 'mvc' : 'layered-architecture',
      category: 'architectural',
      confidence: presentLayers.length >= 3 ? 0.85 : 0.6,
      locations: [],
      evidence: [`detected layers: ${presentLayers.join(', ')}`,
        ...presentLayers.map((l) => `${l}: ${layers.get(l)!.length} files`)],
      relatedUnits: [],
    });
  }

  return patterns;
}

function loc(unit: CodeUnitRecord, filePaths: Map<string, string>): PatternLocation {
  return { filePath: filePaths.get(unit.name) ?? '', unitName: unit.name, line: unit.line };
}
