import { Container } from './container.js';
import { EventBus } from './event-bus.js';
import { Logger, createLogger } from './logger.js';
import { SettingsManager } from './settings-manager.js';
import { ProviderManager } from './provider-manager.js';
import { ToolRegistry } from './tool-resolver.js';
import { CommandRegistry } from './command-registry.js';
import { PermissionEngine } from './permission-engine.js';
import { PluginManager } from './plugin-manager.js';
import { PromptBuilder } from './prompt-builder.js';
import { ContextCompressor } from './context-compressor.js';
import { Planner } from './planner.js';
import type { AgentContext, AgentResult, Json, Tool } from './types.js';
import type { PlannerRunOptions } from './planner.js';

export interface RuntimeOptions {
  configDir?: string;
  logger?: Logger;
  events?: EventBus;
  settings?: SettingsManager;
  providers?: ProviderManager;
  tools?: ToolRegistry;
  commands?: CommandRegistry;
  permissions?: PermissionEngine;
  plugins?: PluginManager;
  promptBuilder?: PromptBuilder;
  compressor?: ContextCompressor;
  planner?: Planner;
  container?: Container;
}

export class Runtime {
  container: Container;
  events: EventBus;
  logger: Logger;
  settings: SettingsManager;
  providers: ProviderManager;
  tools: ToolRegistry;
  commands: CommandRegistry;
  permissions: PermissionEngine;
  plugins?: PluginManager;
  promptBuilder: PromptBuilder;
  compressor: ContextCompressor;
  planner: Planner;

  constructor(options: RuntimeOptions = {}) {
    this.container = options.container ?? new Container();
    this.events = options.events ?? new EventBus();
    this.logger = options.logger ?? createLogger({ level: 'info' });
    this.settings = options.settings ?? new SettingsManager({ logger: this.logger, events: this.events });
    this.permissions =
      options.permissions ?? new PermissionEngine({ logger: this.logger, events: this.events, settings: this.settings });
    this.tools = options.tools ?? new ToolRegistry({ logger: this.logger, events: this.events, permissions: this.permissions, settings: this.settings });
    this.commands = options.commands ?? new CommandRegistry({ logger: this.logger, events: this.events });
    this.providers = options.providers ?? new ProviderManager({ logger: this.logger, events: this.events });
    this.plugins = options.plugins;
    this.promptBuilder = options.promptBuilder ?? new PromptBuilder();
    this.compressor = options.compressor ?? new ContextCompressor();
    this.planner =
      options.planner ??
      new Planner({
        providers: this.providers,
        tools: this.tools,
        plugins: this.plugins,
        promptBuilder: this.promptBuilder,
        compressor: this.compressor,
        logger: this.logger,
        events: this.events,
      });
  }

  async initialize(): Promise<void> {
    await this.settings.load();
  }

  async run(request: string, options: PlannerRunOptions & { context?: Partial<AgentContext> } = {}): Promise<AgentResult> {
    if (this.plugins && this.plugins['resolveForRequest']) {
      // best-effort lazy load of plugins relevant to the request
      try {
        await (this.plugins as PluginManager).resolveForRequest(request);
      } catch (err) {
        this.logger.warn(`Plugin resolution failed: ${(err as Error).message}`);
      }
    }
    const toolList = this.tools.list();
    const systemPrompt = this.promptBuilder.build(
      toolList.map((def) => ({ definition: def, execute: async () => ({ ok: true }) }) as unknown as Tool),
    );
    const ctx: AgentContext = {
      cwd: options.context?.cwd ?? process.cwd(),
      sessionId: `sess_${Date.now().toString(36)}`,
      systemPrompt,
      messages: [{ role: 'user', content: request }],
      tools: this.tools.list().map((def) => ({ definition: def, execute: async () => ({ ok: true }) }) as unknown as Tool),
      request,
      budget: {
        maxSteps: 10,
        maxTokens: 8000,
        deadlineMs: 60_000,
      },
      meta: (options.context?.meta ?? {}) as Record<string, Json>,
      ...options.context,
    };
    return this.planner.run(ctx, options);
  }
}

export const createRuntime = (opts?: RuntimeOptions): Runtime => new Runtime(opts);
