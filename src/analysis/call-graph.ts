import fs from 'node:fs';
import path from 'node:path';
import { parseSync } from 'oxc-parser';
import type { Logger } from '../core/logger.js';
import { discoverFiles } from '../indexing/file-index.js';
import { walkAst } from '../utils/ast-walk.js';
import { isTestFile } from "../patterns/helpers.js";

export interface CallRef {
  name: string;
  filePath: string;
  line: number;
}

export interface CallNode {
  id: string;          // filePath:functionName
  name: string;
  filePath: string;
  line: number;
  type: 'function' | 'method' | 'arrow';
  exported: boolean;
  calls: CallRef[];      // functions this function calls
  calledBy: CallRef[];   // functions that call this function
}

export interface CallGraphStats {
  functionCount: number;
  callEdgeCount: number;
  exportedFunctionCount: number;
  testFileCount: number;
  sourceFileCount: number;
}

export interface CallGraph {
  nodes: Map<string, CallNode>;
  testFiles: string[];
  sourceFiles: string[];
  stats: CallGraphStats;
}

const TEST_PATTERNS = [/\.test\.[jt]sx?$/, /\.spec\.[jt]sx?$/, /\/__tests__\//];

export function buildCallGraph(rootDir: string, logger: Logger): CallGraph {
  logger.info('call-graph', 'building call graph', { rootDir });
  const startMs = performance.now();

  const files = discoverFiles(rootDir, logger);
  const nodes = new Map<string, CallNode>();
  const testFiles: string[] = [];
  const sourceFiles: string[] = [];

  // Phase 1: Discover all function definitions via oxc AST
  for (const filePath of files) {
    if (isTestFile(filePath)) {
      testFiles.push(filePath);
    } else {
      sourceFiles.push(filePath);
    }

    const sourceText = fs.readFileSync(filePath, 'utf-8');
    let result;
    try {
      result = parseSync(filePath, sourceText);
    } catch {
      logger.warn('call-graph', 'parse failed, skipping', { filePath });
      continue;
    }

    // Walk the AST to find function declarations, arrow functions, methods
    const exportedNames = new Set<string>();
    for (const exp of result.module.staticExports) {
      for (const entry of exp.entries) {
        if (entry.exportName.kind === 'Name' && entry.exportName.name) {
          exportedNames.add(entry.exportName.name);
        }
      }
    }

    extractFunctions(result.program, filePath, exportedNames, nodes);
  }

  // Phase 2: Build call edges by scanning function bodies for call expressions
  for (const filePath of files) {
    const sourceText = fs.readFileSync(filePath, 'utf-8');
    let result;
    try {
      result = parseSync(filePath, sourceText);
    } catch {
      continue;
    }

    linkCalls(result.program, filePath, nodes, logger);
  }

  // Build reverse edges (calledBy)
  for (const [, node] of nodes) {
    for (const call of node.calls) {
      // Find the target node
      const targetKey = findTargetNode(call.name, nodes);
      if (targetKey) {
        const target = nodes.get(targetKey)!;
        if (!target.calledBy.some((c) => c.name === node.name && c.filePath === node.filePath)) {
          target.calledBy.push({ name: node.name, filePath: node.filePath, line: call.line });
        }
      }
    }
  }

  let callEdgeCount = 0;
  let exportedFunctionCount = 0;
  for (const [, node] of nodes) {
    callEdgeCount += node.calls.length;
    if (node.exported) exportedFunctionCount++;
  }

  const stats: CallGraphStats = {
    functionCount: nodes.size,
    callEdgeCount,
    exportedFunctionCount,
    testFileCount: testFiles.length,
    sourceFileCount: sourceFiles.length,
  };

  const durationMs = Math.round(performance.now() - startMs);
  logger.info('call-graph', 'call graph built', { ...stats, durationMs });

  return { nodes, testFiles, sourceFiles, stats };
}

function extractFunctions(
  program: any,
  filePath: string,
  exportedNames: Set<string>,
  nodes: Map<string, CallNode>,
): void {
  walkAst(program, (node: any) => {
    if (node.type === 'FunctionDeclaration' && node.id?.name) {
      const name = node.id.name;
      const key = `${filePath}:${name}`;
      nodes.set(key, {
        id: key,
        name,
        filePath,
        line: node.start ?? 0,
        type: 'function',
        exported: exportedNames.has(name),
        calls: [],
        calledBy: [],
      });
    }

    // Variable declarations with arrow/function expressions: const foo = () => {}
    if (node.type === 'VariableDeclarator' && node.id?.name && node.init) {
      const initType = node.init.type;
      if (initType === 'ArrowFunctionExpression' || initType === 'FunctionExpression') {
        const name = node.id.name;
        const key = `${filePath}:${name}`;
        nodes.set(key, {
          id: key,
          name,
          filePath,
          line: node.start ?? 0,
          type: initType === 'ArrowFunctionExpression' ? 'arrow' : 'function',
          exported: exportedNames.has(name),
          calls: [],
          calledBy: [],
        });
      }
    }

    // Class methods
    if (node.type === 'MethodDefinition' && node.key?.name) {
      const className = findParentClassName(node);
      const name = className ? `${className}.${node.key.name}` : node.key.name;
      const key = `${filePath}:${name}`;
      nodes.set(key, {
        id: key,
        name,
        filePath,
        line: node.start ?? 0,
        type: 'method',
        exported: false,
        calls: [],
        calledBy: [],
      });
    }
  });
}

function linkCalls(
  program: any,
  filePath: string,
  nodes: Map<string, CallNode>,
  logger: Logger,
): void {
  // Find all functions in this file
  const fileFunctions = new Map<string, CallNode>();
  for (const [key, node] of nodes) {
    if (node.filePath === filePath) {
      fileFunctions.set(node.name, node);
    }
  }

  // For each function, scan its body for call expressions
  walkAst(program, (node: any, parents: any[]) => {
    if (node.type === 'CallExpression') {
      const callee = node.callee;
      let targetName: string | undefined;

      if (callee.type === 'Identifier') {
        targetName = callee.name;
      } else if (callee.type === 'MemberExpression' && callee.property?.name) {
        if (callee.object?.type === 'Identifier') {
          targetName = `${callee.object.name}.${callee.property.name}`;
        } else {
          targetName = callee.property.name;
        }
      }

      if (!targetName) return;

      // Find the enclosing function
      const enclosingFn = findEnclosingFunction(parents);
      if (enclosingFn) {
        const enclosingNode = fileFunctions.get(enclosingFn);
        if (enclosingNode) {
          enclosingNode.calls.push({
            name: targetName,
            filePath,
            line: node.start ?? 0,
          });
        }
      }
    }
  });
}

function findTargetNode(callName: string, nodes: Map<string, CallNode>): string | undefined {
  // Direct match by name
  for (const [key, node] of nodes) {
    if (node.name === callName) return key;
  }
  return undefined;
}

function findEnclosingFunction(parents: any[]): string | undefined {
  for (let i = parents.length - 1; i >= 0; i--) {
    const p = parents[i];
    if (p.type === 'FunctionDeclaration' && p.id?.name) return p.id.name;
    if (p.type === 'VariableDeclarator' && p.id?.name &&
        (p.init?.type === 'ArrowFunctionExpression' || p.init?.type === 'FunctionExpression')) {
      return p.id.name;
    }
    if (p.type === 'MethodDefinition' && p.key?.name) {
      const cls = findParentClassName(p);
      return cls ? `${cls}.${p.key.name}` : p.key.name;
    }
  }
  return undefined;
}

function findParentClassName(node: any): string | undefined {
  // oxc AST doesn't have parent references, so we handle this at the walk level
  return undefined;
}

