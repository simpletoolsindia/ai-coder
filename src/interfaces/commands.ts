import type { CommandContext, CommandDefinition, ProviderConfig, ProviderKind } from '../core/types.js';
import type { CommandRegistry } from '../core/command-registry.js';
import type { SettingsManager } from '../core/settings-manager.js';
import type { ToolRegistry } from '../core/tool-resolver.js';
import type { ProviderManager } from '../core/provider-manager.js';

type ExtendedCommandContext = CommandContext & {
  commands: CommandRegistry;
  settings: SettingsManager;
  tools: ToolRegistry;
  providers: ProviderManager;
};

export const helpCommand: CommandDefinition = {
  id: 'help',
  name: '/help',
  description: 'List all available commands.',
  pluginId: 'core',
  async execute(_args, ctx) {
    const c = ctx as ExtendedCommandContext;
    const cmds = c.commands.list();
    c.print('Available commands:');
    for (const cmd of cmds) {
      c.print(`  ${cmd.name}${cmd.args ? ' ' + cmd.args : ''}  -  ${cmd.description}`);
    }
  },
};

export const loginCommand: CommandDefinition = {
  id: 'login',
  name: '/login',
  description: 'Configure a new provider. Usage: /login <id> <kind> [baseUrl] [apiKey] [model]',
  pluginId: 'core',
  args: '<id> <kind> [baseUrl] [apiKey] [model]',
  async execute(args, ctx) {
    const c = ctx as ExtendedCommandContext;
    const parts = parseArgs(args);
    if (parts.length < 2) {
      c.print('Usage: /login <id> <kind> [baseUrl] [apiKey] [model]');
      c.print('Kinds: openai, anthropic, gemini, ollama, openai-compatible, custom');
      return;
    }
    const [id, kind, baseUrl, apiKey, model] = parts;
    if (!id || !kind) {
      c.print('id and kind are required');
      return;
    }
    if (!isProviderKind(kind)) {
      c.print(`Unknown kind: ${kind}`);
      return;
    }
    const config: Omit<ProviderConfig, 'enabled'> = {
      id,
      kind,
      name: id,
      baseUrl,
      apiKey,
      defaultModel: model,
    };
    c.providers.login(config);
    await c.providers.saveToFile();
    c.print(`Provider "${id}" (${kind}) configured.`);
  },
};

export const providersCommand: CommandDefinition = {
  id: 'providers',
  name: '/providers',
  description: 'List configured providers.',
  pluginId: 'core',
  async execute(_args, ctx) {
    const c = ctx as ExtendedCommandContext;
    const list = c.providers.list();
    if (list.length === 0) {
      c.print('No providers configured. Use /login to add one.');
      return;
    }
    const active = c.providers.activeIdOrUndefined();
    for (const p of list) {
      const marker = p.id === active ? '*' : ' ';
      c.print(`${marker} ${p.id}  (${p.kind})  model=${p.defaultModel ?? '?'}  enabled=${p.enabled !== false}`);
    }
  },
};

export const useCommand: CommandDefinition = {
  id: 'use',
  name: '/use',
  description: 'Set the active provider. Usage: /use <id>',
  pluginId: 'core',
  args: '<id>',
  async execute(args, ctx) {
    const c = ctx as ExtendedCommandContext;
    const [id] = parseArgs(args);
    if (!id) {
      c.print('Usage: /use <id>');
      return;
    }
    try {
      c.providers.setActive(id);
      await c.providers.saveToFile();
      c.print(`Active provider set to "${id}".`);
    } catch (err) {
      c.print(`Error: ${(err as Error).message}`);
    }
  },
};

