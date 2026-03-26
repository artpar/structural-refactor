import { Project, Node, SyntaxKind } from 'ts-morph';
import type { Logger } from '../core/logger.js';

export type BlockType = 'entry' | 'exit' | 'body' | 'branch' | 'loop' | 'try' | 'catch' | 'finally' | 'switch' | 'case';

export interface CallInfo {
  expression: string;
  target: string;      // resolved function name (e.g., 'console.log', 'add')
  line: number;
}

export interface BasicBlock {
  id: number;
  type: BlockType;
  label: string;
  statements: string[];
  calls: CallInfo[];
  successors: number[];  // block ids
  predecessors: number[];
  startLine: number;
  endLine: number;
}

export interface CFG {
  functionName: string;
  filePath: string;
  entry: number;   // block id
  exit: number;     // block id
  blocks: BasicBlock[];
}

let blockCounter = 0;

function newBlock(type: BlockType, label: string, startLine: number): BasicBlock {
  return {
    id: blockCounter++,
    type,
    label,
    statements: [],
    calls: [],
    successors: [],
    predecessors: [],
    startLine,
    endLine: startLine,
  };
}

function link(from: BasicBlock, to: BasicBlock): void {
  if (!from.successors.includes(to.id)) from.successors.push(to.id);
  if (!to.predecessors.includes(from.id)) to.predecessors.push(from.id);
}

export function buildCFG(
  project: Project,
  filePath: string,
  functionName: string,
  logger: Logger,
): CFG | undefined {
  const sourceFile = project.getSourceFile(filePath);
  if (!sourceFile) {
    logger.warn('cfg', 'source file not found', { filePath });
    return undefined;
  }

  const fnDecl = sourceFile.getFunction(functionName);
  if (!fnDecl) {
    logger.warn('cfg', 'function not found', { functionName, filePath });
    return undefined;
  }

  const body = fnDecl.getBody();
  if (!body || !Node.isBlock(body)) {
    logger.warn('cfg', 'function has no block body', { functionName });
    return undefined;
  }

  logger.info('cfg', 'building control flow graph', { functionName, filePath });
  const startMs = performance.now();

  blockCounter = 0;

  const entryBlock = newBlock('entry', 'entry', fnDecl.getStartLineNumber());
  const exitBlock = newBlock('exit', 'exit', fnDecl.getEndLineNumber() ?? fnDecl.getStartLineNumber());

  const blocks: BasicBlock[] = [entryBlock, exitBlock];

  // Process the function body statements
  const lastBlocks = processStatements(body.getStatements(), entryBlock, exitBlock, blocks, logger);

  // Connect any remaining blocks to exit
  for (const lb of lastBlocks) {
    link(lb, exitBlock);
  }

  const durationMs = Math.round(performance.now() - startMs);
  logger.info('cfg', 'CFG built', {
    functionName, blockCount: blocks.length, durationMs,
  });

  return {
    functionName,
    filePath,
    entry: entryBlock.id,
    exit: exitBlock.id,
    blocks,
  };
}

/**
 * Process a list of statements, building blocks and edges.
 * Returns the "current" blocks at the end (blocks that haven't terminated yet).
 */
function processStatements(
  statements: Node[],
  currentBlock: BasicBlock,
  exitBlock: BasicBlock,
  allBlocks: BasicBlock[],
  logger: Logger,
): BasicBlock[] {
  let active = [currentBlock];

  for (const stmt of statements) {
    if (active.length === 0) break; // unreachable code

    const kind = stmt.getKind();

    if (kind === SyntaxKind.IfStatement) {
      active = processIfStatement(stmt, active, exitBlock, allBlocks, logger);
    } else if (kind === SyntaxKind.ForOfStatement || kind === SyntaxKind.ForInStatement || kind === SyntaxKind.ForStatement || kind === SyntaxKind.WhileStatement || kind === SyntaxKind.DoStatement) {
      active = processLoopStatement(stmt, active, exitBlock, allBlocks, logger);
    } else if (kind === SyntaxKind.TryStatement) {
      active = processTryStatement(stmt, active, exitBlock, allBlocks, logger);
    } else if (kind === SyntaxKind.SwitchStatement) {
      active = processSwitchStatement(stmt, active, exitBlock, allBlocks, logger);
    } else if (kind === SyntaxKind.ReturnStatement) {
      for (const block of active) {
        block.statements.push(stmt.getText());
        collectCalls(stmt, block);
        link(block, exitBlock);
      }
      active = []; // return terminates
    } else {
      // Regular statement — add to all active blocks
      for (const block of active) {
        block.statements.push(stmt.getText());
        block.endLine = stmt.getEndLineNumber() ?? block.endLine;
        collectCalls(stmt, block);
      }
    }
  }

  return active;
}

function processIfStatement(
  stmt: Node,
  activeBlocks: BasicBlock[],
  exitBlock: BasicBlock,
  allBlocks: BasicBlock[],
  logger: Logger,
): BasicBlock[] {
  const ifStmt = stmt.asKindOrThrow(SyntaxKind.IfStatement);
  const line = ifStmt.getStartLineNumber();

  const branchBlock = newBlock('branch', `if (${ifStmt.getExpression().getText().slice(0, 30)})`, line);
  allBlocks.push(branchBlock);

  for (const ab of activeBlocks) link(ab, branchBlock);

  // Then branch
  const thenBlock = newBlock('body', 'then', line);
  allBlocks.push(thenBlock);
  link(branchBlock, thenBlock);

  const thenBody = ifStmt.getThenStatement();
  const thenStatements = Node.isBlock(thenBody) ? thenBody.getStatements() : [thenBody];
  const thenExits = processStatements(thenStatements, thenBlock, exitBlock, allBlocks, logger);

  // Else branch
  const elseBody = ifStmt.getElseStatement();
  let elseExits: BasicBlock[];

  if (elseBody) {
    const elseBlock = newBlock('body', 'else', elseBody.getStartLineNumber());
    allBlocks.push(elseBlock);
    link(branchBlock, elseBlock);

    if (Node.isIfStatement(elseBody)) {
      // else if — recurse
      elseExits = processIfStatement(elseBody, [elseBlock], exitBlock, allBlocks, logger);
    } else {
      const elseStatements = Node.isBlock(elseBody) ? elseBody.getStatements() : [elseBody];
      elseExits = processStatements(elseStatements, elseBlock, exitBlock, allBlocks, logger);
    }
  } else {
    // No else — branch block itself is a fallthrough
    elseExits = [branchBlock];
  }

  return [...thenExits, ...elseExits];
}

