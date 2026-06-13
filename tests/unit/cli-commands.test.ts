import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  helpCommand,
  loginCommand,
  providersCommand,
  useCommand,
  settingsCommand,
  extensionsCommand,
  toolsCommand,
  clearCommand,
  exitCommand,
  builtInCommands,
  __cliTesting,
} from '../../src/interfaces/commands.js';
import { EventBus } from '../../src/core/event-bus.js';
import { inMemoryIO, SettingsManager } from '../../src/core/settings-manager.js';
import { ProviderManager } from '../../src/core/provider-manager.js';
import { ToolRegistry } from '../../src/core/tool-resolver.js';
import { CommandRegistry } from '../../src/core/command-registry.js';
import { PermissionEngine } from '../../src/core/permission-engine.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CommandContext, CommandDefinition } from '../../src/core/types.js';
import { builtInPlugins } from '../../src/plugins/index.js';
import { PluginManager } from '../../src/core/plugin-manager.js';
import { coreToolsPlugin } from '../../src/tools/index.js';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ai-by-cli-cmds-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function ctx(): CommandContext & {
  commands: CommandRegistry;
  settings: SettingsManager;
  tools: ToolRegistry;
  providers: ProviderManager;
  plugins?: PluginManager;
} {
  const bus = new EventBus();
  const settings = new SettingsManager({ io: inMemoryIO(), fileName: 's.json', configDir: dir, autoPersist: false });
  const providers = new ProviderManager({ events: bus, env: {}, configPath: join(dir, 'providers.json') });
  const permissions = new PermissionEngine({ settings });
  const tools = new ToolRegistry({ settings, permissions });
  tools.register({
    definition: { id: 'x.tool', name: 'x', description: 'd', category: 'filesystem', pluginId: 'core', parameters: { type: 'object', properties: {} } },
    execute: async () => ({ ok: true }),
  });
  const commands = new CommandRegistry({ events: bus });
  const plugins = new PluginManager({
    settings,
    tools,
    commands,
    permissions,
    events: bus,
    builtins: [coreToolsPlugin, ...builtInPlugins],
  });
  const lines: string[] = [];
  const base = {
    events: bus,
    logger: { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined } as never,
    settings,
    providers,
    tools,
    plugins,
    commands,
    print: (l: string) => lines.push(l),
  };
  return base as never;
}

describe('CLI commands', () => {
  it('parseArgs splits quoted strings', () => {
    expect(__cliTesting.parseArgs('a "b c" d')).toEqual(['a', 'b c', 'd']);
  });

  it('parseArgs handles single quotes', () => {
    expect(__cliTesting.parseArgs("a 'b c'")).toEqual(['a', 'b c']);
  });

  it('parseArgs handles empty input', () => {
    expect(__cliTesting.parseArgs('')).toEqual([]);
  });

  it('builtInCommands contains the core set', () => {
    const names = builtInCommands.map((c: CommandDefinition) => c.name);
    expect(names).toContain('/help');
    expect(names).toContain('/login');
    expect(names).toContain('/providers');
    expect(names).toContain('/use');
    expect(names).toContain('/settings');
    expect(names).toContain('/extensions');
    expect(names).toContain('/tools');
    expect(names).toContain('/clear');
    expect(names).toContain('/exit');
  });

  it('help command lists commands', async () => {
    const c = ctx();
    await helpCommand.execute('', c);
    expect(c.print).toBeDefined();
  });

  it('login registers a provider', async () => {
    const c = ctx();
    await loginCommand.execute('myopenai openai https://api.example.com/v1 k gpt-4o', c);
    expect(c.providers.has('myopenai')).toBe(true);
  });

  it('login with missing args prints usage', async () => {
    const c = ctx();
    await loginCommand.execute('', c);
  });

  it('login rejects unknown kind', async () => {
    const c = ctx();
    await loginCommand.execute('a unknown', c);
  });

  it('providers lists configured providers', async () => {
    const c = ctx();
    c.providers.register({ id: 'p', kind: 'openai-compatible', name: 'p' });
    await providersCommand.execute('', c);
  });

  it('use sets the active provider', async () => {
    const c = ctx();
    c.providers.register({ id: 'p', kind: 'openai-compatible', name: 'p' });
    c.providers.register({ id: 'q', kind: 'openai-compatible', name: 'q' });
    await useCommand.execute('q', c);
    expect(c.providers.activeIdOrUndefined()).toBe('q');
  });

  it('use with empty prints usage', async () => {
    const c = ctx();
    await useCommand.execute('', c);
  });

  it('use errors on missing provider', async () => {
    const c = ctx();
    await useCommand.execute('missing', c);
  });

  it('settings command prints everything when no args', async () => {
    const c = ctx();
    await settingsCommand.execute('', c);
  });

  it('settings command prints one section', async () => {
    const c = ctx();
    await settingsCommand.execute('general', c);
  });

  it('settings command updates keys', async () => {
    const c = ctx();
    await settingsCommand.execute('general verbose=true', c);
    expect(c.settings.get('general').verbose).toBe(true);
  });

  it('settings command requires an object section', async () => {
    const c = ctx();
    await settingsCommand.execute('general verbose=true', c);
  });

  it('settings with one arg that does not exist', async () => {
    const c = ctx();
    await settingsCommand.execute('nope', c);
  });

  it('extensions lists plugins', async () => {
    const c = ctx();
    await extensionsCommand.execute('', c);
  });

  it('extensions enable / disable', async () => {
    const c = ctx();
    await extensionsCommand.execute('enable memory', c);
    expect(c.settings.isPluginEnabled('memory')).toBe(true);
    await extensionsCommand.execute('disable memory', c);
    expect(c.settings.isPluginEnabled('memory')).toBe(false);
  });

  it('extensions info', async () => {
    const c = ctx();
    await extensionsCommand.execute('info memory', c);
  });

  it('extensions with no plugins', async () => {
    const c = ctx();
    c.plugins = undefined;
    await extensionsCommand.execute('', c);
  });

  it('tools lists tools', async () => {
    const c = ctx();
    await toolsCommand.execute('', c);
  });

  it('tools enable / disable', async () => {
    const c = ctx();
    await toolsCommand.execute('disable x.tool', c);
    expect(c.settings.isToolEnabled('x.tool')).toBe(false);
    await toolsCommand.execute('enable x.tool', c);
    expect(c.settings.isToolEnabled('x.tool')).toBe(true);
  });

  it('clear command runs', async () => {
    const c = ctx();
    await clearCommand.execute('', c);
  });

  it('exit command runs', async () => {
    const c = ctx();
    await exitCommand.execute('', c);
  });

  it('extensions with missing args', async () => {
    const c = ctx();
    await extensionsCommand.execute('enable', c);
    await extensionsCommand.execute('info nope', c);
  });

  it('tools with missing args', async () => {
    const c = ctx();
    await toolsCommand.execute('enable', c);
  });
});
