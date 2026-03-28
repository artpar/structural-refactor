/**
 * Dead Code: find exported symbols with no external references and remove them.
 * Uses findReferences() to check each exported symbol across ALL project files.
 * All mutations via ts-morph API — no string manipulation.
 */
import { Project, Node, SyntaxKind } from 'ts-morph';
import type { ChangeSet } from '../../core/change-set.js';
import type { Logger } from '../../core/logger.js';
import { executeRefactoring, preconditionOk, preconditionFail } from '../engine.js';

export interface DeadCodeArgs {
  scope?: string;
  logger: Logger;
}

export function findDeadCode(project: Project, args: DeadCodeArgs): ChangeSet {
  const { scope, logger } = args;

  const deadDeclarations: { filePath: string; name: string; node: Node }[] = [];

  for (const sf of project.getSourceFiles()) {
    const filePath = sf.getFilePath();
    if (scope && !filePath.startsWith(scope)) continue;

    // Collect all exported declarations in this file
    const exportedDecls = getExportedDeclarations(sf);

    for (const { name, node } of exportedDecls) {
      if (!hasExternalReferences(node, filePath)) {
        deadDeclarations.push({ filePath, name, node });
      }
    }
  }

  logger.info('dead-code', 'scan complete', {
    deadCount: deadDeclarations.length,
    files: [...new Set(deadDeclarations.map((d) => d.filePath))],
    symbols: deadDeclarations.map((d) => d.name),
  });

  if (deadDeclarations.length === 0) {
    return executeRefactoring(project, 'Dead code (none found)',
      () => preconditionOk(['no dead exports found']), () => {}, logger);
  }

  const symbolList = deadDeclarations.map((d) => `${d.name} (${d.filePath})`).join(', ');

  return executeRefactoring(
    project,
    `Remove ${deadDeclarations.length} dead export(s): ${symbolList}`,
    () => preconditionOk(),
    () => {
      for (const { node } of deadDeclarations) {
        removeDeclaration(node);
      }
    },
    logger,
  );
}

interface ExportedDecl {
  name: string;
  node: Node;
}

function getExportedDeclarations(sf: ReturnType<Project['getSourceFileOrThrow']>): ExportedDecl[] {
  const result: ExportedDecl[] = [];

  for (const fn of sf.getFunctions()) {
    if (fn.isExported() && fn.getName()) {
      result.push({ name: fn.getName()!, node: fn });
    }
  }

  for (const cls of sf.getClasses()) {
    if (cls.isExported() && cls.getName()) {
      result.push({ name: cls.getName()!, node: cls });
    }
  }

  for (const iface of sf.getInterfaces()) {
    if (iface.isExported()) {
      result.push({ name: iface.getName(), node: iface });
    }
  }

  for (const ta of sf.getTypeAliases()) {
    if (ta.isExported()) {
      result.push({ name: ta.getName(), node: ta });
    }
  }

  for (const en of sf.getEnums()) {
    if (en.isExported()) {
      result.push({ name: en.getName(), node: en });
    }
  }

  for (const stmt of sf.getVariableStatements()) {
    if (stmt.isExported()) {
      for (const decl of stmt.getDeclarations()) {
        result.push({ name: decl.getName(), node: stmt });
      }
    }
  }

  return result;
}

function hasExternalReferences(node: Node, declaringFilePath: string): boolean {
  // Get the name node for findReferences
  let nameNode: Node | undefined;
  if (Node.isFunctionDeclaration(node)) nameNode = node.getNameNode();
  else if (Node.isClassDeclaration(node)) nameNode = node.getNameNode();
  else if (Node.isInterfaceDeclaration(node)) nameNode = node.getNameNode();
  else if (Node.isTypeAliasDeclaration(node)) nameNode = node.getNameNode();
  else if (Node.isEnumDeclaration(node)) nameNode = node.getNameNode();
  else if (Node.isVariableStatement(node)) {
    const decls = node.getDeclarations();
    if (decls.length > 0) nameNode = decls[0].getNameNode();
  }

  if (!nameNode) return false;

  const refs = nameNode.findReferencesAsNodes();
  for (const ref of refs) {
    if (ref.getSourceFile().getFilePath() !== declaringFilePath) {
      return true;
    }
  }

  return false;
}

function removeDeclaration(node: Node): void {
  if (Node.isFunctionDeclaration(node)) node.remove();
  else if (Node.isClassDeclaration(node)) node.remove();
  else if (Node.isInterfaceDeclaration(node)) node.remove();
  else if (Node.isTypeAliasDeclaration(node)) node.remove();
  else if (Node.isEnumDeclaration(node)) node.remove();
  else if (Node.isVariableStatement(node)) node.remove();
}
