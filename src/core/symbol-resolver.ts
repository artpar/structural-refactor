import { Project, Node, SyntaxKind } from 'ts-morph';

export interface ResolvedSymbol {
  name: string;
  kind: SymbolKind;
  filePath: string;
  line: number;
  col: number;
}

export type SymbolKind =
  | 'variable'
  | 'function'
  | 'class'
  | 'interface'
  | 'type'
  | 'enum'
  | 'parameter'
  | 'property'
  | 'method'
  | 'unknown';

function nodeKindToSymbolKind(node: Node): SymbolKind {
  const parent = node.getParent();
  if (!parent) return 'unknown';

  switch (parent.getKind()) {
    case SyntaxKind.VariableDeclaration:
      return 'variable';
    case SyntaxKind.FunctionDeclaration:
      return 'function';
    case SyntaxKind.ClassDeclaration:
      return 'class';
    case SyntaxKind.InterfaceDeclaration:
      return 'interface';
    case SyntaxKind.TypeAliasDeclaration:
      return 'type';
    case SyntaxKind.EnumDeclaration:
      return 'enum';
    case SyntaxKind.Parameter:
      return 'parameter';
    case SyntaxKind.PropertyDeclaration:
    case SyntaxKind.PropertySignature:
      return 'property';
    case SyntaxKind.MethodDeclaration:
    case SyntaxKind.MethodSignature:
      return 'method';
    default:
      return 'unknown';
  }
}

export function resolveSymbolAt(
  project: Project,
  filePath: string,
  line: number,
  col: number,
): ResolvedSymbol | undefined {
  const sourceFile = project.getSourceFile(filePath);
  if (!sourceFile) return undefined;

  const pos = sourceFile.compilerNode.getPositionOfLineAndCharacter(line - 1, col - 1);
  const node = sourceFile.getDescendantAtPos(pos);
  if (!node) return undefined;

  // Walk up to find the identifier node
  const identifier = Node.isIdentifier(node) ? node : undefined;
  if (!identifier) return undefined;

  const kind = nodeKindToSymbolKind(identifier);
  if (kind === 'unknown') return undefined;

  const start = identifier.getStartLinePos();
  const startLine = identifier.getStartLineNumber();
  const startCol = identifier.getStart() - start + 1;

  return {
    name: identifier.getText(),
    kind,
    filePath,
    line: startLine,
    col: startCol,
  };
}
