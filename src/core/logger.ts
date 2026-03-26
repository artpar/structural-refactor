export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  scope: string;
  message: string;
  data: Record<string, unknown>;
}

export interface Logger {
  trace(scope: string, message: string, data: Record<string, unknown>): void;
  debug(scope: string, message: string, data: Record<string, unknown>): void;
  info(scope: string, message: string, data: Record<string, unknown>): void;
  warn(scope: string, message: string, data: Record<string, unknown>): void;
  error(scope: string, message: string, data: Record<string, unknown>): void;
  /** Internal — used by setLogLevel */
  _state: { level: LogLevel };
}

export interface LoggerOptions {
  level: LogLevel;
  sink: (entry: LogEntry) => void;
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
};

function shouldLog(configured: LogLevel, entry: LogLevel): boolean {
  return LEVEL_ORDER[entry] >= LEVEL_ORDER[configured];
}

export function createLogger(options: LoggerOptions): Logger {
  const state = { level: options.level };

  function log(level: LogLevel, scope: string, message: string, data: Record<string, unknown>): void {
    if (!shouldLog(state.level, level)) return;
    options.sink({
      timestamp: new Date().toISOString(),
      level,
      scope,
      message,
      data,
    });
  }

  return {
    _state: state,
    trace: (scope, message, data) => log('trace', scope, message, data),
    debug: (scope, message, data) => log('debug', scope, message, data),
    info: (scope, message, data) => log('info', scope, message, data),
    warn: (scope, message, data) => log('warn', scope, message, data),
    error: (scope, message, data) => log('error', scope, message, data),
  };
}

export function setLogLevel(logger: Logger, level: LogLevel): void {
  logger._state.level = level;
}

/** Default console sink — structured JSON to stderr */
export function consoleSink(entry: LogEntry): void {
  const line = JSON.stringify(entry);
  process.stderr.write(line + '\n');
}
