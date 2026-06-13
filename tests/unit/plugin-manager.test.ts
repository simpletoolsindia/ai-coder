import { describe, it, expect, beforeEach } from 'vitest';
import { PluginManager } from '../../src/core/plugin-manager.js';
import { EventBus } from '../../src/core/event-bus.js';
import { inMemoryIO, SettingsManager } from '../../src/core/settings-manager.js';
import { ToolRegistry } from '../../src/core/tool-resolver.js';
import { CommandRegistry } from '../../src/core/command-registry.js';
import { PermissionEngine } from '../../src/core/permission-engine.js';
import type { Plugin } from '../../src/core/types.js';

function makePlugin(id: string, opts: Partial<Plugin['manifest']> = {}): Plugin {
  return {
    manifest: {
      id,
      version: '1.0.0',
      description: `desc ${id}`,
      lazy: true,
      enabled: true,
      triggers: [id],
      ...opts,
    },
    async setup(ctx) {
      ctx.tools.register({
        definition: {
          id: `${id}.tool`,
          name: `${id} Tool`,
          description: 'd',
          category: 'filesystem',
          pluginId: id,
          parameters: { type: 'object', properties: {} },
        },
        execute: async () => ({ ok: true }),
      });
      return { tools: [], hooks: [] };
    },
  };
}

describe('PluginManager', () => {
  let settings: SettingsManager;
  let tools: ToolRegistry;
  let commands: CommandRegistry;
  let permissions: PermissionEngine;
  let bus: EventBus;
  let pm: PluginManager;

  beforeEach(() => {
    settings = new SettingsManager({ io: inMemoryIO(), fileName: 's.json', configDir: '/tmp/x', autoPersist: false });
    tools = new ToolRegistry({ settings });
    commands = new CommandRegistry();
    permissions = new PermissionEngine({ settings });
    bus = new EventBus();
    pm = new PluginManager({
      settings,
      tools,
      commands,
      permissions,
      events: bus,
      builtins: [makePlugin('a'), makePlugin('b')],
    });
  });

  it('lists registered manifests', () => {
    expect(pm.list().map((p) => p.id).sort()).toEqual(['a', 'b']);
  });

  it('isLoaded returns false for not-loaded plugins', () => {
    expect(pm.isLoaded('a')).toBe(false);
  });

  it('isEnabled respects manifest and settings', () => {
    expect(pm.isEnabled('a')).toBe(true);
  });

  it('disable toggles settings and unloads', async () => {
    await pm.load('a');
    expect(pm.isLoaded('a')).toBe(true);
    await pm.disable('a');
    expect(pm.isEnabled('a')).toBe(false);
    expect(pm.isLoaded('a')).toBe(false);
  });

  it('enable flips the flag', async () => {
    await pm.disable('a');
    await pm.enable('a');
    expect(pm.isEnabled('a')).toBe(true);
  });

  it('loads a builtin plugin', async () => {
    const p = await pm.load('a');
    expect(p.initialized).toBe(true);
    expect(p.status).toBe('ready');
  });

  it('unload calls shutdown and unregisters tools', async () => {
    await pm.load('a');
    await pm.unload('a');
    expect(pm.isLoaded('a')).toBe(false);
  });

  it('reload calls unload and load', async () => {
    await pm.load('a');
    const p = await pm.reload('a');
    expect(p.initialized).toBe(true);
  });

  it('resolveForRequest loads relevant plugins', async () => {
    const loaded = await pm.resolveForRequest('please help with a');
    expect(loaded.map((p) => p.manifest.id)).toContain('a');
  });

  it('resolveForRequest ignores disabled plugins', async () => {
    await pm.disable('a');
    const loaded = await pm.resolveForRequest('a');
    expect(loaded.map((p) => p.manifest.id)).not.toContain('a');
  });

  it('load throws on unknown id', async () => {
    await expect(pm.load('unknown')).rejects.toThrow();
  });

  it('load throws when disabled', async () => {
    await pm.disable('a');
    await expect(pm.load('a')).rejects.toThrow(/disabled/);
  });

  it('registers hooks and runs them', async () => {
    const calls: string[] = [];
    const fn: Parameters<typeof pm.registerHook>[2] = (payload) => {
      calls.push('hook');
      return { ...(payload as object), prompt: 'transformed' } as never;
    };
    pm.registerHook('a', 'beforeRequest', fn);
    await pm.load('a');
    const result = await pm.runHook('beforeRequest', { prompt: 'orig', context: {} });
    expect(calls).toEqual(['hook']);
    expect((result as { prompt: string }).prompt).toBe('transformed');
  });

  it('emits discovery event', () => {
    const seen: string[] = [];
    bus.on('plugin.discovered', (p) => seen.push((p as { id: string }).id));
    pm.registerManifest({ id: 'c', version: '1', description: 'd', lazy: true, enabled: true }, { source: 'memory' });
    expect(seen).toContain('c');
  });
});
