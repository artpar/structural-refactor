import { parseSync } from 'oxc-parser';
import type {
  ImportRecord, ExportRecord, CodeUnitRecord, CallRecord, ScanResult,
  ParamRecord, MemberRecord, StatementType, CodeUnitKind,
} from './types.js';

// ─── Top-level: extract everything from one file ────────────────

export function extractAll(filePath: string, sourceText: string, contentHash: string): ScanResult {
  const result = parseSync(filePath, sourceText);
  return {
    filePath,
    contentHash,
    imports: extractImports(result.module, result.program),
    exports: extractExports(result.module, result.program),
    codeUnits: extractCodeUnits(result.program, sourceText),
    calls: extractCalls(result.program),
  };
}

// ─── Imports ────────────────────────────────────────────────────

export function extractImports(mod: any, program?: any): ImportRecord[] {
  const records: ImportRecord[] = [];

  // ESM static imports
  for (const si of mod.staticImports) {
    const specifiers: string[] = [];
    for (const entry of si.entries) {
      if (entry.importName.kind === 'Default') specifiers.push('default');
      else if (entry.importName.kind === 'NamespaceObject') specifiers.push('*');
      else if (entry.importName.kind === 'Name') specifiers.push(entry.importName.name!);
    }
    records.push({
      source: si.moduleRequest.value,
      specifiers,
      resolved: '',
      isExternal: !si.moduleRequest.value.startsWith('.'),
    });
  }

  // CJS require() calls — scan AST for CallExpression where callee is 'require'
  if (program) {
    extractCjsRequires(program, records);
  }

  // Re-exports also create import dependencies
  for (const se of mod.staticExports) {
    for (const entry of se.entries) {
      if (entry.moduleRequest) {
        const source = entry.moduleRequest.value;
        const specifier = entry.importName.kind === 'Name' ? entry.importName.name! : '*';
        records.push({ source, specifiers: [specifier], resolved: '', isExternal: !source.startsWith('.') });
      }
    }
  }

  return records;
}

/** Extract CJS require() calls from the AST as import records */
function extractCjsRequires(program: any, records: ImportRecord[]): void {
  walkAst(program, (node: any) => {
    if (node.type !== 'CallExpression') return;

    const callee = node.callee;
    if (!callee || callee.type !== 'Identifier' || callee.name !== 'require') return;

    const args = node.arguments;
    if (!args || args.length !== 1) return;

    const arg = args[0];
    if (arg.type !== 'StringLiteral' && arg.type !== 'Literal') return;
    if (typeof arg.value !== 'string') return;

    const source = arg.value;

    // Determine what's being imported — check the parent
    const specifiers: string[] = ['default']; // require() is effectively a default import

    // Avoid duplicating if already captured via staticImports
    if (records.some((r) => r.source === source)) return;

    records.push({
      source,
      specifiers,
      resolved: '',
      isExternal: !source.startsWith('.'),
    });
  }, []);
}

// ─── Exports ────────────────────────────────────────────────────

export function extractExports(mod: any, program?: any): ExportRecord[] {
  const records: ExportRecord[] = [];

  for (const se of mod.staticExports) {
    for (const entry of se.entries) {
      const isDefault = entry.exportName.kind === 'Default';
      const name = isDefault ? 'default' : (entry.exportName.name ?? '');
      const isReExport = !!entry.moduleRequest;
      records.push({
        name,
        isDefault,
        isReExport,
        reExportSource: entry.moduleRequest?.value,
      });
    }
  }

  // CJS: module.exports = X → default export; exports.name = X → named export
  if (program) {
    walkAst(program, (node: any) => {
      if (node.type !== 'AssignmentExpression' && node.type !== 'BinaryExpression') return;
      const left = node.left;
      if (!left) return;

      if (left.type === 'MemberExpression') {
        const obj = left.object;
        const prop = left.property;
        // module.exports = X
        if (obj?.type === 'MemberExpression' && obj.object?.name === 'module' && obj.property?.name === 'exports' && prop) {
          // module.exports.name = X
          if (prop.name) {
            records.push({ name: prop.name, isDefault: false, isReExport: false });
          }
        } else if (obj?.name === 'module' && prop?.name === 'exports') {
          records.push({ name: 'default', isDefault: true, isReExport: false });
        } else if (obj?.name === 'exports' && prop?.name) {
          // exports.name = X
          records.push({ name: prop.name, isDefault: false, isReExport: false });
        }
      }
    }, []);
  }

  return records;
}

// ─── Code Units ─────────────────────────────────────────────────

