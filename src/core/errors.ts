/**
 * Structured error collection — errors are values, not exceptions.
 * Collected during operations and reported at the end.
 */

export type ErrorSeverity = 'warning' | 'error' | 'fatal';

export interface CollectedError {
  severity: ErrorSeverity;
  scope: string;         // module that produced the error (e.g., 'scanner', 'rename')
  filePath?: string;
  message: string;
  detail?: string;
}

export interface ErrorReport {
  errors: CollectedError[];
  warnings: CollectedError[];
  hasErrors: boolean;
  summary: string;
}

export function createErrorCollector(): ErrorCollector {
  const items: CollectedError[] = [];

  return {
    add(error: CollectedError) {
      items.push(error);
    },

    addParseError(filePath: string, error: unknown) {
      items.push({
        severity: 'warning',
        scope: 'parser',
        filePath,
        message: 'Failed to parse file',
        detail: String(error),
      });
    },

    addResolutionError(filePath: string, specifier: string) {
      items.push({
        severity: 'warning',
        scope: 'resolver',
        filePath,
        message: `Could not resolve import: ${specifier}`,
      });
    },

    addOperationError(scope: string, message: string, detail?: string) {
      items.push({
        severity: 'error',
        scope,
        message,
        detail,
      });
    },

    report(): ErrorReport {
      const errors = items.filter((e) => e.severity === 'error' || e.severity === 'fatal');
      const warnings = items.filter((e) => e.severity === 'warning');

      const parts: string[] = [];
      if (errors.length > 0) parts.push(`${errors.length} error(s)`);
      if (warnings.length > 0) parts.push(`${warnings.length} warning(s)`);

      return {
        errors,
        warnings,
        hasErrors: errors.length > 0,
        summary: parts.length > 0 ? parts.join(', ') : 'no issues',
      };
    },

    get count() {
      return items.length;
    },

    get all() {
      return [...items];
    },
  };
}

export interface ErrorCollector {
  add(error: CollectedError): void;
  addParseError(filePath: string, error: unknown): void;
  addResolutionError(filePath: string, specifier: string): void;
  addOperationError(scope: string, message: string, detail?: string): void;
  report(): ErrorReport;
  readonly count: number;
  readonly all: CollectedError[];
}
