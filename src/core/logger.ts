import type { LogLevel } from './types.js';

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: number;
  scope?: string;
  meta?: Record<string, unknown>;
}

export type LogTransport = (entry: LogEntry) => void;

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

const isBrowserLike = typeof globalThis !== 'undefined' && typeof (globalThis as { window?: unknown }).window === 'object';

const fmtScope = (scope?: string): string => (scope ? `[${scope}]` : '');

const formatLine = (entry: LogEntry): string => {
  const ts = new Date(entry.timestamp).toISOString();
  const scope = fmtScope(entry.scope);
  const level = entry.level.toUpperCase().padEnd(5, ' ');
  const meta = entry.meta && Object.keys(entry.meta).length > 0 ? ` ${JSON.stringify(entry.meta)}` : '';
  return `${ts} ${level} ${scope} ${entry.message}${meta}`;
};

export interface LoggerOptions {
  level?: LogLevel;
  scope?: string;
  transports?: LogTransport[];
  silent?: boolean;
}

export class Logger {
  private level: LogLevel;
  private scope?: string;
  private transports: LogTransport[] = [];
  private silent: boolean;
  private children = new Map<string, Logger>();

  constructor(opts: LoggerOptions = {}) {
    this.level = opts.level ?? 'info';
    this.scope = opts.scope;
    this.silent = opts.silent ?? false;
    if (opts.transports) this.transports.push(...opts.transports);
    if (!isBrowserLike && this.transports.length === 0) {
      this.transports.push(consoleTransport);
    }
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  getLevel(): LogLevel {
    return this.level;
  }

  addTransport(transport: LogTransport): void {
    this.transports.push(transport);
  }

  child(scope: string): Logger {
    const existing = this.children.get(scope);
    if (existing) return existing;
    const child = new Logger({
      level: this.level,
      scope: this.scope ? `${this.scope}:${scope}` : scope,
      transports: this.transports,
      silent: this.silent,
    });
    this.children.set(scope, child);
    return child;
  }

  shouldLog(level: LogLevel): boolean {
    if (this.silent) return false;
    return LEVEL_RANK[level] >= LEVEL_RANK[this.level];
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.emit('debug', message, meta);
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.emit('info', message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.emit('warn', message, meta);
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.emit('error', message, meta);
  }

  private emit(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    if (!this.shouldLog(level)) return;
    const entry: LogEntry = {
      level,
      message,
      timestamp: Date.now(),
      scope: this.scope,
      meta,
    };
    for (const t of this.transports) {
      try {
        t(entry);
      } catch {
        // never throw from a transport
      }
    }
  }
}

export const consoleTransport: LogTransport = (entry) => {
  const line = formatLine(entry);
  switch (entry.level) {
    case 'debug':
      console.debug(line);
      break;
    case 'info':
      console.info(line);
      break;
    case 'warn':
      console.warn(line);
      break;
    case 'error':
      console.error(line);
      break;
  }
};

export const memoryTransport: LogTransport = (() => {
  const buffer: LogEntry[] = [];
  const max = 500;
  return (entry) => {
    buffer.push(entry);
    if (buffer.length > max) buffer.shift();
  };
})();

export const silentTransport: LogTransport = () => {
  /* no-op */
};

export const createLogger = (opts: LoggerOptions = {}): Logger => new Logger(opts);

export const __loggerTesting = { formatLine, LEVEL_RANK };
