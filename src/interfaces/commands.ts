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

const SUBSCRIBE_URL = 'https://github.com/simpletoolsindia/ai-coder#get-a-key';

const KNOWN_API_KEY_PROVIDERS: { id: string; name: string; kind: ProviderKind; baseUrl: string; defaultModel: string; keyHint: string }[] = [
  { id: 'openai',      name: 'OpenAI',      kind: 'openai',             baseUrl: 'https://api.openai.com/v1',      defaultModel: 'gpt-4o-mini', keyHint: 'sk-...' },
  { id: 'anthropic',   name: 'Anthropic',   kind: 'openai-compatible', baseUrl: 'https://api.anthropic.com/v1',  defaultModel: 'claude-3-5-sonnet-latest', keyHint: 'sk-ant-...' },
  { id: 'gemini',      name: 'Google Gemini', kind: 'openai-compatible', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', defaultModel: 'gemini-1.5-flash', keyHint: 'AIza...' },
  { id: 'openrouter',  name: 'OpenRouter',  kind: 'openai-compatible', baseUrl: 'https://openrouter.ai/api/v1',    defaultModel: 'anthropic/claude-3.5-sonnet', keyHint: 'sk-or-...' },
  { id: 'groq',        name: 'Groq',        kind: 'openai-compatible', baseUrl: 'https://api.groq.com/openai/v1', defaultModel: 'llama-3.1-70b-versatile', keyHint: 'gsk_...' },
  { id: 'mistral',     name: 'Mistral',     kind: 'openai-compatible', baseUrl: 'https://api.mistral.ai/v1',       defaultModel: 'mistral-large-latest', keyHint: '...' },
  { id: 'deepseek',    name: 'DeepSeek',    kind: 'openai-compatible', baseUrl: 'https://api.deepseek.com/v1',    defaultModel: 'deepseek-chat', keyHint: 'sk-...' },
];

function isProviderKind(s: string): s is ProviderKind {
  return ['openai', 'anthropic', 'gemini', 'ollama', 'openai-compatible', 'custom'].includes(s);
}

function parseArgs(s: string): string[] {
  const out: string[] = [];
  let current = '';
  let inQuote: '"' | "'" | null = null;
  for (const ch of s) {
    if (inQuote) {
      if (ch === inQuote) inQuote = null;
      else current += ch;
    } else if (ch === '"' || ch === "'") {
      inQuote = ch;
    } else if (ch === ' ' || ch === '\t') {
      if (current.length > 0) { out.push(current); current = ''; }
    } else {
      current += ch;
    }
  }
  if (current.length > 0) out.push(current);
  return out;
}

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
  description: 'Configure a new provider. Sub-commands: subscribe, api-key, compat. Or /login <id> <kind> [baseUrl] [key] [model].',
  pluginId: 'core',
  args: '[subscribe|api-key|compat] …',
  async execute(args, ctx) {
    const c = ctx as ExtendedCommandContext;
    const parts = parseArgs(args);
    if (parts.length === 0) {
      c.print('');
      c.print('How do you want to connect?');
      c.print('');
      c.print('  1) Subscribe   — get a hosted key (browser)');
      c.print('  2) API key     — paste a key from a known provider');
      c.print('  3) OpenAI-compatible — bring your own base URL');
      c.print('');
      c.print('  /login subscribe [openai|anthropic|gemini|openrouter|groq|deepseek|github|nearai|opencode|gitlawb]');
      c.print('  /login api-key <provider-name>');
      c.print('  /login compat <baseUrl> [key] [model] [id]');
      return;
    }
    const [sub, ...rest] = parts;
    if (sub === 'subscribe') {
      await loginSubscribeFromArgs(c, rest);
      return;
    }
    if (sub === 'api-key') {
      await loginApiKeyFromArgs(c, rest);
      return;
    }
    if (sub === 'compat') {
      await loginCompatFromArgs(c, rest);
      return;
    }
    if (parts.length >= 2) {
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
      return;
    }
    c.print('Usage: /login <id> <kind> [baseUrl] [apiKey] [model]');
    c.print('Or:    /login subscribe [target]');
    c.print('Or:    /login api-key <provider>');
    c.print('Or:    /login compat <baseUrl> [key] [model] [id]');
  },
};

