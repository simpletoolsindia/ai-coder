import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CommandRegistry, CommandNotFoundError, CommandParseError } from '../../src/core/command-registry.js';
import { EventBus } from '../../src/core/event-bus.js';
import type { CommandDefinition } from '../../src/core/types.js';

describe('CommandRegistry', () => {
  let reg: CommandRegistry;
  let bus: EventBus;
  beforeEach(() => {
    bus = new EventBus();
    reg = new CommandRegistry({ events: bus });
  });

  it('registers a command', () => {
    const cmd: CommandDefinition = { id: 't', name: '/t', description: 'd', pluginId: 'p', execute: () => undefined };
    reg.register(cmd);
    expect(reg.has('/t')).toBe(true);
  });

  it('throws on duplicate registration', () => {
    const cmd: CommandDefinition = { id: 't', name: '/t', description: 'd', pluginId: 'p', execute: () => undefined };
    reg.register(cmd);
    expect(() => reg.register(cmd)).toThrow();
  });

  it('registerMany registers all', () => {
    reg.registerMany([
      { id: 'a', name: '/a', description: '', pluginId: 'p', execute: () => undefined },
      { id: 'b', name: '/b', description: '', pluginId: 'p', execute: () => undefined },
    ]);
    expect(reg.list()).toHaveLength(2);
  });

  it('unregister removes the command', () => {
    const cmd: CommandDefinition = { id: 't', name: '/t', description: 'd', pluginId: 'p', execute: () => undefined };
    reg.register(cmd);
    expect(reg.unregister('/t')).toBe(true);
    expect(reg.has('/t')).toBe(false);
  });

  it('aliases resolve to target', () => {
    const cmd: CommandDefinition = { id: 't', name: '/t', description: '', pluginId: 'p', execute: () => undefined };
    reg.register(cmd);
    reg.registerAlias('/x', '/t');
    expect(reg.has('/x')).toBe(true);
    expect(reg.get('/x')?.id).toBe('t');
  });

  it('alias cannot equal target', () => {
    expect(() => reg.registerAlias('/a', '/a')).toThrow();
  });

  it('parses command and args', () => {
    expect(reg.parse('/hello world')).toEqual({ name: '/hello', args: 'world' });
    expect(reg.parse('/hello')).toEqual({ name: '/hello', args: '' });
  });

  it('parse throws on bad input', () => {
    expect(() => reg.parse('')).toThrow(CommandParseError);
    expect(() => reg.parse('hello')).toThrow(CommandParseError);
  });

  it('runs a registered command', async () => {
    const fn = vi.fn();
    const cmd: CommandDefinition = { id: 't', name: '/t', description: 'd', pluginId: 'p', execute: fn };
    reg.register(cmd);
    await reg.run('/t arg1');
    expect(fn).toHaveBeenCalledWith('arg1', expect.anything());
  });

  it('throws CommandNotFoundError for unknown command', async () => {
    await expect(reg.run('/missing')).rejects.toBeInstanceOf(CommandNotFoundError);
  });

  it('list filters hidden commands by default', () => {
    reg.registerMany([
      { id: 'a', name: '/a', description: '', pluginId: 'p', execute: () => undefined },
      { id: 'b', name: '/b', description: '', pluginId: 'p', hidden: true, execute: () => undefined },
    ]);
    expect(reg.list()).toHaveLength(1);
    expect(reg.list({ includeHidden: true })).toHaveLength(2);
  });

  it('names returns the registered names', () => {
    reg.register({ id: 'a', name: '/a', description: '', pluginId: 'p', execute: () => undefined });
    reg.register({ id: 'b', name: '/b', description: '', pluginId: 'p', execute: () => undefined });
    expect(reg.names().sort()).toEqual(['/a', '/b']);
  });

  it('clear removes everything', () => {
    reg.register({ id: 'a', name: '/a', description: '', pluginId: 'p', execute: () => undefined });
    reg.clear();
    expect(reg.list()).toHaveLength(0);
  });

  it('supports a custom prefix', () => {
    const r = new CommandRegistry({ prefix: '!' });
    expect(r.parse('!foo')).toEqual({ name: '!foo', args: '' });
  });
});
