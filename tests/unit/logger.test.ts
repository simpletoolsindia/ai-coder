import { describe, it, expect, vi } from 'vitest';
import { Logger, consoleTransport, silentTransport, memoryTransport } from '../../src/core/logger.js';

describe('Logger', () => {
  it('creates a logger with default level info', () => {
    const logger = new Logger();
    expect(logger.getLevel()).toBe('info');
  });

  it('emits logs at or above the configured level', () => {
    const entries: unknown[] = [];
    const transport = (e: unknown) => entries.push(e);
    const logger = new Logger({ level: 'warn', transports: [transport] });
    logger.debug('hidden');
    logger.info('hidden');
    logger.warn('shown');
    logger.error('shown');
    expect(entries).toHaveLength(2);
  });

  it('creates child loggers with combined scope', () => {
    const entries: unknown[] = [];
    const logger = new Logger({ level: 'debug', transports: [(e) => entries.push(e)] });
    const child = logger.child('auth');
    child.info('hello');
    const last = entries[entries.length - 1] as { scope?: string };
    expect(last?.scope).toBe('auth');
  });

  it('respects the silent flag', () => {
    const logger = new Logger({ silent: true });
    expect(logger.shouldLog('error')).toBe(false);
  });

  it('exposes silent and console transports', () => {
    expect(typeof silentTransport).toBe('function');
    expect(typeof consoleTransport).toBe('function');
    expect(typeof memoryTransport).toBe('function');
    memoryTransport({ level: 'info', message: 'x', timestamp: Date.now() });
  });

  it('does not throw when a transport throws', () => {
    const logger = new Logger({
      level: 'debug',
      transports: [() => {
        throw new Error('boom');
      }],
    });
    expect(() => logger.info('hello')).not.toThrow();
  });

  it('setLevel updates the level', () => {
    const logger = new Logger();
    logger.setLevel('error');
    expect(logger.getLevel()).toBe('error');
  });

  it('shares transports with children', () => {
    const seen: string[] = [];
    const logger = new Logger({ level: 'debug', transports: [(e) => seen.push(e.message)] });
    const child = logger.child('c');
    child.info('one');
    expect(seen).toContain('one');
  });

  it('child returns the same instance for the same scope', () => {
    const logger = new Logger();
    const a = logger.child('a');
    const b = logger.child('a');
    expect(a).toBe(b);
  });

  it('emits entries with timestamp and scope', () => {
    vi.useFakeTimers();
    const now = new Date('2024-01-01T00:00:00Z').getTime();
    vi.setSystemTime(now);
    let captured: { level: string; message: string; timestamp: number; scope?: string } | undefined;
    const logger = new Logger({ level: 'debug', transports: [(e) => (captured = e as never)] });
    logger.info('hello', { a: 1 });
    expect(captured?.timestamp).toBe(now);
    expect(captured?.message).toBe('hello');
    vi.useRealTimers();
  });
});
