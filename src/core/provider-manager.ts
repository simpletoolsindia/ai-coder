import { EventBus } from './event-bus.js';
import { Logger, createLogger } from './logger.js';
import type {
  ProviderConfig,
  Provider,
  ProviderKind,
  ChatRequest,
  ChatResponse,
} from './types.js';
import { OpenAICompatibleProvider } from '../providers/openai-compatible.js';
import { ProvidersFileSchema, type ProvidersFile } from './settings-manager.js';
import { promises as fs } from 'node:fs';
import { dirname, resolve } from 'node:path';

export interface ProviderManagerOptions {
  logger?: Logger;
  events?: EventBus;
  configPath?: string;
  env?: Record<string, string | undefined>;
  /** Provide a custom HTTP fetch (defaults to global fetch) */
  fetchImpl?: typeof fetch;
}

export class ProviderNotFoundError extends Error {
  constructor(id: string) {
    super(`Provider "${id}" not found`);
    this.name = 'ProviderNotFoundError';
  }
}

export class ProviderManager {
  private providers = new Map<string, Provider>();
  private configs = new Map<string, ProviderConfig>();
  private activeId?: string;
  private options: Required<Omit<ProviderManagerOptions, 'events' | 'logger' | 'configPath' | 'env'>> & {
    logger: Logger;
    events?: EventBus;
    configPath?: string;
    env: Record<string, string | undefined>;
  };

  constructor(options: ProviderManagerOptions = {}) {
    this.options = {
      logger: options.logger ?? createLogger({ level: 'info' }),
      events: options.events,
      configPath: options.configPath,
      env: options.env ?? (process.env as Record<string, string | undefined>),
      fetchImpl: options.fetchImpl ?? (globalThis.fetch as typeof fetch),
    };
  }

  register(config: ProviderConfig): Provider {
    if (this.providers.has(config.id)) {
      throw new Error(`Provider "${config.id}" is already registered`);
    }
    const provider = this.buildProvider(config);
    this.providers.set(config.id, provider);
    this.configs.set(config.id, config);
    this.options.events?.emitSync('provider.registered', { id: config.id, kind: config.kind });
    if (!this.activeId) this.activeId = config.id;
    return provider;
  }

  unregister(id: string): boolean {
    const existed = this.providers.delete(id);
    this.configs.delete(id);
    if (this.activeId === id) {
      this.activeId = this.providers.keys().next().value;
    }
    return existed;
  }

  get(id: string): Provider {
    const provider = this.providers.get(id);
    if (!provider) throw new ProviderNotFoundError(id);
    return provider;
  }

  tryGet(id: string): Provider | undefined {
    return this.providers.get(id);
  }

  has(id: string): boolean {
    return this.providers.has(id);
  }

  list(): ProviderConfig[] {
    return Array.from(this.configs.values());
  }

  active(): Provider {
    if (!this.activeId) {
      throw new Error('No active provider configured. Use /login to add one.');
    }
    return this.get(this.activeId);
  }

  activeIdOrUndefined(): string | undefined {
    return this.activeId;
  }

  setActive(id: string): void {
    if (!this.providers.has(id)) {
      throw new ProviderNotFoundError(id);
    }
    this.activeId = id;
    this.options.events?.emitSync('provider.activeChanged', { id });
  }

  getConfig(id: string): ProviderConfig | undefined {
    return this.configs.get(id);
  }

  updateConfig(id: string, patch: Partial<ProviderConfig>): Provider {
    const current = this.configs.get(id);
    if (!current) throw new ProviderNotFoundError(id);
    const next: ProviderConfig = { ...current, ...patch, id: current.id };
    this.configs.set(id, next);
    const provider = this.buildProvider(next);
    this.providers.set(id, provider);
    return provider;
  }