export function extractCodeUnits(program: any, sourceText: string): CodeUnitRecord[] {
  const units: CodeUnitRecord[] = [];
  const exportedNames = collectExportedNames(program);

  walkAst(program, (node: any) => {
    if (node.type === 'FunctionDeclaration' && node.id?.name) {
      units.push(buildFunctionUnit(node, sourceText, exportedNames, 'function'));
    }

    if (node.type === 'VariableDeclarator' && node.id?.name && node.init) {
      if (node.init.type === 'ArrowFunctionExpression' || node.init.type === 'FunctionExpression') {
        units.push(buildFunctionUnit(node.init, sourceText, exportedNames,
          node.init.type === 'ArrowFunctionExpression' ? 'arrow' : 'function', node.id.name));
      }
    }

    if (node.type === 'ClassDeclaration' && node.id?.name) {
      units.push(buildClassUnit(node, sourceText, exportedNames));
    }

    if (node.type === 'TSInterfaceDeclaration' && node.id?.name) {
      units.push(buildInterfaceUnit(node, sourceText, exportedNames));
    }

    if (node.type === 'TSTypeAliasDeclaration' && node.id?.name) {
      units.push({
        name: node.id.name,
        kind: 'type',
        line: getLine(sourceText, node.start),
        exported: exportedNames.has(node.id.name),
        isAsync: false,
        params: [],
        returnType: '',
        members: [],
        typeTokens: [],
        nodeTypes: [],
        statementTypes: [],
        bodyLineCount: 0,
        complexity: 0,
      });
    }

    if (node.type === 'TSEnumDeclaration' && node.id?.name) {
      units.push({
        name: node.id.name,
        kind: 'enum',
        line: getLine(sourceText, node.start),
        exported: exportedNames.has(node.id.name),
        isAsync: false,
        params: [],
        returnType: '',
        members: (node.members ?? []).map((m: any) => ({ name: m.id?.name ?? '', kind: 'property' as const })),
        typeTokens: [],
        nodeTypes: [],
        statementTypes: [],
        bodyLineCount: 0,
        complexity: 0,
      });
    }
  });

  return units;
}

function buildFunctionUnit(
  node: any, sourceText: string, exportedNames: Set<string>,
  kind: CodeUnitKind, overrideName?: string,
): CodeUnitRecord {
  const name = overrideName ?? node.id?.name ?? '';
  const params = extractParams(node.params, sourceText);
  const returnType = node.returnType?.typeAnnotation
    ? sourceText.slice(node.returnType.typeAnnotation.start, node.returnType.typeAnnotation.end)
    : '';

  const body = node.body;
  const nodeTypes: string[] = [];
  const typeTokens: string[] = [];
  const statementTypes: StatementType[] = [];
  let complexity = 0;

  if (body) {
    // Post-order AST node types (for Merkle hashing)
    walkAstPostOrder(body, (n: any) => {
      nodeTypes.push(n.type);
      // Type tokens: collect node types but NOT identifier values (Type II invariance)
      if (n.type !== 'Identifier' && n.type !== 'StringLiteral' && n.type !== 'NumericLiteral') {
        typeTokens.push(n.type);
      }
    });

    // Statement classification
    if (body.type === 'BlockStatement' && body.body) {
      for (const stmt of body.body) {
        statementTypes.push(classifyStatement(stmt));
      }
    }

    // Cyclomatic complexity
    complexity = countComplexity(body);
  }

  const bodyLineCount = body ? countLines(sourceText, body.start, body.end) : 0;

  return {
    name, kind,
    line: getLine(sourceText, node.start ?? 0),
    exported: exportedNames.has(name),
    isAsync: node.async ?? false,
    params, returnType, members: [],
    typeTokens, nodeTypes, statementTypes,
    bodyLineCount, complexity,
  };
}

