import { promises as fs } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { z } from 'zod';
import { EventBus } from './event-bus.js';
import { Logger, createLogger } from './logger.js';

const GeneralSchema = z
  .object({
    defaultProvider: z.string().optional(),
    defaultModel: z.string().optional(),
    theme: z.enum(['auto', 'dark', 'light']).default('auto'),
    verbose: z.boolean().default(false),
    maxIterations: z.number().int().positive().default(20),
    cwd: z.string().optional(),
  })
  .strict();

const PluginSettingsEntry = z
  .object({
    enabled: z.boolean().default(true),
    config: z.record(z.unknown()).default({}),
  })
  .strict();

const PluginSettingsSchema = z.record(PluginSettingsEntry);

const ToolSettingsEntry = z
  .object({
    enabled: z.boolean().default(true),
    permission: z.enum(['allow', 'deny', 'ask']).default('ask'),
  })
  .strict();

const ToolSettingsSchema = z.record(ToolSettingsEntry);

const PermissionsRuleSchema = z
  .object({
    pattern: z.string().min(1),
    action: z.enum(['allow', 'deny', 'ask', 'prompt']),
    target: z.string().optional(),
    description: z.string().optional(),
  })
  .strict();

const PermissionsSchema = z
  .object({
    default: z.enum(['allow', 'deny', 'ask']).default('ask'),
    rules: z.array(PermissionsRuleSchema).default([]),
  })
  .strict();

const MemorySchema = z
  .object({
    enabled: z.boolean().default(true),
    persistPath: z.string().default('config/memory.json'),
    maxEntries: z.number().int().positive().default(1000),
  })
  .strict();

const SearchSchema = z
  .object({
    provider: z.enum(['searxng', 'duckduckgo', 'none']).default('searxng'),
    searxngUrl: z.string().url().optional(),
    apiKey: z.string().optional(),
    language: z.string().default('en'),
    safeSearch: z.enum(['strict', 'moderate', 'none']).default('moderate'),
    resultCount: z.number().int().positive().max(50).default(10),
    timeoutSec: z.number().int().positive().default(30),
    retry: z.number().int().min(0).default(3),
  })
  .strict();

export const SettingsSchema = z
  .object({
    general: GeneralSchema.default({
      theme: 'auto',
      verbose: false,
      maxIterations: 20,
    }),
    plugins: PluginSettingsSchema.default({}),
    tools: ToolSettingsSchema.default({}),
    permissions: PermissionsSchema.default({ default: 'ask', rules: [] }),
    memory: MemorySchema.default({ enabled: true, persistPath: 'config/memory.json', maxEntries: 1000 }),
    search: SearchSchema.default({
      provider: 'searxng',
      language: 'en',
      safeSearch: 'moderate',
      resultCount: 10,
      timeoutSec: 30,
      retry: 3,
    }),
  })
  .strict();

export type Settings = z.infer<typeof SettingsSchema>;
export type PluginSettingsMap = z.infer<typeof PluginSettingsSchema>;
export type ToolSettingsMap = z.infer<typeof ToolSettingsSchema>;
export type PermissionsConfig = z.infer<typeof PermissionsSchema>;
export type SearchConfig = z.infer<typeof SearchSchema>;
export type MemoryConfig = z.infer<typeof MemorySchema>;

export const ProvidersFileSchema = z
  .object({
    providers: z
      .array(
        z
          .object({
            id: z.string().min(1),
            kind: z.enum(['openai', 'anthropic', 'gemini', 'ollama', 'openai-compatible', 'custom']),
            name: z.string().min(1),
            baseUrl: z.string().url().optional(),
            apiKey: z.string().optional(),
            headers: z.record(z.string()).optional(),
            organization: z.string().optional(),
            defaultModel: z.string().optional(),
            temperature: z.number().min(0).max(2).optional(),
            maxTokens: z.number().int().positive().optional(),
            streaming: z.boolean().optional(),
            retry: z.number().int().min(0).optional(),
            enabled: z.boolean().optional(),
            extra: z.record(z.unknown()).optional(),
          })
          .strict(),
      )
      .default([]),
    activeProvider: z.string().optional(),
  })
  .strict();

export type ProvidersFile = z.infer<typeof ProvidersFileSchema>;

export interface SettingsManagerOptions {
  configDir?: string;
  fileName?: string;
  logger?: Logger;
  events?: EventBus;
  /** Provide a custom read/write implementation (e.g. for memory) */
  io?: SettingsIO;
  /** Auto-persist on set (default true) */
  autoPersist?: boolean;
}

