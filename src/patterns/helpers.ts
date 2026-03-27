/**
 * Structural/behavioral operators for pattern detection.
 * Based on GEML (arxiv:2401.07042) and DP-CORE (arxiv:2506.03903).
 *
 * These check AST-derived structural features, NOT naming conventions.
 * Names are unreliable — obfuscation benchmark (arxiv:2512.07193) showed
 * detectors relying on names collapse from F1=0.86 to F1=0.13.
 */
import type { CodeUnitRecord } from '../scanner/types.js';

/** Types that are never factory products — primitives, utility wrappers, generics */
const EXCLUDED_RETURN_TYPES = new Set([
  'void', 'string', 'number', 'boolean', 'undefined', 'null',
  'any', 'unknown', 'never', 'object', 'symbol', 'bigint',
]);

const GENERIC_WRAPPERS = [
  'Promise', 'Array', 'Set', 'Map', 'WeakMap', 'WeakSet',
  'Record', 'Partial', 'Required', 'Readonly', 'Omit', 'Pick',
  'Extract', 'Exclude', 'ReturnType', 'InstanceType', 'Parameters',
  'Awaited', 'IterableIterator', 'AsyncIterableIterator', 'Generator',
];

const TEST_FILE_PATTERNS = [
  /\.test\.[jt]sx?$/,
  /\.spec\.[jt]sx?$/,
  /\/__tests__\//,
  /\/e2e\//,
  /\/test\//,
  /\.stories\.[jt]sx?$/,
];

/**
 * createObj operator: does the unit's body contain a `new` expression?
 * Checks the post-order AST nodeTypes array for NewExpression.
 */
export function containsNewExpression(unit: CodeUnitRecord): boolean {
  return unit.nodeTypes.includes('NewExpression');
}

/**
 * Check if a return type refers to a project-defined class, interface, or type alias.
 * Excludes primitives, Promise<T>, Array<T>, Record<K,V>, and other utility types.
 */
export function returnTypeIsProjectType(returnType: string, allUnits: CodeUnitRecord[]): boolean {
  if (!returnType) return false;

  const cleaned = stripGenericWrapper(returnType);
  if (!cleaned) return false;

  // Check against excluded types
  if (EXCLUDED_RETURN_TYPES.has(cleaned.toLowerCase())) return false;

  // Check if any unit in the project has this name
  return allUnits.some((u) =>
    (u.kind === 'class' || u.kind === 'interface' || u.kind === 'type') && u.name === cleaned,
  );
}

/**
 * Check if a return type is a generic utility wrapper (Promise<X>, Array<X>, etc.)
 */
export function isGenericWrapper(returnType: string): boolean {
  for (const wrapper of GENERIC_WRAPPERS) {
    if (returnType === wrapper || returnType.startsWith(`${wrapper}<`)) return true;
  }
  // Also check for array syntax: T[], readonly T[]
  if (returnType.endsWith('[]')) return true;
  return false;
}

/**
 * Check if return type is excluded from pattern detection (primitive, void, Promise, etc.)
 */
export function isExcludedReturnType(returnType: string): boolean {
  if (!returnType) return true;
  if (EXCLUDED_RETURN_TYPES.has(returnType.toLowerCase())) return true;
  if (isGenericWrapper(returnType)) return true;
  return false;
}

/**
 * Strip generic wrapper to get the inner type name.
 * "Promise<User>" → "User", "Array<string>" → "string", "User" → "User"
 */
export function stripGenericWrapper(returnType: string): string {
  // Handle Promise<X>, Array<X>, etc.
  for (const wrapper of GENERIC_WRAPPERS) {
    if (returnType.startsWith(`${wrapper}<`) && returnType.endsWith('>')) {
      return returnType.slice(wrapper.length + 1, -1).trim();
    }
  }
  // Handle T[]
  if (returnType.endsWith('[]')) {
    return returnType.slice(0, -2).trim();
  }
  return returnType;
}

/** Check if a file path is a test file */
export function isTestFile(filePath: string): boolean {
  return TEST_FILE_PATTERNS.some((p) => p.test(filePath));
}

/** Check if a function is a React hook (starts with use + uppercase) */
export function isReactHook(name: string): boolean {
  return /^use[A-Z]/.test(name);
}

/**
 * delegate operator: does function A call methods of type B?
 * Approximated by checking if unit's nodeTypes contain member calls
 * and the call target matches a known class/type name.
 */
export function containsDelegation(unit: CodeUnitRecord): boolean {
  return unit.nodeTypes.includes('MemberExpression') && unit.nodeTypes.includes('CallExpression');
}

/** Shared location builder for pattern detectors — single source of truth */
export function loc(unit: CodeUnitRecord, filePaths: Map<string, string>): import('./types.js').PatternLocation {
  return { filePath: filePaths.get(unit.name) ?? '', unitName: unit.name, line: unit.line };
}
