import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InProcessMCPClient, MCPClientRegistry, getMCPRegistry, setMCPRegistry, mcpPlugin } from '../../src/plugins/mcp/index.js';
import { inMemoryIO, SettingsManager } from '../../src/core/settings-manager.js';
import { ToolRegistry } from '../../src/core/tool-resolver.js';
import { CommandRegistry } from '../../src/core/command-registry.js';
import { PermissionEngine } from '../../src/core/permission-engine.js';
import { EventBus } from '../../src/core/event-bus.js';

describe('MCP', () => {
  let registry: MCPClientRegistry;
  beforeEach(() => {
    registry = new MCPClientRegistry();
    setMCPRegistry(registry);
  });

  it('InProcessMCPClient returns tools', async () => {
    const client = new InProcessMCPClient();
    client.registerTool(
      { name: 'echo', description: 'echo', inputSchema: { type: 'object', properties: { v: { type: 'string' } } } },
      async (args) => args,
    );
    const tools = await client.listTools();
    expect(tools).toHaveLength(1);
  });

  it('InProcessMCPClient.callTool invokes handler', async () => {
    const client = new InProcessMCPClient();
    client.registerTool({ name: 'echo', description: '', inputSchema: {} }, async (args) => args);
    const res = await client.callTool('echo', { x: 1 });
    expect(res).toEqual({ x: 1 });
  });

  it('InProcessMCPClient throws on unknown tool', async () => {
    const client = new InProcessMCPClient();
    await expect(client.callTool('nope', {})).rejects.toThrow();
  });

  it('MCPClientRegistry registers and lists', () => {
    registry.register('a', new InProcessMCPClient());
    expect(registry.ids()).toContain('a');
    expect(registry.get('a')).toBeDefined();
    expect(registry.unregister('a')).toBe(true);
  });

  it('getMCPRegistry returns singleton', () => {
    expect(getMCPRegistry()).toBeDefined();
  });

  it('mcp plugin setup registers list tool', async () => {
    const settings = new SettingsManager({ io: inMemoryIO(), fileName: 's.json', configDir: '/tmp/x', autoPersist: false });
    const tools = new ToolRegistry({ settings });
    await mcpPlugin.setup!({
      container: undefined as never,
      events: new EventBus(),
      logger: undefined as never,
      settings,
      providers: undefined as never,
      tools,
      commands: new CommandRegistry(),
      permissions: new PermissionEngine({ settings }),
    });
    expect(tools.has('mcp.list')).toBe(true);
  });

  it('mcp plugin setup with registered clients registers server tools', async () => {
    const settings = new SettingsManager({ io: inMemoryIO(), fileName: 's.json', configDir: '/tmp/x', autoPersist: false });
    const tools = new ToolRegistry({ settings });
    const client = new InProcessMCPClient();
    client.registerTool({ name: 'echo', description: 'echo', inputSchema: {} }, async (args) => args);
    setMCPRegistry(new MCPClientRegistry());
    getMCPRegistry().register('s1', client);
    await mcpPlugin.setup!({
      container: undefined as never,
      events: new EventBus(),
      logger: { warn: () => undefined, info: () => undefined, error: () => undefined, debug: () => undefined, child: () => ({} as never) } as never,
      settings,
      providers: undefined as never,
      tools,
      commands: new CommandRegistry(),
      permissions: new PermissionEngine({ settings }),
    });
    expect(tools.has('mcp.s1.echo')).toBe(true);
  });

  it('mcp plugin handles setup errors', async () => {
    const settings = new SettingsManager({ io: inMemoryIO(), fileName: 's.json', configDir: '/tmp/x', autoPersist: false });
    const tools = new ToolRegistry({ settings });
    const registry = new MCPClientRegistry();
    registry.register('broken', { listTools: async () => {
      throw new Error('nope');
    }, callTool: async () => null, close: async () => undefined });
    setMCPRegistry(registry);
    await mcpPlugin.setup!({
      container: undefined as never,
      events: new EventBus(),
      logger: { warn: () => undefined, info: () => undefined, error: () => undefined, debug: () => undefined, child: () => ({} as never) } as never,
      settings,
      providers: undefined as never,
      tools,
      commands: new CommandRegistry(),
      permissions: new PermissionEngine({ settings }),
    });
    expect(tools.has('mcp.list')).toBe(true);
  });

  it('mcp.call tool returns error for unknown server', async () => {
    const settings = new SettingsManager({ io: inMemoryIO(), fileName: 's.json', configDir: '/tmp/x', autoPersist: false });
    const tools = new ToolRegistry({ settings });
    await mcpPlugin.setup!({
      container: undefined as never,
      events: new EventBus(),
      logger: { warn: () => undefined, info: () => undefined, error: () => undefined, debug: () => undefined, child: () => ({} as never) } as never,
      settings,
      providers: undefined as never,
      tools,
      commands: new CommandRegistry(),
      permissions: new PermissionEngine({ settings }),
    });
    // register a fake call tool
    setMCPRegistry(new MCPClientRegistry());
    const res = await tools.invoke('mcp.s1.tool', {}, { cwd: '/', caller: 't', sessionId: 's' });
    expect(res.ok).toBe(false);
  });

  it('mcp.list tool returns tools', async () => {
    const settings = new SettingsManager({ io: inMemoryIO(), fileName: 's.json', configDir: '/tmp/x', autoPersist: false });
    const tools = new ToolRegistry({ settings });
    setMCPRegistry(new MCPClientRegistry());
    await mcpPlugin.setup!({
      container: undefined as never,
      events: new EventBus(),
      logger: { warn: () => undefined, info: () => undefined, error: () => undefined, debug: () => undefined, child: () => ({} as never) } as never,
      settings,
      providers: undefined as never,
      tools,
      commands: new CommandRegistry(),
      permissions: new PermissionEngine({ settings }),
    });
    const res = await tools.invoke('mcp.list', {}, { cwd: '/', caller: 't', sessionId: 's' });
    expect(res.ok).toBe(true);
  });

  it('mcp plugin shutdown closes all clients', async () => {
    const client = new InProcessMCPClient();
    const closed = vi.spyOn(client, 'close');
    setMCPRegistry(new MCPClientRegistry());
    getMCPRegistry().register('a', client);
    await mcpPlugin.shutdown!({
      container: undefined as never,
      events: new EventBus(),
      logger: undefined as never,
      settings: undefined as never,
      providers: undefined as never,
      tools: undefined as never,
      commands: undefined as never,
      permissions: undefined as never,
    });
    expect(closed).toHaveBeenCalled();
  });
});
