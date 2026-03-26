import { Project, Node, SyntaxKind } from 'ts-morph';
import type { Logger } from '../core/logger.js';

export type DataFlowNodeType = 'parameter' | 'definition' | 'assignment' | 'usage' | 'call' | 'return';
export type FlowEdgeType = 'def-use' | 'assign-use' | 'param-flow' | 'call-arg' | 'call-return';

export interface DataFlowNode {
  id: number;
  name: string;
  type: DataFlowNodeType;
  line: number;
  sourceFile?: string;  // for cross-file references
  expression?: string;  // full expression text
}

export interface DataFlowEdge {
  from: number;
  to: number;
  type: FlowEdgeType;
  label?: string;
}

export interface DFG {
  functionName: string;
  filePath: string;
  nodes: DataFlowNode[];
  edges: DataFlowEdge[];
}

let nodeCounter = 0;

function newNode(name: string, type: DataFlowNodeType, line: number): DataFlowNode {
  return { id: nodeCounter++, name, type, line };
}

export function buildDFG(
  project: Project,
  filePath: string,
  functionName: string,
  logger: Logger,
): DFG | undefined {
  const sourceFile = project.getSourceFile(filePath);
  if (!sourceFile) {
    logger.warn('dfg', 'source file not found', { filePath });
    return undefined;
  }

  const fnDecl = sourceFile.getFunction(functionName);
  if (!fnDecl) {
    logger.warn('dfg', 'function not found', { functionName, filePath });
    return undefined;
  }

  const body = fnDecl.getBody();
  if (!body || !Node.isBlock(body)) {
    logger.warn('dfg', 'function has no block body', { functionName });
    return undefined;
  }

  logger.info('dfg', 'building data flow graph', { functionName, filePath });
  const startMs = performance.now();

  nodeCounter = 0;
  const nodes: DataFlowNode[] = [];
  const edges: DataFlowEdge[] = [];

  // Map: variable name → most recent definition/assignment node id
  const currentDef = new Map<string, number>();

  // 1. Process parameters as definitions
  for (const param of fnDecl.getParameters()) {
    const paramName = param.getName();
    const node = newNode(paramName, 'parameter', param.getStartLineNumber());
    nodes.push(node);
    currentDef.set(paramName, node.id);
  }

  // 2. Walk the body statements
  processBlock(body, nodes, edges, currentDef, project, filePath, logger);

  const durationMs = Math.round(performance.now() - startMs);
  logger.info('dfg', 'DFG built', {
    functionName, nodeCount: nodes.length, edgeCount: edges.length, durationMs,
  });

  return { functionName, filePath, nodes, edges };
}

function processBlock(
  block: Node,
  nodes: DataFlowNode[],
  edges: DataFlowEdge[],
  currentDef: Map<string, number>,
  project: Project,
  filePath: string,
  logger: Logger,
): void {
  const descendants = block.getDescendants();

  for (const node of descendants) {
    const kind = node.getKind();

    // Variable declarations: const x = expr
    if (kind === SyntaxKind.VariableDeclaration && Node.isVariableDeclaration(node)) {
      const name = node.getName();
      const line = node.getStartLineNumber();
      const defNode = newNode(name, 'definition', line);
      defNode.expression = node.getInitializer()?.getText()?.slice(0, 60);
      nodes.push(defNode);

      // Connect from previous def if this is a reassignment context
      currentDef.set(name, defNode.id);

      // Check if initializer contains identifiers that reference other variables
      const init = node.getInitializer();
      if (init) {
        connectIdentifierUsages(init, nodes, edges, currentDef, defNode.id);
        collectCallNodes(init, nodes, edges, currentDef, project, filePath);
      }
    }

    // Assignment expressions: x = expr
    if (kind === SyntaxKind.BinaryExpression && Node.isBinaryExpression(node)) {
      const op = node.getOperatorToken().getText();
      if (op === '=' || op === '+=' || op === '-=' || op === '*=' || op === '/=') {
        const left = node.getLeft();
        if (Node.isIdentifier(left)) {
          const name = left.getText();
          const line = node.getStartLineNumber();
          const assignNode = newNode(name, 'assignment', line);
          assignNode.expression = node.getRight().getText().slice(0, 60);
          nodes.push(assignNode);
          currentDef.set(name, assignNode.id);

          connectIdentifierUsages(node.getRight(), nodes, edges, currentDef, assignNode.id);
        }
      }
    }

    // Return statements
    if (kind === SyntaxKind.ReturnStatement && Node.isReturnStatement(node)) {
      const expr = node.getExpression();
      const returnNode = newNode('return', 'return', node.getStartLineNumber());
      returnNode.expression = expr?.getText()?.slice(0, 60);
      nodes.push(returnNode);

      if (expr) {
        connectIdentifierUsages(expr, nodes, edges, currentDef, returnNode.id);
      }
    }
  }
}

/** Find identifier usages within an expression and connect them to their definitions */
function connectIdentifierUsages(
  expr: Node,
  nodes: DataFlowNode[],
  edges: DataFlowEdge[],
  currentDef: Map<string, number>,
  targetNodeId: number,
): void {
  const identifiers = expr.getDescendantsOfKind(SyntaxKind.Identifier);
  // Also check if expr itself is an identifier
  const allIdents = Node.isIdentifier(expr) ? [expr, ...identifiers] : identifiers;

  for (const ident of allIdents) {
    const name = ident.getText();
    const defId = currentDef.get(name);
    if (defId !== undefined) {
      // Create a usage node
      const useNode = newNode(name, 'usage', ident.getStartLineNumber());
      nodes.push(useNode);

      // def → use edge
      edges.push({ from: defId, to: useNode.id, type: 'def-use' });
    }
  }
}

/** Collect call expression nodes for cross-function/cross-file tracking */
function collectCallNodes(
  expr: Node,
  nodes: DataFlowNode[],
  edges: DataFlowEdge[],
  currentDef: Map<string, number>,
  project: Project,
  filePath: string,
): void {
  const calls = expr.getDescendantsOfKind(SyntaxKind.CallExpression);
  // Check if expr itself is a call
  const allCalls = Node.isCallExpression(expr) ? [expr, ...calls] : calls;

  for (const call of allCalls) {
    const callExprText = call.getExpression().getText();
    const line = call.getStartLineNumber();

    const callNode = newNode(callExprText, 'call', line);
    callNode.expression = call.getText().slice(0, 60);

    // Try to resolve cross-file source
    const callTarget = call.getExpression();
    if (Node.isIdentifier(callTarget)) {
      const symbol = callTarget.getSymbol();
      if (symbol) {
        const declarations = symbol.getDeclarations();
        for (const decl of declarations) {
          const declFile = decl.getSourceFile().getFilePath();
          if (declFile !== filePath) {
            callNode.sourceFile = declFile;
          }
        }
      }
    }

    nodes.push(callNode);

    // Connect arguments as data flow into the call
    for (const arg of call.getArguments()) {
      if (Node.isIdentifier(arg)) {
        const defId = currentDef.get(arg.getText());
        if (defId !== undefined) {
          edges.push({ from: defId, to: callNode.id, type: 'call-arg', label: arg.getText() });
        }
      }
    }
  }
}