export interface SettingsIO {
  read(path: string): Promise<string | null>;
  write(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  ensureDir(path: string): Promise<void>;
}

export const fsIO: SettingsIO = {
  async read(path) {
    try {
      return await fs.readFile(path, 'utf-8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  },
  async write(path, content) {
    await fs.writeFile(path, content, 'utf-8');
  },
  async exists(path) {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  },
  async ensureDir(path) {
    await fs.mkdir(path, { recursive: true });
  },
};

export const inMemoryIO = (): SettingsIO => {
  const store = new Map<string, string>();
  return {
    async read(path) {
      return store.has(path) ? (store.get(path) as string) : null;
    },
    async write(path, content) {
      store.set(path, content);
    },
    async exists(path) {
      return store.has(path);
    },
    async ensureDir() {
      // noop
    },
  };
};

export class SettingsValidationError extends Error {
  constructor(public issues: z.ZodIssue[]) {
    super(`Settings validation failed: ${issues.map((i) => i.message).join('; ')}`);
    this.name = 'SettingsValidationError';
  }
}

export class SettingsManager {
  private settings: Settings;
  private options: Required<Omit<SettingsManagerOptions, 'events' | 'logger' | 'io'>> & {
    events?: EventBus;
    logger: Logger;
    io: SettingsIO;
  };
  private filePath: string;
  private writeQueue: Promise<void> = Promise.resolve();
  private listeners = new Set<(s: Settings) => void>();

  constructor(options: SettingsManagerOptions = {}) {
    const configDir = options.configDir ?? process.cwd();
    const fileName = options.fileName ?? 'settings.json';
    this.filePath = resolve(configDir, fileName);
    this.options = {
      configDir,
      fileName,
      logger: options.logger ?? createLogger({ level: 'info' }),
      events: options.events,
      io: options.io ?? fsIO,
      autoPersist: options.autoPersist ?? true,
    };
    this.settings = SettingsSchema.parse({});
  }

  get file(): string {
    return this.filePath;
  }

  async load(): Promise<Settings> {
    const raw = await this.options.io.read(this.filePath);
    if (raw == null) {
      this.settings = SettingsSchema.parse({});
      return this.settings;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new Error(`Failed to parse settings at ${this.filePath}: ${(err as Error).message}`);
    }
    const result = SettingsSchema.safeParse(parsed);
    if (!result.success) {
      throw new SettingsValidationError(result.error.issues);
    }
    this.settings = result.data;
    this.notify();
    return this.settings;
  }

  async save(): Promise<void> {
    const content = JSON.stringify(this.settings, null, 2);
    await this.options.io.ensureDir(dirname(this.filePath));
    await this.options.io.write(this.filePath, content);
  }

  get<K extends keyof Settings>(section: K): Settings[K] {
    return this.settings[section];
  }

  getAll(): Settings {
    return JSON.parse(JSON.stringify(this.settings)) as Settings;
  }

  async set<K extends keyof Settings>(section: K, value: Settings[K]): Promise<void> {
    const sectionSchema =
      section === 'general'
        ? GeneralSchema
        : section === 'plugins'
          ? PluginSettingsSchema
          : section === 'tools'
            ? ToolSettingsSchema
            : section === 'permissions'
              ? PermissionsSchema
              : section === 'memory'
                ? MemorySchema
                : section === 'search'
                  ? SearchSchema
                  : null;
    if (sectionSchema) {
      const result = sectionSchema.safeParse(value);
      if (!result.success) throw new SettingsValidationError(result.error.issues);
      this.settings[section] = result.data as Settings[K];
    } else {
      this.settings[section] = value;
    }
    this.notify();
    if (this.options.autoPersist) {
      this.writeQueue = this.writeQueue.then(() => this.save()).catch(() => undefined);
      await this.writeQueue;
    }
  }

  async update<K extends keyof Settings>(
    section: K,
    updater: (current: Settings[K]) => Settings[K],
  ): Promise<void> {
    const current = this.get(section);
    const next = updater(current);
    await this.set(section, next);
  }

  isPluginEnabled(pluginId: string): boolean {
    const entry = this.settings.plugins[pluginId];
    return entry ? entry.enabled : true;
  }

  async setPluginEnabled(pluginId: string, enabled: boolean): Promise<void> {
    await this.update('plugins', (map) => ({
      ...map,
      [pluginId]: { ...(map[pluginId] ?? { enabled: true, config: {} }), enabled },
    }));
  }

  getPluginConfig(pluginId: string): Record<string, unknown> {
    return this.settings.plugins[pluginId]?.config ?? {};
  }

  async setPluginConfig(pluginId: string, config: Record<string, unknown>): Promise<void> {
    await this.update('plugins', (map) => ({
      ...map,
      [pluginId]: {
        ...(map[pluginId] ?? { enabled: true, config: {} }),
        config: { ...(map[pluginId]?.config ?? {}), ...config },
      },
    }));
  }

  isToolEnabled(toolId: string): boolean {
    const entry = this.settings.tools[toolId];
    return entry ? entry.enabled : true;
  }

  async setToolEnabled(toolId: string, enabled: boolean): Promise<void> {
    await this.update('tools', (map) => ({
      ...map,
      [toolId]: { ...(map[toolId] ?? { enabled: true, permission: 'ask' }), enabled },
    }));
  }

  onChange(listener: (s: Settings) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const l of this.listeners) {
      try {
        l(this.getAll());
      } catch {
        // ignore listener errors
      }
    }
    this.options.events?.emitSync('settings.changed', { settings: this.getAll() });
  }
}

export const createSettingsManager = (opts?: SettingsManagerOptions): SettingsManager =>
  new SettingsManager(opts);

export const resolveConfigPath = (...parts: string[]): string => join(...parts);