export const settingsCommand: CommandDefinition = {
  id: 'settings',
  name: '/settings',
  description: 'View or update settings. Usage: /settings [section] [key=value]...',
  pluginId: 'core',
  async execute(args, ctx) {
    const c = ctx as ExtendedCommandContext;
    const parts = parseArgs(args);
    if (parts.length === 0) {
      const s = c.settings.getAll();
      c.print(JSON.stringify(s, null, 2));
      return;
    }
    if (parts.length === 1) {
      const section = parts[0];
      if (!section) {
        c.print('Usage: /settings [section] [key=value]...');
        return;
      }
      const value = (c.settings.getAll() as Record<string, unknown>)[section];
      if (value === undefined) {
        c.print(`No such section: ${section}`);
        return;
      }
      c.print(JSON.stringify(value, null, 2));
      return;
    }
    const [section, ...kv] = parts;
    if (!section) return;
    const current = (c.settings.getAll() as Record<string, Record<string, unknown>>)[section];
    if (typeof current !== 'object' || current === null) {
      c.print(`Section "${section}" is not an object`);
      return;
    }
    const updated = { ...current };
    for (const pair of kv) {
      const eq = pair.indexOf('=');
      if (eq < 0) continue;
      const k = pair.slice(0, eq);
      const v = pair.slice(eq + 1);
      try {
        updated[k] = JSON.parse(v);
      } catch {
        updated[k] = v;
      }
    }
    await c.settings.set(section as never, updated as never);
    c.print(`Updated ${section}.`);
  },
};

export const extensionsCommand: CommandDefinition = {
  id: 'extensions',
  name: '/extensions',
  description: 'List installed plugins. Usage: /extensions [enable|disable|info] <id>',
  pluginId: 'core',
  async execute(args, ctx) {
    const c = ctx as ExtendedCommandContext;
    const parts = parseArgs(args);
    const plugins = c.plugins as
      | {
          list: () => Array<{ id: string; manifest: { version: string; description: string }; source: string }>;
          isEnabled: (id: string) => boolean;
          isLoaded: (id: string) => boolean;
          manifest: (id: string) => { version: string; description: string } | undefined;
        }
      | undefined;
    if (!plugins) {
      c.print('Plugin manager not configured.');
      return;
    }
    const list = plugins.list();
    if (parts.length === 0) {
      if (list.length === 0) {
        c.print('No plugins installed.');
        return;
      }
      for (const p of list) {
        const enabled = plugins.isEnabled(p.id);
        const loaded = plugins.isLoaded(p.id);
        const status = loaded ? 'loaded' : enabled ? 'lazy' : 'disabled';
        c.print(`${p.id}  v${p.manifest.version}  [${status}]  ${p.manifest.description}`);
      }
      return;
    }
    const [action, id] = parts;
    if (!action || !id) {
      c.print('Usage: /extensions [enable|disable|info] <id>');
      return;
    }
    if (action === 'enable') {
      plugins.manifest(id);
      await c.settings.setPluginEnabled(id, true);
      c.print(`Enabled ${id}.`);
    } else if (action === 'disable') {
      await c.settings.setPluginEnabled(id, false);
      c.print(`Disabled ${id}.`);
    } else if (action === 'info') {
      const m = plugins.manifest(id);
      if (!m) {
        c.print(`No such plugin: ${id}`);
        return;
      }
      c.print(JSON.stringify(m, null, 2));
    }
  },
};

export const toolsCommand: CommandDefinition = {
  id: 'tools',
  name: '/tools',
  description: 'List tools. Usage: /tools [enable|disable] <id>',
  pluginId: 'core',
  async execute(args, ctx) {
    const c = ctx as ExtendedCommandContext;
    const parts = parseArgs(args);
    const list = c.tools.list();
    if (parts.length === 0) {
      if (list.length === 0) {
        c.print('No tools registered.');
        return;
      }
      for (const t of list) {
        const enabled = c.settings.isToolEnabled(t.id);
        const usage = c.tools.usage().find((u) => u.id === t.id);
        const calls = usage ? `  used=${usage.count}` : '';
        c.print(`${enabled ? '✓' : '✗'} ${t.id}  (${t.category})  ${t.description}${calls}`);
      }
      return;
    }
    const [action, id] = parts;
    if (!action || !id) {
      c.print('Usage: /tools [enable|disable] <id>');
      return;
    }
    if (action === 'enable') {
      await c.settings.setToolEnabled(id, true);
      c.print(`Enabled ${id}.`);
    } else if (action === 'disable') {
      await c.settings.setToolEnabled(id, false);
      c.print(`Disabled ${id}.`);
    }
  },
};

export const clearCommand: CommandDefinition = {
  id: 'clear',
  name: '/clear',
  description: 'Clear the screen.',
  pluginId: 'core',
  async execute(_args, ctx) {
    ctx.print('\u001Bc');
  },
};

