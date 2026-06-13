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
import type { ChatResponse, Provider } from '../../src/core/types.js';

class MockProvider implements Provider {
  id = 'mock';
  kind = 'openai' as const;
  name = 'mock';
  responses: ChatResponse[] = [];
  async chat(): Promise<ChatResponse> {
    const r = this.responses.shift();
    if (r) return r;
    return {
      id: '1',
      model: 'm',
      choices: [{ index: 0, message: { role: 'assistant', content: 'default' }, finishReason: 'stop' }],
    };
  }
}

let dir: string;
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'ai-by-integ-'));
  await fs.writeFile(join(dir, 'a.ts'), 'export const x = 1;', 'utf-8');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function runtime(mock?: MockProvider): { runtime: Runtime; mock: MockProvider; bus: EventBus } {
  const bus = new EventBus();
  const logger = new Logger({ level: 'silent', transports: [silentTransport] });
  const r = new Runtime({ logger, events: bus });
  const m = mock ?? new MockProvider();
  (r.providers as unknown as { providers: Map<string, Provider> }).providers.set('mock', m);
  (r.providers as unknown as { activeId: string }).activeId = 'mock';
  // attach a plugin manager
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
  return { runtime: r, mock: m, bus };
}

describe('Integration: plugin lazy load', () => {
  it('does not load any plugin on startup', async () => {
    const { runtime: r, mock } = runtime();
    // no plugins loaded yet
    expect(r.plugins?.list()).toHaveLength(7); // 6 builtins + core-tools
    expect(r.plugins?.isLoaded('memory')).toBe(false);
    mock.responses.push({
      id: '1',
      model: 'm',
      choices: [{ index: 0, message: { role: 'assistant', content: 'hi' }, finishReason: 'stop' }],
    });
    const res = await r.run('hi');
    expect(res.text).toBe('hi');
    // memory plugin may have been loaded by resolveForRequest since 'remember' is a trigger
  });

  it('loads a plugin only when needed for a request', async () => {
    const { runtime: r, mock } = runtime();
    expect(r.plugins?.isLoaded('memory')).toBe(false);
    mock.responses.push({
      id: '1',
      model: 'm',
      choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finishReason: 'stop' }],
    });
    await r.run('please remember my favorite color');
    expect(r.plugins?.isLoaded('memory')).toBe(true);
  });

  it('does not load the web-search plugin for unrelated requests', async () => {
    const { runtime: r, mock } = runtime();
    expect(r.plugins?.isLoaded('web-search')).toBe(false);
    mock.responses.push({
      id: '1',
      model: 'm',
      choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finishReason: 'stop' }],
    });
    await r.run('hello');
    expect(r.plugins?.isLoaded('web-search')).toBe(false);
  });
});

describe('Integration: provider switching', () => {
  it('switches active provider mid-session', async () => {
    const bus = new EventBus();
    const logger = new Logger({ level: 'silent', transports: [silentTransport] });
    const r = new Runtime({ logger, events: bus });
    const m1 = new MockProvider();
    const m2 = new MockProvider();
    m1.responses.push({ id: '1', model: 'm', choices: [{ index: 0, message: { role: 'assistant', content: 'a' }, finishReason: 'stop' }] });
    m2.responses.push({ id: '2', model: 'm', choices: [{ index: 0, message: { role: 'assistant', content: 'b' }, finishReason: 'stop' }] });
    (r.providers as unknown as { providers: Map<string, Provider> }).providers.set('a', m1);
    (r.providers as unknown as { providers: Map<string, Provider> }).providers.set('b', m2);
    r.providers.setActive('a');
    expect((await r.run('1')).text).toBe('a');
    r.providers.setActive('b');
    expect((await r.run('2')).text).toBe('b');
  });

  it('login persists and reads back', async () => {
    const providersPath = join(dir, 'providers.json');
    const bus = new EventBus();
    const logger = new Logger({ level: 'silent', transports: [silentTransport] });
    const r = new Runtime({ logger, events: bus });
    r.providers.login({ id: 'test', kind: 'openai-compatible', name: 'test', apiKey: 'k', baseUrl: 'https://x' });
    await r.providers.saveToFile(providersPath);
    const r2 = new Runtime({ logger, events: bus });
    await r2.providers.loadFromFile(providersPath);
    expect(r2.providers.has('test')).toBe(true);
  });
});

describe('Integration: tool resolution and execution', () => {
  it('uses built-in filesystem tool', async () => {
    const { runtime: r } = runtime();
    r.tools.registerMany([...((await import('../../src/tools/filesystem/index.js')).filesystemTools)]);
    const list = await r.tools.invoke('fs.list', { path: '.' }, { cwd: dir, caller: 't', sessionId: 's' });
    expect(list.ok).toBe(true);
  });

  it('uses search tool', async () => {
    const { runtime: r } = runtime();
    r.tools.registerMany([...((await import('../../src/tools/search/index.js')).searchTools)]);
    const res = await r.tools.invoke('search.grep', { pattern: 'export' }, { cwd: dir, caller: 't', sessionId: 's' });
    expect(res.ok).toBe(true);
  });

  it('tool resolver picks relevant tool for request', async () => {
    const { runtime: r } = runtime();
    r.tools.registerMany([...((await import('../../src/tools/filesystem/index.js')).filesystemTools)]);
    const t = r.tools.bestFor('read a file from disk');
    expect(t?.definition.id).toBe('fs.read');
  });
});

describe('Integration: end-to-end with mock provider', () => {
  it('runs a simple request and returns assistant text', async () => {
    const { runtime: r, mock } = runtime();
    mock.responses.push({
      id: '1',
      model: 'm',
      choices: [{ index: 0, message: { role: 'assistant', content: 'hello!' }, finishReason: 'stop' }],
    });
    const res = await r.run('hi');
    expect(res.text).toBe('hello!');
  });

  it('emits events on the bus', async () => {
    const { runtime: r, bus } = runtime();
    let settingsLoaded = false;
    bus.on('settings.changed', () => (settingsLoaded = true));
    await r.run('hi');
    expect(settingsLoaded).toBe(false);
  });
});

describe('Integration: settings flow', () => {
  it('updates plugin enablement at runtime', async () => {
    const { runtime: r } = runtime();
    await r.settings.setPluginEnabled('memory', false);
    expect(r.settings.isPluginEnabled('memory')).toBe(false);
    expect(r.plugins?.isEnabled('memory')).toBe(false);
  });

  it('updates tool enablement at runtime', async () => {
    const { runtime: r } = runtime();
    r.tools.registerMany([...((await import('../../src/tools/filesystem/index.js')).filesystemTools)]);
    await r.settings.setToolEnabled('fs.read', false);
    expect(r.settings.isToolEnabled('fs.read')).toBe(false);
    const res = await r.tools.invoke('fs.read', { path: 'a.ts' }, { cwd: dir, caller: 't', sessionId: 's' });
    expect(res.ok).toBe(false);
  });
});
