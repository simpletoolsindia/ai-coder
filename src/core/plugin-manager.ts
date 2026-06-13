import { EventBus } from './event-bus.js';
import { Logger, createLogger } from './logger.js';
import { SettingsManager } from './settings-manager.js';
import { CommandRegistry } from './command-registry.js';
import { ToolRegistry } from './tool-resolver.js';
import { PermissionEngine } from './permission-engine.js';
import type {
  CommandDefinition,
  LoadedPlugin,
  Plugin,
  PluginContext,
  PluginHookName,
  PluginHookPayload,
  PluginHookHandler,
  PluginManifest,
  Tool,
} from './types.js';
import { dynamicImport } from './utils/import.js';

export interface PluginManagerOptions {
  logger?: Logger;
  events?: EventBus;
  settings: SettingsManager;
  tools: ToolRegistry;
  commands: CommandRegistry;
  permissions: PermissionEngine;
  /** Additional directories to discover plugins from */
  searchPaths?: string[];
  /** Built-in plugins, always available */
  builtins?: Plugin[];
}

export interface PluginDiscoveryResult {
  id: string;
  manifest: PluginManifest;
  source: 'builtin' | 'path' | 'package' | 'memory';
  path?: string;
}

export class PluginManager {
  private manifests = new Map<string, PluginManifest>();
  private loaded = new Map<string, LoadedPlugin>();
  private builtins = new Map<string, Plugin>();
  private discoveryIndex = new Map<string, PluginDiscoveryResult>();
  private options: Required<Omit<PluginManagerOptions, 'events' | 'logger' | 'settings' | 'tools' | 'commands' | 'permissions' | 'builtins' | 'searchPaths'>> & {
    events: EventBus;
    logger: Logger;
    settings: SettingsManager;
    tools: ToolRegistry;
    commands: CommandRegistry;
    permissions: PermissionEngine;
    builtins: Plugin[];
    searchPaths: string[];
  };
  private hooks = new Map<string, Map<PluginHookName, PluginHookHandler<PluginHookName>[]>>();

  constructor(options: PluginManagerOptions) {
    const events = options.events ?? new EventBus();
    this.options = {
      logger: options.logger ?? createLogger({ level: 'info' }),
      events,
      settings: options.settings,
      tools: options.tools,
      commands: options.commands,
      permissions: options.permissions,
      builtins: options.builtins ?? [],
      searchPaths: options.searchPaths ?? [],
    };
    for (const b of this.options.builtins) {
      this.builtins.set(b.manifest.id, b);
      this.registerManifest(b.manifest, { source: 'builtin', plugin: b });
    }
  }

  registerManifest(manifest: PluginManifest, info: { source: PluginDiscoveryResult['source']; path?: string; plugin?: Plugin }): void {
    this.manifests.set(manifest.id, manifest);
    this.discoveryIndex.set(manifest.id, { id: manifest.id, manifest, source: info.source, path: info.path });
    if (info.plugin) {
      this.loaded.set(manifest.id, {
        ...info.plugin,
        initialized: false,
        status: 'idle',
      });
    }
    this.options.events?.emitSync('plugin.discovered', { id: manifest.id, source: info.source });
  }

  manifest(id: string): PluginManifest | undefined {
    return this.manifests.get(id);
  }

  list(): PluginDiscoveryResult[] {
    return Array.from(this.discoveryIndex.values());
  }

  enabled(): PluginManifest[] {
    return Array.from(this.manifests.values()).filter((m) => this.options.settings.isPluginEnabled(m.id));
  }

  isLoaded(id: string): boolean {
    return !!this.loaded.get(id)?.initialized;
  }

  isEnabled(id: string): boolean {
    const m = this.manifests.get(id);
    if (!m) return false;
    if (!m.enabled && !this.options.settings.isPluginEnabled(id)) return false;
    return this.options.settings.isPluginEnabled(id);
  }

  async enable(id: string): Promise<void> {
    const m = this.manifests.get(id);
    if (!m) throw new Error(`Plugin "${id}" not found`);
    await this.options.settings.setPluginEnabled(id, true);
    this.options.events?.emitSync('plugin.enabled', { id });
  }

  async disable(id: string): Promise<void> {
    const m = this.manifests.get(id);
    if (!m) throw new Error(`Plugin "${id}" not found`);
    await this.options.settings.setPluginEnabled(id, false);
    if (this.isLoaded(id)) {
      await this.unload(id);
    }
    this.options.events?.emitSync('plugin.disabled', { id });
  }

  async load(id: string): Promise<LoadedPlugin> {
    if (this.isLoaded(id)) {
      return this.loaded.get(id) as LoadedPlugin;
    }
    const manifest = this.manifests.get(id);
    if (!manifest) throw new Error(`Plugin "${id}" is not registered`);
    if (!this.isEnabled(id)) {
      throw new Error(`Plugin "${id}" is disabled`);
    }
    const ctx = this.buildContext();
    let plugin = this.loaded.get(id);
    const builtin = this.builtins.get(id);
    if (!plugin || !plugin.setup) {
      if (builtin) {
        plugin = { ...builtin, initialized: false, status: 'loading' };
        this.loaded.set(id, plugin);
      } else {
        const entry = manifest.entry ?? `./plugins/${id}/index.js`;
        const result = await dynamicImport(entry, id);
        plugin = { ...(result as Plugin), initialized: false, status: 'loading' };
        this.loaded.set(id, plugin);
      }
    } else {
      plugin.status = 'loading';
    }
    try {
      const init = (await plugin.setup?.(ctx)) ?? {};
      this.applyInitResult(id, init);
      plugin.initialized = true;
      plugin.status = 'ready';
      plugin.loadedAt = Date.now();
      this.options.events?.emitSync('plugin.loaded', { id });
    } catch (err) {
      plugin.status = 'error';
      plugin.error = (err as Error).message;
      this.options.events?.emitSync('plugin.error', { id, error: (err as Error).message });
      throw err;
    }
    return plugin;
  }

