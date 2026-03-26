import fs from 'node:fs';
import path from 'node:path';
import type { Logger } from '../core/logger.js';

export type ProjectType = 'react' | 'angular' | 'vue' | 'next' | 'node' | 'chrome-extension' | 'monorepo' | 'library';
export type Framework = 'react' | 'angular' | 'vue' | 'next' | 'express' | 'fastify';

export interface WorkspacePackage {
  name: string;
  path: string;
  dependencies: string[];
}

export interface DependencyInfo {
  production: string[];
  dev: string[];
  peer: string[];
}

export interface ProjectInfo {
  rootDir: string;
  packageName?: string;
  types: ProjectType[];
  framework?: Framework;
  hasTypeScript: boolean;
  dependencies?: DependencyInfo;
  pathAliases?: Record<string, string[]>;
  workspacePackages?: WorkspacePackage[];
  entryPoints?: string[];
}

export function detectProject(rootDir: string, logger: Logger): ProjectInfo {
  logger.info('project-detector', 'detecting project type', { rootDir });

  const info: ProjectInfo = {
    rootDir,
    types: [],
    hasTypeScript: false,
  };

  // Read package.json
  const pkgJsonPath = path.join(rootDir, 'package.json');
  const pkgJson = readJsonSafe(pkgJsonPath);

  if (pkgJson) {
    info.packageName = pkgJson.name;
    info.dependencies = extractDependencies(pkgJson);

    // Detect monorepo
    if (pkgJson.workspaces) {
      info.types.push('monorepo');
      info.workspacePackages = discoverWorkspacePackages(rootDir, pkgJson.workspaces);
    }

    // Detect frameworks from dependencies
    const allDeps = [...(info.dependencies?.production ?? []), ...(info.dependencies?.dev ?? [])];

    if (allDeps.includes('react') || allDeps.includes('react-dom')) {
      info.types.push('react');
      info.framework = 'react';
    }

    if (allDeps.includes('next')) {
      info.types.push('next');
      info.framework = 'next';
    }

    if (allDeps.some((d) => d.startsWith('@angular/core'))) {
      info.types.push('angular');
      info.framework = 'angular';
    }

    if (allDeps.includes('vue')) {
      info.types.push('vue');
      info.framework = 'vue';
    }

    if (allDeps.includes('typescript') || allDeps.includes('@types/node')) {
      info.hasTypeScript = true;
    }
  }

  // Detect Chrome extension
  const manifestPath = path.join(rootDir, 'manifest.json');
  const manifest = readJsonSafe(manifestPath);
  if (manifest?.manifest_version) {
    info.types.push('chrome-extension');
  }

  // Read tsconfig.json for path aliases
  const tsconfigPath = path.join(rootDir, 'tsconfig.json');
  const tsconfig = readJsonSafe(tsconfigPath);
  if (tsconfig) {
    info.hasTypeScript = true;

    if (tsconfig.compilerOptions?.paths) {
      info.pathAliases = tsconfig.compilerOptions.paths;
    }
  }

  // Default to node if no framework detected
  if (info.types.length === 0) {
    info.types.push('node');
  }

  logger.info('project-detector', 'detection complete', {
    packageName: info.packageName,
    types: info.types,
    framework: info.framework,
    hasTypeScript: info.hasTypeScript,
    aliasCount: info.pathAliases ? Object.keys(info.pathAliases).length : 0,
    workspaceCount: info.workspacePackages?.length,
  });

  return info;
}

function extractDependencies(pkgJson: Record<string, unknown>): DependencyInfo {
  return {
    production: Object.keys((pkgJson.dependencies as Record<string, string>) ?? {}),
    dev: Object.keys((pkgJson.devDependencies as Record<string, string>) ?? {}),
    peer: Object.keys((pkgJson.peerDependencies as Record<string, string>) ?? {}),
  };
}

function discoverWorkspacePackages(rootDir: string, workspaces: unknown): WorkspacePackage[] {
  const patterns = Array.isArray(workspaces)
    ? workspaces as string[]
    : (workspaces as { packages?: string[] })?.packages ?? [];

  const packages: WorkspacePackage[] = [];

  for (const pattern of patterns) {
    // Simple glob: "packages/*" → list directories in packages/
    const baseDir = pattern.replace(/\/?\*$/, '');
    const fullDir = path.join(rootDir, baseDir);

    if (!fs.existsSync(fullDir)) continue;

    const entries = fs.readdirSync(fullDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const pkgDir = path.join(fullDir, entry.name);
      const pkgJsonPath = path.join(pkgDir, 'package.json');
      const pkgJson = readJsonSafe(pkgJsonPath);

      if (pkgJson) {
        packages.push({
          name: pkgJson.name ?? entry.name,
          path: pkgDir,
          dependencies: Object.keys((pkgJson.dependencies as Record<string, string>) ?? {}),
        });
      }
    }
  }

  return packages;
}

function readJsonSafe(filePath: string): Record<string, unknown> | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}