export const exitCommand: CommandDefinition = {
  id: 'exit',
  name: '/exit',
  description: 'Exit AI By.',
  pluginId: 'core',
  async execute(_args, ctx) {
    ctx.print('Goodbye!');
    (ctx as unknown as { exit?: () => void }).exit?.();
  },
};

export const modeCommand: CommandDefinition = {
  id: 'mode',
  name: '/mode',
  description: 'View or set the agent mode. Usage: /mode [plan|execute|toggle]',
  pluginId: 'core',
  async execute(args, ctx) {
    const c = ctx as ExtendedCommandContext;
    const m = c.mode;
    if (!m) {
      c.print('Mode controller is not available.');
      return;
    }
    const [arg] = parseArgs(args);
    if (!arg) {
      c.print(`Current mode: ${m.mode.toUpperCase()}`);
      c.print('Press Tab or use /mode toggle to switch.');
      return;
    }
    if (arg === 'plan' || arg === 'execute') {
      m.setMode(arg, 'command');
      c.print(`Switched to ${arg.toUpperCase()} mode.`);
    } else if (arg === 'toggle') {
      const next = m.toggle();
      c.print(`Switched to ${next.toUpperCase()} mode.`);
    } else {
      c.print('Usage: /mode [plan|execute|toggle]');
    }
  },
};

export const compactCommand: CommandDefinition = {
  id: 'compact',
  name: '/compact',
  description: 'Compact the conversation context. Usage: /compact [auto]',
  pluginId: 'core',
  async execute(_args, ctx) {
    c_print(ctx, 'Compaction must be triggered from the agent loop. Use Ctrl+L to clear the screen and /clear to reset.');
  },
};

export const doctorCommand: CommandDefinition = {
  id: 'doctor',
  name: '/doctor',
  description: 'Run runtime health checks (Node, providers, plugins, tools).',
  pluginId: 'core',
  async execute(_args, ctx) {
    const c = ctx as ExtendedCommandContext;
    c.print('Running doctor checks…');
    c.print(`  ✓ Node ${process.version}`);
    c.print(`  ✓ Platform ${process.platform}/${process.arch}`);
    c.print(`  ✓ CWD ${process.cwd()}`);
    const providers = c.providers.list();
    c.print(`  • Providers: ${providers.length} configured, active: ${c.providers.activeIdOrUndefined() ?? 'none'}`);
    if (providers.length === 0) {
      c.print('  ⚠ No providers configured. Run /login to add one.');
    }
    const toolCount = c.tools.list().length;
    c.print(`  ✓ Tools registered: ${toolCount}`);
    const enabledTools = c.tools.list().filter((t) => c.settings.isToolEnabled(t.id)).length;
    c.print(`  ✓ Tools enabled: ${enabledTools}/${toolCount}`);
    c.print('  ✓ SettingsManager: ' + (c.settings.get('general').theme ?? 'auto'));
    c.print('Doctor complete.');
  },
};

function c_print(ctx: CommandContext, line: string): void {
  ctx.print(line);
}

function parseArgs(s: string): string[] {
  const out: string[] = [];
  let current = '';
  let inQuote: '"' | "'" | null = null;
  for (const ch of s) {
    if (inQuote) {
      if (ch === inQuote) {
        inQuote = null;
      } else {
        current += ch;
      }
    } else if (ch === '"' || ch === "'") {
      inQuote = ch;
    } else if (ch === ' ' || ch === '\t') {
      if (current.length > 0) {
        out.push(current);
        current = '';
      }
    } else {
      current += ch;
    }
  }
  if (current.length > 0) out.push(current);
  return out;
}

function isProviderKind(s: string): s is ProviderKind {
  return ['openai', 'anthropic', 'gemini', 'ollama', 'openai-compatible', 'custom'].includes(s);
}

export const builtInCommands: CommandDefinition[] = [
  helpCommand,
  loginCommand,
  providersCommand,
  useCommand,
  settingsCommand,
  extensionsCommand,
  toolsCommand,
  modeCommand,
  compactCommand,
  doctorCommand,
  clearCommand,
  exitCommand,
];

export const __cliTesting = { parseArgs };
export type { CommandContext };
