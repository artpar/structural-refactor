import { Project, Node, SyntaxKind, Scope } from 'ts-morph';
import type { ChangeSet, FileChange } from '../../core/change-set.js';
import { createChangeSet } from '../../core/change-set.js';
import type { Logger } from '../../core/logger.js';

export interface ExtractInterfaceArgs {
  filePath: string;
  className: string;
  interfaceName: string;
  logger: Logger;
}

export function extractInterface(project: Project, args: ExtractInterfaceArgs): ChangeSet {
  const { filePath, className, interfaceName, logger } = args;

  const sourceFile = project.getSourceFile(filePath);
  if (!sourceFile) {
    logger.warn('extract-interface', 'source file not found', { filePath });
    return createChangeSet('Extract interface (no changes)', []);
  }

  const classDecl = sourceFile.getClass(className);
  if (!classDecl) {
    logger.warn('extract-interface', 'class not found', { className, filePath });
    return createChangeSet('Extract interface (class not found)', []);
  }

  const original = sourceFile.getFullText();

  logger.info('extract-interface', 'extracting interface from class', {
    filePath, className, interfaceName,
  });

  // Collect public members from the class AST
  const interfaceMembers: string[] = [];

  // Properties
  for (const prop of classDecl.getProperties()) {
    if (prop.getScope() === Scope.Private || prop.getScope() === Scope.Protected) continue;
    const name = prop.getName();
    const typeNode = prop.getTypeNode();
    const typeText = typeNode ? typeNode.getText() : prop.getType().getText();
    const optional = prop.hasQuestionToken() ? '?' : '';
    interfaceMembers.push(`  ${name}${optional}: ${typeText};`);
  }

  // Methods
  for (const method of classDecl.getMethods()) {
    if (method.getScope() === Scope.Private || method.getScope() === Scope.Protected) continue;
    const name = method.getName();
    const params = method.getParameters().map((p) => {
      const pType = p.getTypeNode()?.getText() ?? p.getType().getText();
      return `${p.getName()}: ${pType}`;
    }).join(', ');
    const returnType = method.getReturnTypeNode()?.getText() ?? method.getReturnType().getText();
    interfaceMembers.push(`  ${name}(${params}): ${returnType};`);
  }

  // Build the interface text
  const interfaceText = `interface ${interfaceName} {\n${interfaceMembers.join('\n')}\n}\n\n`;

  // Insert the interface before the class
  const classStart = classDecl.getStart();
  let lineStart = classStart;
  while (lineStart > 0 && original[lineStart - 1] !== '\n') lineStart--;

  let modified = original.slice(0, lineStart) + interfaceText + original.slice(lineStart);

  // Make the class implement the interface
  // Find the class declaration in the modified text and add 'implements'
  classDecl.addImplements(interfaceName);
  // Re-read the full text after ts-morph mutation
  modified = sourceFile.getFullText();
  // Now re-insert the interface (since ts-morph mutation changed the text)
  const newClassStart = classDecl.getStart();
  let newLineStart = newClassStart;
  while (newLineStart > 0 && modified[newLineStart - 1] !== '\n') newLineStart--;
  modified = modified.slice(0, newLineStart) + interfaceText + modified.slice(newLineStart);

  const files: FileChange[] = [];
  if (original !== modified) {
    files.push({ path: filePath, original, modified });
  }

  logger.info('extract-interface', 'extraction complete', {
    interfaceName,
    memberCount: interfaceMembers.length,
    filesChanged: files.length,
  });

  return createChangeSet(`Extract interface '${interfaceName}' from '${className}'`, files);
}