function buildClassUnit(node: any, sourceText: string, exportedNames: Set<string>): CodeUnitRecord {
  const name = node.id.name;
  const members: MemberRecord[] = [];
  let constructorParams: ParamRecord[] = [];

  // Extract extends clause
  const extendsName = node.superClass?.name as string | undefined;

  // Extract implements clause
  const implementsNames: string[] = [];
  if (node.implements) {
    for (const impl of node.implements) {
      const implName = impl.expression?.name ?? impl.typeName?.name;
      if (implName) implementsNames.push(implName);
    }
  }

  // Extract decorators on the class
  const classDecorators = extractDecorators(node.decorators, sourceText);

  if (node.body?.body) {
    for (const member of node.body.body) {
      if (member.type === 'MethodDefinition' && member.key?.name) {
        const visibility = extractVisibility(member);
        const memberDecorators = extractDecorators(member.decorators, sourceText);

        members.push({
          name: member.key.name,
          kind: member.kind === 'get' ? 'getter' : member.kind === 'set' ? 'setter' : 'method',
          isAsync: member.value?.async ?? false,
          paramCount: member.value?.params?.length ?? 0,
          visibility,
          isStatic: member.static ?? false,
          decorators: memberDecorators.length > 0 ? memberDecorators : undefined,
        });
      }
      if (member.type === 'MethodDefinition' && member.kind === 'constructor') {
        // Extract constructor parameters
        constructorParams = extractParams(member.value?.params ?? [], sourceText);
        members.push({
          name: 'constructor',
          kind: 'constructor',
          paramCount: constructorParams.length,
          visibility: extractVisibility(member),
        });
      }
      if (member.type === 'PropertyDefinition' && member.key?.name) {
        members.push({
          name: member.key.name,
          kind: 'property',
          type: member.typeAnnotation?.typeAnnotation
            ? sourceText.slice(member.typeAnnotation.typeAnnotation.start, member.typeAnnotation.typeAnnotation.end)
            : undefined,
          visibility: extractVisibility(member),
          isStatic: member.static ?? false,
          decorators: extractDecorators(member.decorators, sourceText),
        });
      }
    }
  }

  const nodeTypes: string[] = [];
  const typeTokens: string[] = [];
  if (node.body) {
    walkAstPostOrder(node.body, (n: any) => {
      nodeTypes.push(n.type);
      if (n.type !== 'Identifier' && n.type !== 'StringLiteral' && n.type !== 'NumericLiteral') {
        typeTokens.push(n.type);
      }
    });
  }

  return {
    name, kind: 'class',
    line: getLine(sourceText, node.start),
    exported: exportedNames.has(name),
    isAsync: false,
    extends: extendsName,
    implements: implementsNames.length > 0 ? implementsNames : undefined,
    decorators: classDecorators.length > 0 ? classDecorators : undefined,
    constructorParams: constructorParams.length > 0 ? constructorParams : undefined,
    params: [], returnType: '',
    members, typeTokens, nodeTypes,
    statementTypes: [],
    bodyLineCount: countLines(sourceText, node.start, node.end),
    complexity: 0,
  };
}

function extractDecorators(decorators: any[] | undefined, sourceText: string): import('./types.js').DecoratorRecord[] {
  if (!decorators) return [];
  return decorators.map((d: any) => {
    const expr = d.expression;
    if (expr?.type === 'CallExpression') {
      return {
        name: expr.callee?.name ?? sourceText.slice(expr.callee?.start, expr.callee?.end) ?? '',
        args: expr.arguments?.map((a: any) => sourceText.slice(a.start, a.end)) ?? [],
      };
    }
    return { name: expr?.name ?? '' };
  }).filter((d: any) => d.name);
}

function extractVisibility(member: any): 'public' | 'private' | 'protected' | undefined {
  if (member.accessibility === 'private') return 'private';
  if (member.accessibility === 'protected') return 'protected';
  if (member.accessibility === 'public') return 'public';
  return undefined;
}

function buildInterfaceUnit(node: any, sourceText: string, exportedNames: Set<string>): CodeUnitRecord {
  const name = node.id.name;
  const members: MemberRecord[] = [];

  if (node.body?.body) {
    for (const member of node.body.body) {
      if (member.type === 'TSPropertySignature' && member.key?.name) {
        members.push({
          name: member.key.name,
          kind: 'property',
          type: member.typeAnnotation?.typeAnnotation
            ? sourceText.slice(member.typeAnnotation.typeAnnotation.start, member.typeAnnotation.typeAnnotation.end)
            : undefined,
        });
      }
      if (member.type === 'TSMethodSignature' && member.key?.name) {
        members.push({
          name: member.key.name,
          kind: 'method',
          paramCount: member.params?.length ?? 0,
        });
      }
    }
  }

  return {
    name, kind: 'interface',
    line: getLine(sourceText, node.start),
    exported: exportedNames.has(name),
    isAsync: false,
    params: [], returnType: '',
    members,
    typeTokens: [], nodeTypes: [],
    statementTypes: [],
    bodyLineCount: 0,
    complexity: 0,
  };
}

// ─── Calls ──────────────────────────────────────────────────────

export function extractCalls(program: any): CallRecord[] {
  const calls: CallRecord[] = [];

  walkAst(program, (node: any, parents: any[]) => {
    if (node.type === 'CallExpression') {
      const callee = node.callee;
      let targetName: string | undefined;

      if (callee.type === 'Identifier') targetName = callee.name;
      else if (callee.type === 'MemberExpression' && callee.property?.name) {
        targetName = callee.object?.type === 'Identifier'
          ? `${callee.object.name}.${callee.property.name}`
          : callee.property.name;
      }

      if (targetName) {
        const callerName = findEnclosingFunctionName(parents);
        calls.push({
          callerName: callerName ?? '<module>',
          targetName,
          line: node.start ?? 0,
        });
      }
    }
  });

  return calls;
}

