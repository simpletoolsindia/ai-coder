import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Runtime } from '../../src/core/runtime.js';
import { EventBus } from '../../src/core/event-bus.js';
import { Logger, silentTransport } from '../../src/core/logger.js';
import { PluginManager } from '../../src/core/plugin-manager.js';
import { coreToolsPlugin } from '../../src/tools/index.js';
import { builtInPlugins } from '../../src/plugins/index.js';
import { filesystemTools } from '../../src/tools/filesystem/index.js';
import { searchTools } from '../../src/tools/search/index.js';
import { terminalTools } from '../../src/tools/terminal/index.js';
import { memoryPlugin as _memoryPlugin, getMemoryStore as _getMemoryStore } from '../../src/plugins/memory/index.js';
import { contextPlugin as _contextPlugin } from '../../src/plugins/context/index.js';
import { todoPlugin as _todoPlugin } from '../../src/plugins/todo/index.js';
import { webSearchPlugin as _webSearchPlugin } from '../../src/plugins/web-search/index.js';
import { mcpPlugin as _mcpPlugin, setMCPRegistry, getMCPRegistry, MCPClientRegistry, InProcessMCPClient } from '../../src/plugins/mcp/index.js';
import { subAgentsPlugin as _subAgentsPlugin, setSubAgentExecutor } from '../../src/plugins/subagents/index.js';
import type { ChatResponse, Provider } from '../../src/core/types.js';

class MockProvider implements Provider {
  id = 'mock';
  kind = 'openai' as const;
  name = 'mock';
  responses: ChatResponse[] = [];
  async chat(): Promise<ChatResponse> {
    const r = this.responses.shift();
    if (r) return r;
    return { id: '1', model: 'm', choices: [{ index: 0, message: { role: 'assistant', content: '' }, finishReason: 'stop' }] };
  }
}

let dir: string;
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'ai-by-plugin-flow-'));
  await fs.writeFile(join(dir, 'a.txt'), 'hello world', 'utf-8');
  await fs.mkdir(join(dir, 'sub'));
  await fs.writeFile(join(dir, 'sub', 'b.txt'), 'hello nested', 'utf-8');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function makeRuntime(): { runtime: Runtime; mock: MockProvider; bus: EventBus } {
  const bus = new EventBus();
  const logger = new Logger({ level: 'silent', transports: [silentTransport] });
  const r = new Runtime({ logger, events: bus });
  const mock = new MockProvider();
  (r.providers as unknown as { providers: Map<string, Provider> }).providers.set('mock', mock);
  (r.providers as unknown as { activeId: string }).activeId = 'mock';
  const pm = new PluginManager({
    settings: r.settings,
    tools: r.tools,
    commands: r.commands,
    permissions: r.permissions,
    events: bus,
    builtins: [coreToolsPlugin, ...builtInPlugins],
  });
  r.plugins = pm;
  r.planner['options'].plugins = pm;
  // pre-register core tools so they are usable
  r.tools.registerMany([...filesystemTools, ...searchTools, ...terminalTools]);
  // custom sub-agent
  setSubAgentExecutor(async (spec, req) => ({ name: spec.name, text: `handled: ${req}`, steps: 1, ok: true }));
  return { runtime: r, mock, bus };
}

describe('Integration: full plugin flow', () => {
  it('loads memory plugin, adds entry, then queries it', async () => {
    const { runtime: r } = makeRuntime();
    const memStore = new (await import('../../src/plugins/memory/index.js')).MemoryStore({
      persistPath: join(dir, 'memory.json'),
      maxEntries: 100,
    });
    (await import('../../src/plugins/memory/index.js')).setMemoryStore(memStore);
    await r.plugins!.load('memory');
    const add = await r.tools.invoke('memory.add', { content: 'hello from test' }, { cwd: dir, caller: 't', sessionId: 's' });
    expect(add.ok).toBe(true);
    const search = await r.tools.invoke('memory.search', { query: 'test' }, { cwd: dir, caller: 't', sessionId: 's' });
    expect(search.ok).toBe(true);
    const data = search.data as { results: { content: string }[] };
    expect(data.results.some((e) => e.content === 'hello from test')).toBe(true);
  });

  it('loads todo plugin and creates todos', async () => {
    const { runtime: r } = makeRuntime();
    await r.plugins!.load('todo');
    const res = await r.tools.invoke('todo.add', { content: 'write tests' }, { cwd: dir, caller: 't', sessionId: 's' });
    expect(res.ok).toBe(true);
    const list = await r.tools.invoke('todo.list', {}, { cwd: dir, caller: 't', sessionId: 's' });
    expect(list.ok).toBe(true);
    const data = list.data as { items: { content: string }[] };
    expect(data.items.some((i) => i.content === 'write tests')).toBe(true);
  });

  it('loads context plugin and counts tokens', async () => {
    const { runtime: r } = makeRuntime();
    await r.plugins!.load('context');
    const res = await r.tools.invoke('context.tokens', { text: 'a'.repeat(400) }, { cwd: dir, caller: 't', sessionId: 's' });
    expect(res.ok).toBe(true);
    const data = res.data as { tokens: number };
    expect(data.tokens).toBe(100);
  });

  it('loads context plugin and builds a project map', async () => {
    const { runtime: r } = makeRuntime();
    await r.plugins!.load('context');
    const res = await r.tools.invoke('context.project-map', { cwd: '.' }, { cwd: dir, caller: 't', sessionId: 's' });
    expect(res.ok).toBe(true);
    const data = res.data as { count: number };
    expect(data.count).toBeGreaterThan(0);
  });

  it('loads web-search plugin and uses SearXNG provider', async () => {
    const { runtime: r } = makeRuntime();
    await r.plugins!.load('web-search');
    const provider = (await import('../../src/plugins/web-search/index.js')).getSearchProvider();
    expect(provider).toBeInstanceOf((await import('../../src/plugins/web-search/index.js')).SearXNGProvider);
  });

  it('loads subagents plugin and runs a sub-agent', async () => {
    const { runtime: r } = makeRuntime();
    await r.plugins!.load('subagents');
    const res = await r.tools.invoke(
      'subagent.run',
      { name: 'worker', request: 'fix the bug' },
      { cwd: dir, caller: 't', sessionId: 's' },
    );
    expect(res.ok).toBe(true);
    const data = res.data as { text: string };
    expect(data.text).toContain('fix the bug');
  });

  it('MCP plugin integrates with in-process client', async () => {
    const { runtime: r } = makeRuntime();
    const client = new InProcessMCPClient();
    client.registerTool({ name: 'echo', description: 'echo', inputSchema: {} }, async (args) => args);
    setMCPRegistry(new MCPClientRegistry());
    getMCPRegistry().register('s1', client);
    await r.settings.setPluginEnabled('mcp', true);
    await r.plugins!.load('mcp');
    expect(r.tools.has('mcp.s1.echo')).toBe(true);
    const res = await r.tools.invoke('mcp.s1.echo', { hi: 1 }, { cwd: dir, caller: 't', sessionId: 's' });
    expect(res.ok).toBe(true);
  });
});
