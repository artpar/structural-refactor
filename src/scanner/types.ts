/** Value types for unified project scan results. All pure data — no AST nodes. */

export interface ImportRecord {
  source: string;
  specifiers: string[];
  resolved: string;
  isExternal: boolean;
}

export interface ExportRecord {
  name: string;
  isDefault: boolean;
  isReExport: boolean;
  reExportSource?: string;
}

export type CodeUnitKind = 'function' | 'class' | 'interface' | 'type' | 'enum' | 'variable' | 'arrow' | 'method';

export interface ParamRecord {
  name: string;
  type: string;
}

export interface MemberRecord {
  name: string;
  kind: 'property' | 'method' | 'getter' | 'setter';
  type?: string;
  isAsync?: boolean;
  paramCount?: number;
}

export interface CodeUnitRecord {
  name: string;
  kind: CodeUnitKind;
  line: number;
  exported: boolean;
  isAsync: boolean;
  params: ParamRecord[];
  returnType: string;
  members: MemberRecord[];
  /** Raw token list (type tokens, not names — for Type II clone invariance) */
  typeTokens: string[];
  /** AST node types in post-order (for Merkle hashing) */
  nodeTypes: string[];
  /** Statement classifications for decomposition */
  statementTypes: StatementType[];
  /** Line count of the body */
  bodyLineCount: number;
  /** Cyclomatic complexity */
  complexity: number;
}

export type StatementType = 'variable-def' | 'assignment' | 'conditional' | 'loop' | 'call' | 'return' | 'other';

export interface CallRecord {
  callerName: string;
  targetName: string;
  line: number;
}

export interface ScanResult {
  filePath: string;
  contentHash: string;
  imports: ImportRecord[];
  exports: ExportRecord[];
  codeUnits: CodeUnitRecord[];
  calls: CallRecord[];
}
