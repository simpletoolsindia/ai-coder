import { describe, it, expect } from 'vitest';
import { SearXNGProvider } from '../../src/plugins/web-search/index.js';
import { InProcessMCPClient, setMCPRegistry, getMCPRegistry, MCPClientRegistry, mcpPlugin } from '../../src/plugins/mcp/index.js';
import { inMemoryIO, SettingsManager } from '../../src/core/settings-manager.js';
import { ToolRegistry } from '../../src/core/tool-resolver.js';
import { CommandRegistry } from '../../src/core/command-registry.js';
import { PermissionEngine } from '../../src/core/permission-engine.js';
import { EventBus } from '../../src/core/event-bus.js';

describe('Integration: SearXNG and MCP plugins', () => {
  it('web-search plugin uses configured SearXNG URL', async () => {
    const settings = new SettingsManager({ io: inMemoryIO(), fileName: 's.json', configDir: '/tmp/x', autoPersist: false });
    await settings.update('search', (s) => ({ ...s, searxngUrl: 'https://my-searx.example.com' }));
    const tools = new ToolRegistry({ settings });
    await mcpPlugin.setup!({
      container: undefined as never,
      events: new EventBus(),
      logger: { warn: () => undefined, info: () => undefined, error: () => undefined, debug: () => undefined, child: () => ({} as never) } as never,
      settings: new SettingsManager({ io: inMemoryIO(), fileName: 's.json', configDir: '/tmp/x', autoPersist: false }),
      providers: undefined as never,
      tools,
      commands: new CommandRegistry(),
      permissions: new PermissionEngine({ settings: new SettingsManager({ io: inMemoryIO(), fileName: 's.json', configDir: '/tmp/x', autoPersist: false }) }),
    });
    const { webSearchPlugin } = await import('../../src/plugins/web-search/index.js');
    await webSearchPlugin.setup!({
      container: undefined as never,
      events: new EventBus(),
      logger: { warn: () => undefined, info: () => undefined, error: () => undefined, debug: () => undefined, child: () => ({} as never) } as never,
      settings,
      providers: undefined as never,
      tools,
      commands: new CommandRegistry(),
      permissions: new PermissionEngine({ settings }),
    });
    const provider = (await import('../../src/plugins/web-search/index.js')).getSearchProvider();
    expect(provider).toBeInstanceOf(SearXNGProvider);
  });

  it('MCP plugin enumerates and invokes client tools', async () => {
    const client = new InProcessMCPClient();
    let received: unknown;
    client.registerTool(
      { name: 'echo', description: 'echo', inputSchema: { type: 'object', properties: { v: { type: 'string' } } } },
      async (args) => {
        received = args;
        return args;
      },
    );
    setMCPRegistry(new MCPClientRegistry());
    getMCPRegistry().register('s1', client);
    const tools = new ToolRegistry({
      settings: new SettingsManager({ io: inMemoryIO(), fileName: 's.json', configDir: '/tmp/x', autoPersist: false }),
    });
    await mcpPlugin.setup!({
      container: undefined as never,
      events: new EventBus(),
      logger: { warn: () => undefined, info: () => undefined, error: () => undefined, debug: () => undefined, child: () => ({} as never) } as never,
      settings: new SettingsManager({ io: inMemoryIO(), fileName: 's.json', configDir: '/tmp/x', autoPersist: false }),
      providers: undefined as never,
      tools,
      commands: new CommandRegistry(),
      permissions: new PermissionEngine({ settings: new SettingsManager({ io: inMemoryIO(), fileName: 's.json', configDir: '/tmp/x', autoPersist: false }) }),
    });
    expect(tools.has('mcp.s1.echo')).toBe(true);
    const res = await tools.invoke('mcp.s1.echo', { v: 'hi' }, { cwd: '/', caller: 't', sessionId: 's' });
    expect(res.ok).toBe(true);
    expect(received).toEqual({ v: 'hi' });
  });
});
