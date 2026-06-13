import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventBus } from '../../src/core/event-bus.js';

describe('EventBus', () => {
  let bus: EventBus;
  beforeEach(() => {
    bus = new EventBus();
  });

  it('invokes handlers when emit is called', async () => {
    const fn = vi.fn();
    bus.on('test', fn);
    await bus.emit('test', { a: 1 });
    expect(fn).toHaveBeenCalledWith({ a: 1 });
  });

  it('once removes the handler after firing', async () => {
    const fn = vi.fn();
    bus.once('x', fn);
    await bus.emit('x');
    await bus.emit('x');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('on returns an unsubscribe function', () => {
    const fn = vi.fn();
    const off = bus.on('y', fn);
    off();
    bus.emitSync('y');
    expect(fn).not.toHaveBeenCalled();
  });

  it('onAny fires for any event', async () => {
    const fn = vi.fn();
    bus.onAny(fn);
    await bus.emit('a');
    await bus.emit('b');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('offEvent removes all listeners for an event', () => {
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    bus.on('z', fn1);
    bus.on('z', fn2);
    bus.offEvent('z');
    bus.emitSync('z');
    expect(fn1).not.toHaveBeenCalled();
    expect(fn2).not.toHaveBeenCalled();
  });

  it('handles async handlers in parallel', async () => {
    const order: string[] = [];
    bus.on('e', async () => {
      await new Promise((r) => setTimeout(r, 10));
      order.push('a');
    });
    bus.on('e', async () => {
      order.push('b');
    });
    await bus.emit('e');
    expect(order).toContain('a');
    expect(order).toContain('b');
  });

  it('emitSync invokes handlers immediately', () => {
    const fn = vi.fn();
    bus.on('s', fn);
    bus.emitSync('s', { x: 1 });
    expect(fn).toHaveBeenCalledWith({ x: 1 });
  });

  it('listenerCount counts registrations', () => {
    bus.on('a', () => undefined);
    bus.on('a', () => undefined);
    bus.on('b', () => undefined);
    expect(bus.listenerCount('a')).toBe(2);
    expect(bus.listenerCount('b')).toBe(1);
  });

  it('events() returns all registered events', () => {
    bus.on('a', () => undefined);
    bus.on('b', () => undefined);
    expect(bus.events().sort()).toEqual(['a', 'b']);
  });

  it('clear removes all listeners', () => {
    bus.on('a', () => undefined);
    bus.clear();
    expect(bus.listenerCount()).toBe(0);
  });

  it('dispose prevents future emits and unregisters', () => {
    const fn = vi.fn();
    bus.on('a', fn);
    bus.dispose();
    bus.emitSync('a');
    expect(fn).not.toHaveBeenCalled();
    expect((bus as unknown as { disposed: boolean }).disposed).toBe(true);
  });

  it('handler errors are reported via onError', async () => {
    const seen: Array<{ err: unknown; event: string }> = [];
    const bus2 = new EventBus({ onError: (err, event) => seen.push({ err, event }) });
    bus2.on('a', () => {
      throw new Error('boom');
    });
    await bus2.emit('a');
    expect(seen).toHaveLength(1);
    expect((seen[0]?.err as Error).message).toBe('boom');
  });

  it('throwOnHandlerError surfaces errors', async () => {
    const bus3 = new EventBus({ throwOnHandlerError: true });
    bus3.on('a', () => {
      throw new Error('boom');
    });
    await expect(bus3.emit('a')).rejects.toThrow('boom');
  });

  it('handler errors are logged by default', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    bus.on('a', () => {
      throw new Error('boom');
    });
    await bus.emit('a');
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