  async unload(id: string): Promise<void> {
    const plugin = this.loaded.get(id);
    if (!plugin || !plugin.initialized) return;
    const ctx = this.buildContext();
    try {
      await plugin.shutdown?.(ctx);
    } catch (err) {
      this.options.logger.warn(`Error during plugin "${id}" shutdown: ${(err as Error).message}`);
    }
    for (const t of plugin.manifest.tools ?? []) {
      this.options.tools.unregister(t);
    }
    for (const c of plugin.manifest.commands ?? []) {
      this.options.commands.unregister(c);
    }
    plugin.initialized = false;
    plugin.status = 'idle';
    this.options.events?.emitSync('plugin.unloaded', { id });
  }

  async reload(id: string): Promise<LoadedPlugin> {
    if (this.isLoaded(id)) await this.unload(id);
    this.loaded.delete(id);
    return this.load(id);
  }

  /**
   * Resolve which plugins are needed for a user request and load them.
   */
  async resolveForRequest(request: string, opts: { maxPlugins?: number } = {}): Promise<LoadedPlugin[]> {
    const requestTokens = tokenize(request);
    const candidates: { id: string; score: number }[] = [];
    for (const manifest of this.manifests.values()) {
      if (!this.isEnabled(manifest.id)) continue;
      if (this.isLoaded(manifest.id)) continue;
      let score = 0;
      const triggers = [...(manifest.triggers ?? []), ...(manifest.tags ?? [])];
      for (const t of triggers) {
        if (requestTokens.includes(t.toLowerCase())) score += 2;
        if (request.toLowerCase().includes(t.toLowerCase())) score += 3;
      }
      for (const toolId of manifest.tools ?? []) {
        if (request.toLowerCase().includes(toolId.toLowerCase())) score += 4;
      }
      if (score > 0) candidates.push({ id: manifest.id, score });
    }
    candidates.sort((a, b) => b.score - a.score);
    const max = opts.maxPlugins ?? 5;
    const loaded: LoadedPlugin[] = [];
    for (const c of candidates.slice(0, max)) {
      try {
        const lp = await this.load(c.id);
        loaded.push(lp);
      } catch (err) {
        this.options.logger.warn(`Failed to load plugin "${c.id}": ${(err as Error).message}`);
      }
    }
    return loaded;
  }

  registerHook<K extends PluginHookName>(
    pluginId: string,
    hook: K,
    handler: PluginHookHandler<K>,
  ): void {
    let map = this.hooks.get(pluginId);
    if (!map) {
      map = new Map();
      this.hooks.set(pluginId, map);
    }
    let list = map.get(hook) as PluginHookHandler<PluginHookName>[] | undefined;
    if (!list) {
      list = [];
      map.set(hook, list);
    }
    list.push(handler as PluginHookHandler<PluginHookName>);
  }

  async runHook<K extends PluginHookName>(
    hook: K,
    payload: PluginHookPayload[K],
  ): Promise<PluginHookPayload[K] | undefined> {
    const ctx = this.buildContext();
    let current: PluginHookPayload[K] | undefined = payload;
    for (const [pluginId, map] of this.hooks) {
      const list = map.get(hook);
      if (!list) continue;
      if (!this.isEnabled(pluginId)) continue;
      if (!this.isLoaded(pluginId) && this.manifests.get(pluginId)?.lazy !== false) {
        try {
          await this.load(pluginId);
        } catch {
          continue;
        }
      }
      for (const handler of list) {
        try {
          const result = await (handler as (p: PluginHookPayload[K], c: PluginContext) => Promise<unknown> | unknown)(
            current as PluginHookPayload[K],
            ctx,
          );
          if (result && typeof result === 'object') {
            current = { ...(current as object), ...(result as object) } as PluginHookPayload[K];
          }
        } catch (err) {
          this.options.logger.warn(`Hook "${hook}" in "${pluginId}" failed: ${(err as Error).message}`);
        }
      }
    }
    return current;
  }

  private applyInitResult(id: string, result: { tools?: Tool[]; commands?: CommandDefinition[]; hooks?: PluginHookName[] }): void {
    if (result.tools) {
      for (const t of result.tools) {
        if (!this.options.tools.has(t.definition.id)) {
          this.options.tools.register(t);
        }
      }
    }
    if (result.commands) {
      for (const c of result.commands) {
        if (!this.options.commands.has(c.name)) {
          this.options.commands.register(c);
        }
      }
    }
  }

  private buildContext(): PluginContext {
    return {
      container: undefined as never,
      events: this.options.events,
      logger: this.options.logger,
      settings: this.options.settings,
      providers: undefined as never,
      tools: this.options.tools,
      commands: this.options.commands,
      permissions: this.options.permissions,
    };
  }
}

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9_\- ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

export const createPluginManager = (options: PluginManagerOptions): PluginManager =>
  new PluginManager(options);