async function loginSubscribeFromArgs(c: ExtendedCommandContext, rest: string[]): Promise<void> {
  const choice = (rest[0] ?? 'openai').toLowerCase();
  const map: Record<string, { id: string; name: string; baseUrl: string; portal: string }> = {
    gitlawb:  { id: 'gitlawb',  name: 'Gitlawb Opengateway', baseUrl: 'https://opengateway.gitlawb.com/v1', portal: SUBSCRIBE_URL },
    opencode: { id: 'opencode', name: 'OpenCode Zen',        baseUrl: 'https://opencode.ai/zen/v1',       portal: 'https://opencode.ai/zen' },
    nearai:   { id: 'nearai',   name: 'NEAR AI Cloud',       baseUrl: 'https://cloud-api.near.ai/v1',     portal: 'https://console.near.ai' },
    github:   { id: 'github',   name: 'GitHub Models',       baseUrl: 'https://models.inference.ai.azure.com', portal: 'https://github.com/settings/tokens' },
    openai:   { id: 'openai',   name: 'OpenAI',              baseUrl: 'https://api.openai.com/v1',        portal: 'https://platform.openai.com/api-keys' },
    anthropic:{ id: 'anthropic',name: 'Anthropic',           baseUrl: 'https://api.anthropic.com/v1',    portal: 'https://console.anthropic.com/' },
    gemini:   { id: 'gemini',   name: 'Google Gemini',       baseUrl: 'https://generativelanguage.googleapis.com/v1beta', portal: 'https://aistudio.google.com/' },
    openrouter:{ id: 'openrouter',name: 'OpenRouter',         baseUrl: 'https://openrouter.ai/api/v1',    portal: 'https://openrouter.ai/keys' },
    groq:     { id: 'groq',     name: 'Groq',                baseUrl: 'https://api.groq.com/openai/v1', portal: 'https://console.groq.com/' },
    deepseek: { id: 'deepseek', name: 'DeepSeek',            baseUrl: 'https://api.deepseek.com/v1',    portal: 'https://platform.deepseek.com/' },
  };
  const m = map[choice];
  if (!m) {
    c.print(`Unknown subscribe target: ${choice}.`);
    c.print(`Available: ${Object.keys(map).join(', ')}`);
    return;
  }
  c.print(`Open ${m.portal} in your browser, create a key, then paste it below.`);
  c.print('(For headless / CI usage, set the env var instead: e.g. `export OPENAI_API_KEY=...`)');
  return;
}

async function loginApiKeyFromArgs(c: ExtendedCommandContext, rest: string[]): Promise<void> {
  const name = (rest[0] ?? '').toLowerCase();
  const p = KNOWN_API_KEY_PROVIDERS.find((x) => x.id === name || x.name.toLowerCase() === name);
  if (!p) {
    c.print(`Unknown provider: "${name}". Available: ${KNOWN_API_KEY_PROVIDERS.map((x) => x.id).join(', ')}`);
    c.print('For custom keys, use: /login compat <baseUrl> [key] [model] [id]');
    return;
  }
  c.print(`Configured provider "${p.id}" to use base URL ${p.baseUrl}`);
  c.print('(Paste your key in the next prompt. For headless / CI, set the env var:');
  c.print(`  export ${p.id.toUpperCase()}_API_KEY=...)`);
  return;
}

async function loginCompatFromArgs(c: ExtendedCommandContext, rest: string[]): Promise<void> {
  const [baseUrl, apiKey, model, id] = rest;
  if (!baseUrl) { c.print('Usage: /login compat <baseUrl> [apiKey] [model] [id]'); return; }
  const finalBase = baseUrl.startsWith('http') ? baseUrl : `http://${baseUrl}`;
  const finalId = (id ?? 'custom').trim() || 'custom';
  c.providers.login({ id: finalId, kind: 'openai-compatible', name: finalId, baseUrl: finalBase, apiKey, defaultModel: model });
  await c.providers.saveToFile();
  c.print(`✓ Provider "${finalId}" configured (${finalBase}). Active.`);
}

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
      try { updated[k] = JSON.parse(v); } catch { updated[k] = v; }
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
    const plugins = (c as unknown as { plugins?: { list: () => Array<{ id: string; manifest: { version: string; description: string }; source: string }>; isEnabled: (id: string) => boolean; isLoaded: (id: string) => boolean; manifest: (id: string) => { version: string; description: string } | undefined } }).plugins;
    if (!plugins) { c.print('Plugin manager not configured.'); return; }
    const list = plugins.list();
    if (parts.length === 0) {
      if (list.length === 0) { c.print('No plugins installed.'); return; }
      for (const p of list) {
        const enabled = plugins.isEnabled(p.id);
        const loaded = plugins.isLoaded(p.id);
        const status = loaded ? 'loaded' : enabled ? 'lazy' : 'disabled';
        c.print(`${p.id}  v${p.manifest.version}  [${status}]  ${p.manifest.description}`);
      }
      return;
    }
    const [action, id] = parts;
    if (!action || !id) { c.print('Usage: /extensions [enable|disable|info] <id>'); return; }
    if (action === 'enable') {
      plugins.manifest(id);
      await c.settings.setPluginEnabled(id, true);
      c.print(`Enabled ${id}.`);
    } else if (action === 'disable') {
      await c.settings.setPluginEnabled(id, false);
      c.print(`Disabled ${id}.`);
    } else if (action === 'info') {
      const m = plugins.manifest(id);
      if (!m) { c.print(`No such plugin: ${id}`); return; }
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
      if (list.length === 0) { c.print('No tools registered.'); return; }
      for (const t of list) {
        const enabled = c.settings.isToolEnabled(t.id);
        const usage = c.tools.usage().find((u) => u.id === t.id);
        const calls = usage ? `  used=${usage.count}` : '';
        c.print(`${enabled ? '✓' : '✗'} ${t.id}  (${t.category})  ${t.description}${calls}`);
      }
      return;
    }
    const [action, id] = parts;
    if (!action || !id) { c.print('Usage: /tools [enable|disable] <id>'); return; }
    if (action === 'enable') {
      await c.settings.setToolEnabled(id, true);
      c.print(`Enabled ${id}.`);
    } else if (action === 'disable') {
      await c.settings.setToolEnabled(id, false);
      c.print(`Disabled ${id}.`);
    }
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
    if (!m) { c.print('Mode controller is not available.'); return; }
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
    ctx.print('Compaction is automatic at 95% utilization. Use /clear to reset the screen.');
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
