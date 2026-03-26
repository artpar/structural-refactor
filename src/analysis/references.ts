import { Project, Node, SyntaxKind } from 'ts-morph';
import type { Logger } from '../core/logger.js';

export type ReferenceContext =
  | 'definition'
  | 'usage'
  | 'import'
  | 'export'
  | 'type-annotation'
  | 'jsx-expression'
  | 'jsx-attribute'
  | 'jsx-element'
  | 'template-expression'
  | 'decorator'
  | 'spread'
  | 'destructure'
  | 'call-argument'
  | 'return-value'
  | 'assignment'
  | 'property-access'
  | 'unknown';

export interface ReferenceInfo {
  filePath: string;
  line: number;
  col: number;
  context: ReferenceContext;
  isDefinition: boolean;
  isWrite: boolean;
  text: string;           // surrounding expression text
  parentKind: string;     // AST node kind of parent
}

export function findAllReferences(
  project: Project,
  filePath: string,
  symbolName: string,
  logger: Logger,
): ReferenceInfo[] {
  const sourceFile = project.getSourceFile(filePath);
  if (!sourceFile) {
    logger.warn('references', 'source file not found', { filePath });
    return [];
  }

  // Find the symbol declaration — search all scopes (not just top-level)
  const decl =
    sourceFile.getFunction(symbolName) ??
    sourceFile.getClass(symbolName) ??
    sourceFile.getInterface(symbolName) ??
    sourceFile.getTypeAlias(symbolName) ??
    sourceFile.getEnum(symbolName) ??
    sourceFile.getVariableDeclaration(symbolName) ??
    // Search nested scopes for local variables
    sourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration)
      .find((d) => d.getName() === symbolName) ??
    sourceFile.getDescendantsOfKind(SyntaxKind.Parameter)
      .find((d) => d.getName() === symbolName);

  if (!decl) {
    logger.warn('references', 'symbol not found', { symbolName, filePath });
    return [];
  }

  logger.info('references', 'finding all references', { symbolName, filePath });
  const startMs = performance.now();

  const refs = decl.findReferences();
  const results: ReferenceInfo[] = [];

  for (const refGroup of refs) {
    for (const ref of refGroup.getReferences()) {
      const refNode = ref.getNode();
      const refFile = refNode.getSourceFile().getFilePath();
      const line = refNode.getStartLineNumber();
      const col = refNode.getStart() - refNode.getStartLinePos() + 1;
      const isDefinition = ref.isDefinition() ?? false;

      const context = classifyReference(refNode, isDefinition);
      const isWrite = isWriteReference(context);

      results.push({
        filePath: refFile,
        line,
        col,
        context,
        isDefinition,
        isWrite,
        text: getContextText(refNode),
        parentKind: refNode.getParent()?.getKindName() ?? 'unknown',
      });
    }
  }

  const durationMs = Math.round(performance.now() - startMs);
  logger.info('references', 'references found', {
    symbolName,
    totalRefs: results.length,
    contexts: summarizeContexts(results),
    durationMs,
  });

  return results;
}

function classifyReference(node: Node, isDefinition: boolean): ReferenceContext {
  if (isDefinition) return 'definition';

  const parent = node.getParent();
  if (!parent) return 'unknown';

  const parentKind = parent.getKind();

  // JSX contexts — check parent and grandparent for nested JSX structures
  if (parentKind === SyntaxKind.JsxExpression) {
    const grandparent = parent.getParent();
    if (grandparent && grandparent.getKind() === SyntaxKind.JsxAttribute) return 'jsx-attribute';
    return 'jsx-expression';
  }
  if (parentKind === SyntaxKind.JsxAttribute) return 'jsx-attribute';
  if (parentKind === SyntaxKind.JsxOpeningElement || parentKind === SyntaxKind.JsxSelfClosingElement) return 'jsx-element';

  // Template literal — identifier's parent in `${name}` is the TemplateSpan
  if (parentKind === SyntaxKind.TemplateSpan || parentKind === SyntaxKind.TemplateExpression) return 'template-expression';
  // Also check grandparent — sometimes there's an intermediate expression node
  if (parent.getParent()?.getKind() === SyntaxKind.TemplateSpan) return 'template-expression';

  // Decorator
  if (parentKind === SyntaxKind.Decorator || parentKind === SyntaxKind.CallExpression) {
    const grandparent = parent.getParent();
    if (grandparent && grandparent.getKind() === SyntaxKind.Decorator) return 'decorator';
  }

  // Type annotation
  if (parentKind === SyntaxKind.TypeReference) return 'type-annotation';

  // Import
  if (parentKind === SyntaxKind.ImportSpecifier || parentKind === SyntaxKind.ImportClause) return 'import';

  // Export
  if (parentKind === SyntaxKind.ExportSpecifier) return 'export';

  // Spread
  if (parentKind === SyntaxKind.SpreadAssignment || parentKind === SyntaxKind.SpreadElement) return 'spread';

  // Destructuring
  if (parentKind === SyntaxKind.BindingElement) return 'destructure';

  // Call argument
  if (parentKind === SyntaxKind.CallExpression) {
    const callExpr = parent.asKindOrThrow(SyntaxKind.CallExpression);
    const args = callExpr.getArguments();
    if (args.some((a) => a === node || a.getStart() === node.getStart())) return 'call-argument';
  }

  // Return
  if (parentKind === SyntaxKind.ReturnStatement) return 'return-value';

  // Assignment (left side of =)
  if (parentKind === SyntaxKind.BinaryExpression) {
    const binExpr = parent.asKindOrThrow(SyntaxKind.BinaryExpression);
    if (binExpr.getLeft() === node || binExpr.getLeft().getStart() === node.getStart()) {
      const op = binExpr.getOperatorToken().getText();
      if (op === '=' || op.endsWith('=')) return 'assignment';
    }
  }

  // Property access
  if (parentKind === SyntaxKind.PropertyAccessExpression) return 'property-access';

  return 'usage';
}

function isWriteReference(context: ReferenceContext): boolean {
  return context === 'definition' || context === 'assignment';
}

function getContextText(node: Node): string {
  const parent = node.getParent();
  if (!parent) return node.getText();
  // Show the parent expression for context, truncated
  return parent.getText().slice(0, 80);
}

function summarizeContexts(refs: ReferenceInfo[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const ref of refs) {
    counts[ref.context] = (counts[ref.context] ?? 0) + 1;
  }
  return counts;
}