// ─── Helpers ────────────────────────────────────────────────────

function extractParams(params: any[], sourceText: string): ParamRecord[] {
  if (!params) return [];
  return params.map((p: any) => {
    // TSParameterProperty wraps the actual parameter (e.g., `private db: Database`)
    const actual = p.type === 'TSParameterProperty' ? p.parameter : p;
    return {
      name: actual.name ?? actual.argument?.name ?? actual.left?.name ?? '?',
      type: actual.typeAnnotation?.typeAnnotation
        ? sourceText.slice(actual.typeAnnotation.typeAnnotation.start, actual.typeAnnotation.typeAnnotation.end)
        : (actual.typeAnnotation?.typeAnnotation?.type?.replace('TS', '').replace('Keyword', '').toLowerCase() ?? 'unknown'),
    };
  });
}

function classifyStatement(stmt: any): StatementType {
  switch (stmt.type) {
    case 'VariableDeclaration': return 'variable-def';
    case 'ExpressionStatement':
      if (stmt.expression?.type === 'AssignmentExpression') return 'assignment';
      if (stmt.expression?.type === 'CallExpression') return 'call';
      return 'other';
    case 'IfStatement': return 'conditional';
    case 'ForStatement': case 'ForOfStatement': case 'ForInStatement':
    case 'WhileStatement': case 'DoWhileStatement': return 'loop';
    case 'ReturnStatement': return 'return';
    default: return 'other';
  }
}

function countComplexity(body: any): number {
  let c = 0;
  walkAst(body, (node: any) => {
    if (node.type === 'IfStatement' || node.type === 'ConditionalExpression') c++;
    if (node.type === 'ForStatement' || node.type === 'ForOfStatement' ||
        node.type === 'ForInStatement' || node.type === 'WhileStatement' ||
        node.type === 'DoWhileStatement') c++;
    if (node.type === 'SwitchCase') c++;
    if (node.type === 'CatchClause') c++;
    if (node.type === 'LogicalExpression') c++;
  });
  return c;
}

function collectExportedNames(program: any): Set<string> {
  const names = new Set<string>();
  walkAst(program, (node: any) => {
    if (node.type === 'ExportNamedDeclaration') {
      if (node.declaration?.id?.name) names.add(node.declaration.id.name);
      if (node.declaration?.declarations) {
        for (const d of node.declaration.declarations) {
          if (d.id?.name) names.add(d.id.name);
        }
      }
      if (node.specifiers) {
        for (const s of node.specifiers) {
          if (s.exported?.name) names.add(s.exported.name);
        }
      }
    }
    if (node.type === 'ExportDefaultDeclaration') {
      if (node.declaration?.id?.name) names.add(node.declaration.id.name);
      names.add('default');
    }
  });
  return names;
}

function findEnclosingFunctionName(parents: any[]): string | undefined {
  for (let i = parents.length - 1; i >= 0; i--) {
    const p = parents[i];
    if (p.type === 'FunctionDeclaration' && p.id?.name) return p.id.name;
    if (p.type === 'VariableDeclarator' && p.id?.name &&
        (p.init?.type === 'ArrowFunctionExpression' || p.init?.type === 'FunctionExpression')) {
      return p.id.name;
    }
  }
  return undefined;
}

function getLine(text: string, pos: number): number {
  let line = 1;
  for (let i = 0; i < pos && i < text.length; i++) {
    if (text[i] === '\n') line++;
  }
  return line;
}

function countLines(text: string, start: number, end: number): number {
  let lines = 1;
  for (let i = start; i < end && i < text.length; i++) {
    if (text[i] === '\n') lines++;
  }
  return lines;
}

function walkAst(node: any, visitor: (node: any, parents: any[]) => void, parents: any[] = []): void {
  if (!node || typeof node !== 'object') return;
  if (node.type) {
    visitor(node, parents);
    parents = [...parents, node];
  }
  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'start' || key === 'end') continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child) walkAst(item, visitor, parents);
    } else if (child && typeof child === 'object' && child.type) {
      walkAst(child, visitor, parents);
    }
  }
}

function walkAstPostOrder(node: any, visitor: (node: any) => void): void {
  if (!node || typeof node !== 'object') return;
  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'start' || key === 'end') continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child) walkAstPostOrder(item, visitor);
    } else if (child && typeof child === 'object' && child.type) {
      walkAstPostOrder(child, visitor);
    }
  }
  if (node.type) visitor(node);
}