function processLoopStatement(
  stmt: Node,
  activeBlocks: BasicBlock[],
  exitBlock: BasicBlock,
  allBlocks: BasicBlock[],
  logger: Logger,
): BasicBlock[] {
  const line = stmt.getStartLineNumber();
  const loopBlock = newBlock('loop', `loop`, line);
  allBlocks.push(loopBlock);

  for (const ab of activeBlocks) link(ab, loopBlock);

  // Loop body
  const bodyBlock = newBlock('body', 'loop-body', line);
  allBlocks.push(bodyBlock);
  link(loopBlock, bodyBlock);

  // Get the loop body statements
  let bodyStatements: Node[] = [];
  if (Node.isForOfStatement(stmt) || Node.isForInStatement(stmt) || Node.isForStatement(stmt) || Node.isWhileStatement(stmt)) {
    const body = (stmt as any).getStatement();
    bodyStatements = body && Node.isBlock(body) ? body.getStatements() : body ? [body] : [];
  } else if (Node.isDoStatement(stmt)) {
    const body = stmt.getStatement();
    bodyStatements = Node.isBlock(body) ? body.getStatements() : [body];
  }

  const bodyExits = processStatements(bodyStatements, bodyBlock, exitBlock, allBlocks, logger);

  // Back edge: body exits → loop header
  for (const be of bodyExits) link(be, loopBlock);

  // Loop exit — continues after the loop
  const afterLoop = newBlock('body', 'after-loop', stmt.getEndLineNumber() ?? line);
  allBlocks.push(afterLoop);
  link(loopBlock, afterLoop);

  return [afterLoop];
}

function processTryStatement(
  stmt: Node,
  activeBlocks: BasicBlock[],
  exitBlock: BasicBlock,
  allBlocks: BasicBlock[],
  logger: Logger,
): BasicBlock[] {
  const tryStmt = stmt.asKindOrThrow(SyntaxKind.TryStatement);
  const line = tryStmt.getStartLineNumber();

  const tryBlock = newBlock('try', 'try', line);
  allBlocks.push(tryBlock);
  for (const ab of activeBlocks) link(ab, tryBlock);

  // Try body
  const tryBody = tryStmt.getTryBlock();
  const tryExits = processStatements(tryBody.getStatements(), tryBlock, exitBlock, allBlocks, logger);

  const allExits: BasicBlock[] = [...tryExits];

  // Catch clause
  const catchClause = tryStmt.getCatchClause();
  if (catchClause) {
    const catchBlock = newBlock('catch', 'catch', catchClause.getStartLineNumber());
    allBlocks.push(catchBlock);
    link(tryBlock, catchBlock); // exception edge

    const catchBody = catchClause.getBlock();
    const catchExits = processStatements(catchBody.getStatements(), catchBlock, exitBlock, allBlocks, logger);
    allExits.push(...catchExits);
  }

  // Finally clause
  const finallyBlock = tryStmt.getFinallyBlock();
  if (finallyBlock) {
    const finBlock = newBlock('finally', 'finally', finallyBlock.getStartLineNumber());
    allBlocks.push(finBlock);

    // All exits from try and catch flow through finally
    for (const ex of allExits) link(ex, finBlock);

    const finExits = processStatements(finallyBlock.getStatements(), finBlock, exitBlock, allBlocks, logger);
    return finExits;
  }

  return allExits;
}

function processSwitchStatement(
  stmt: Node,
  activeBlocks: BasicBlock[],
  exitBlock: BasicBlock,
  allBlocks: BasicBlock[],
  logger: Logger,
): BasicBlock[] {
  const switchStmt = stmt.asKindOrThrow(SyntaxKind.SwitchStatement);
  const line = switchStmt.getStartLineNumber();

  const switchBlock = newBlock('switch', `switch (${switchStmt.getExpression().getText().slice(0, 20)})`, line);
  allBlocks.push(switchBlock);
  for (const ab of activeBlocks) link(ab, switchBlock);

  const allExits: BasicBlock[] = [];

  for (const clause of switchStmt.getClauses()) {
    const caseLine = clause.getStartLineNumber();
    const caseBlock = newBlock('case', Node.isCaseClause(clause) ? `case ${clause.getExpression().getText()}` : 'default', caseLine);
    allBlocks.push(caseBlock);
    link(switchBlock, caseBlock);

    const caseExits = processStatements([...clause.getStatements()], caseBlock, exitBlock, allBlocks, logger);
    allExits.push(...caseExits);
  }

  return allExits;
}

/** Collect function call expressions within a statement */
function collectCalls(node: Node, block: BasicBlock): void {
  const calls = node.getDescendantsOfKind(SyntaxKind.CallExpression);
  for (const call of calls) {
    const expr = call.getExpression();
    block.calls.push({
      expression: call.getText().slice(0, 60),
      target: expr.getText(),
      line: call.getStartLineNumber(),
    });
  }
}
