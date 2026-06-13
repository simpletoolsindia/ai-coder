import { describe, it, expect, vi } from 'vitest';
import { SearXNGProvider, webSearchPlugin } from '../../src/plugins/web-search/index.js';
import { inMemoryIO, SettingsManager } from '../../src/core/settings-manager.js';
import { ToolRegistry } from '../../src/core/tool-resolver.js';
import { CommandRegistry } from '../../src/core/command-registry.js';
import { PermissionEngine } from '../../src/core/permission-engine.js';
import { EventBus } from '../../src/core/event-bus.js';

describe('SearXNGProvider', () => {
  it('searches and parses results', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ results: [{ title: 't', url: 'u', content: 'c', engine: 'e' }] }), { status: 200 }),
    );
    const p = new SearXNGProvider({ baseUrl: 'https://x', fetchImpl: fetchImpl as unknown as typeof fetch });
    const res = await p.search({ query: 'foo' });
    expect(res[0]?.title).toBe('t');
  });

  it('throws when baseUrl is empty', async () => {
    const p = new SearXNGProvider({ baseUrl: '' });
    await expect(p.search({ query: 'x' })).rejects.toThrow();
  });

  it('retries on failure', async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls++;
      if (calls < 2) return new Response('err', { status: 500 });
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    });
    const p = new SearXNGProvider({ baseUrl: 'https://x', fetchImpl: fetchImpl as unknown as typeof fetch });
    const res = await p.search({ query: 'foo', retry: 3 });
    expect(calls).toBe(2);
    expect(res).toEqual([]);
  });
});

describe('web-search plugin', () => {
  it('setup registers tools', async () => {
    const settings = new SettingsManager({ io: inMemoryIO(), fileName: 's.json', configDir: '/tmp/x', autoPersist: false });
    const tools = new ToolRegistry({ settings });
    const bus = new EventBus();
    await webSearchPlugin.setup!({
      container: undefined as never,
      events: bus,
      logger: undefined as never,
      settings,
      providers: undefined as never,
      tools,
      commands: new CommandRegistry(),
      permissions: new PermissionEngine({ settings }),
    });
    expect(tools.has('web.search')).toBe(true);
    expect(tools.has('web.fetch')).toBe(true);
  });
});