  async loadFromFile(path?: string): Promise<void> {
    const file = path ?? this.options.configPath;
    if (!file) return;
    let raw: string;
    try {
      raw = await fs.readFile(file, 'utf-8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw err;
    }
    const parsed = ProvidersFileSchema.parse(JSON.parse(raw));
    for (const cfg of parsed.providers) {
      this.register(cfg);
    }
    if (parsed.activeProvider) this.setActive(parsed.activeProvider);
  }

  async saveToFile(path?: string): Promise<void> {
    const file = path ?? this.options.configPath;
    if (!file) throw new Error('No config path provided');
    const payload: ProvidersFile = {
      providers: this.list(),
      activeProvider: this.activeId,
    };
    await fs.mkdir(dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(payload, null, 2), 'utf-8');
  }

  /**
   * Configure a new provider from a /login command.
   * If a provider with the same id exists, it is replaced.
   */
  login(config: Omit<ProviderConfig, 'enabled'> & { enabled?: boolean }): Provider {
    const enabled = config.enabled ?? true;
    if (this.providers.has(config.id)) {
      return this.updateConfig(config.id, { ...config, enabled });
    }
    const provider = this.register({ ...config, enabled });
    if (enabled) this.setActive(config.id);
    return provider;
  }

  async chat(req: ChatRequest, providerId?: string): Promise<ChatResponse> {
    const id = providerId ?? this.activeId;
    if (!id) throw new Error('No provider available');
    return this.get(id).chat(req);
  }

  private buildProvider(config: ProviderConfig): Provider {
    const resolved: ProviderConfig = {
      ...config,
      apiKey: config.apiKey ?? this.envKey(config),
      baseUrl: config.baseUrl ?? this.envBaseUrl(config),
    };
    switch (resolved.kind) {
      case 'openai':
      case 'openai-compatible':
      case 'custom':
      case 'ollama':
        return new OpenAICompatibleProvider({
          id: resolved.id,
          name: resolved.name,
          kind: resolved.kind as ProviderKind,
          baseUrl: resolved.baseUrl,
          apiKey: resolved.apiKey,
          headers: resolved.headers,
          organization: resolved.organization,
          defaultModel: resolved.defaultModel,
          temperature: resolved.temperature,
          maxTokens: resolved.maxTokens,
          streaming: resolved.streaming,
          retry: resolved.retry,
          extra: resolved.extra,
          fetchImpl: this.options.fetchImpl,
        });
      default:
        // For kinds we do not yet implement, fall back to OpenAI-compatible.
        // This keeps the core decoupled from specific provider SDKs.
        return new OpenAICompatibleProvider({
          id: resolved.id,
          name: resolved.name,
          kind: 'openai-compatible',
          baseUrl: resolved.baseUrl,
          apiKey: resolved.apiKey,
          headers: resolved.headers,
          organization: resolved.organization,
          defaultModel: resolved.defaultModel,
          temperature: resolved.temperature,
          maxTokens: resolved.maxTokens,
          streaming: resolved.streaming,
          retry: resolved.retry,
          extra: resolved.extra,
          fetchImpl: this.options.fetchImpl,
        });
    }
  }

  private envKey(config: ProviderConfig): string | undefined {
    const envKey = `${config.id.toUpperCase()}_API_KEY`;
    if (this.options.env[envKey]) return this.options.env[envKey];
    if (config.kind === 'openai' && this.options.env.OPENAI_API_KEY) return this.options.env.OPENAI_API_KEY;
    if (config.kind === 'anthropic' && this.options.env.ANTHROPIC_API_KEY) return this.options.env.ANTHROPIC_API_KEY;
    if (config.kind === 'gemini' && this.options.env.GEMINI_API_KEY) return this.options.env.GEMINI_API_KEY;
    if (config.kind === 'ollama') return 'ollama';
    return undefined;
  }

  private envBaseUrl(config: ProviderConfig): string | undefined {
    const envKey = `${config.id.toUpperCase()}_BASE_URL`;
    if (this.options.env[envKey]) return this.options.env[envKey];
    switch (config.kind) {
      case 'openai':
        return this.options.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';
      case 'anthropic':
        return this.options.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com/v1';
      case 'gemini':
        return (
          this.options.env.GEMINI_BASE_URL ??
          'https://generativelanguage.googleapis.com/v1beta'
        );
      case 'ollama':
        return this.options.env.OLLAMA_BASE_URL ?? 'http://localhost:11434/v1';
      case 'openai-compatible':
      case 'custom':
        return this.options.env.OPENAI_COMPATIBLE_BASE_URL;
      default:
        return undefined;
    }
  }
}

export const resolveProviderConfigPath = (cwd: string): string => resolve(cwd, 'config', 'providers.json');

export const createProviderManager = (opts?: ProviderManagerOptions): ProviderManager =>
  new ProviderManager(opts);
