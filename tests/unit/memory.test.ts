import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MemoryStore, getMemoryStore, setMemoryStore } from '../../src/plugins/memory/index.js';
import type { ToolExecutionContext } from '../../src/core/types.js';

let dir: string;
let store: MemoryStore;
let _ctx: ToolExecutionContext;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ai-by-mem-'));
  store = new MemoryStore({ persistPath: join(dir, 'memory.json'), maxEntries: 100 });
  setMemoryStore(store);
  _ctx = {
    cwd: dir,
    caller: 'test',
    sessionId: 's',
    permissions: { action: 'allow' },
    logger: { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined, child: () => ({} as never) } as never,
  };
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('MemoryStore', () => {
  it('add and list', () => {
    store.add('one');
    store.add('two');
    expect(store.size()).toBe(2);
    expect(store.list().map((e) => e.content)).toEqual(['one', 'two']);
  });

  it('removes entries', () => {
    const e = store.add('one');
    expect(store.remove(e.id)).toBe(true);
    expect(store.size()).toBe(0);
  });

  it('searches by token', () => {
    store.add('apple banana');
    store.add('apple cherry');
    store.add('date');
    const results = store.search('apple');
    expect(results.length).toBe(2);
  });

  it('clears all entries', () => {
    store.add('x');
    store.clear();
    expect(store.size()).toBe(0);
  });

  it('respects max entries', () => {
    const small = new MemoryStore({ persistPath: join(dir, 'm2.json'), maxEntries: 2 });
    small.add('a');
    small.add('b');
    small.add('c');
    expect(small.size()).toBe(2);
  });

  it('loads from file', async () => {
    const data = { entries: [{ id: 'x', content: 'pre', tags: [], createdAt: 1, updatedAt: 1 }] };
    await fs.writeFile(join(dir, 'load.json'), JSON.stringify(data), 'utf-8');
    const s = new MemoryStore({ persistPath: join(dir, 'load.json'), maxEntries: 100 });
    await s.load();
    expect(s.size()).toBe(1);
  });

  it('handles missing file gracefully', async () => {
    const s = new MemoryStore({ persistPath: join(dir, 'missing.json'), maxEntries: 100 });
    await s.load();
    expect(s.size()).toBe(0);
  });

  it('saves and reloads', async () => {
    const path = join(dir, 'save.json');
    const s = new MemoryStore({ persistPath: path, maxEntries: 100 });
    s.add('persisted');
    await s.save();
    const s2 = new MemoryStore({ persistPath: path, maxEntries: 100 });
    await s2.load();
    expect(s2.size()).toBe(1);
  });

  it('getMemoryStore returns a singleton by default', () => {
    const a = getMemoryStore();
    const b = getMemoryStore();
    expect(a).toBe(b);
  });
});

import { memoryPlugin } from '../../src/plugins/memory/index.js';
import { EventBus } from '../../src/core/event-bus.js';
import { inMemoryIO, SettingsManager } from '../../src/core/settings-manager.js';
import { ToolRegistry } from '../../src/core/tool-resolver.js';
import { CommandRegistry } from '../../src/core/command-registry.js';
import { PermissionEngine } from '../../src/core/permission-engine.js';


describe('memory plugin', () => {
  it('manifest is valid', () => {
    expect(memoryPlugin.manifest.id).toBe('memory');
    expect(memoryPlugin.manifest.lazy).toBe(true);
  });

  it('setup registers tools and loads store', async () => {
    const settings = new SettingsManager({ io: inMemoryIO(), fileName: 's.json', configDir: '/tmp/x', autoPersist: false });
    const tools = new ToolRegistry({ settings });
    const commands = new CommandRegistry();
    const permissions = new PermissionEngine({ settings });
    const bus = new EventBus();
    await memoryPlugin.setup!({
      container: undefined as never,
      events: bus,
      logger: undefined as never,
      settings,
      providers: undefined as never,
      tools,
      commands,
      permissions,
    });
    expect(tools.has('memory.add')).toBe(true);
    expect(tools.has('memory.search')).toBe(true);
  });

  it('memory.add tool inserts entries', async () => {
    const settings = new SettingsManager({ io: inMemoryIO(), fileName: 's.json', configDir: '/tmp/x', autoPersist: false });
    const tools = new ToolRegistry({ settings });
    const bus = new EventBus();
    await memoryPlugin.setup!({
      container: undefined as never,
      events: bus,
      logger: undefined as never,
      settings,
      providers: undefined as never,
      tools,
      commands: new CommandRegistry(),
      permissions: new PermissionEngine({ settings }),
    });
    const res = await tools.invoke('memory.add', { content: 'hello' }, { cwd: dir, caller: 't', sessionId: 's' });
    expect(res.ok).toBe(true);
  });
});
