import { createInterface, Interface as RLInterface } from 'node:readline';
import { EventBus } from '../core/event-bus.js';
import { Logger, createLogger } from '../core/logger.js';
import { Runtime } from '../core/runtime.js';
import { CommandNotFoundError, CommandParseError, CommandRegistry } from '../core/command-registry.js';
import { builtInCommands } from './commands.js';
import { builtInPlugins } from '../plugins/index.js';
import { coreToolsPlugin } from '../tools/index.js';
import { resolveProviderConfigPath } from '../core/provider-manager.js';
import { PluginManager } from '../core/plugin-manager.js';
import { resolveConfigPath } from '../core/settings-manager.js';
import { StatusDisplay } from '../core/status-display.js';
import { ModeController } from '../core/mode-controller.js';

export interface CliOptions {
  runtime?: Runtime;
  /** When true, the CLI runs in a non-interactive batch mode reading from stdin */
  batch?: boolean;
  /** Disable the readline interface (useful for tests) */
  noPrompt?: boolean;
  logger?: Logger;
  events?: EventBus;
  /** Prompt prefix */
  prompt?: string;
  /** Disable plugins */
  noPlugins?: boolean;
}

export class CLI {
  private runtime: Runtime;
  private options: Required<Omit<CliOptions, 'runtime' | 'logger' | 'events'>> & {
    runtime?: Runtime;
    logger: Logger;
    events: EventBus;
  };
  private rl?: RLInterface;
  private exitRequested = false;
  private status: StatusDisplay;
  private mode: ModeController;

  constructor(options: CliOptions = {}) {
    this.options = {
      runtime: options.runtime,
      logger: options.logger ?? createLogger({ level: 'info' }),
      events: options.events ?? new EventBus(),
      batch: options.batch ?? false,
      noPrompt: options.noPrompt ?? false,
      prompt: options.prompt ?? 'ai-by> ',
      noPlugins: options.noPlugins ?? false,
    };
    this.runtime = this.options.runtime ?? new Runtime({ logger: this.options.logger, events: this.options.events });
    this.status = new StatusDisplay({
      totalSteps: 8,
      onLine: (line) => this.print(line),
    });
    this.mode = new ModeController();
  }

  async initialize(): Promise<void> {
    this.runtime.commands.registerMany(builtInCommands);
    if (!this.options.noPlugins) {
      const plugins = new PluginManager({
        logger: this.options.logger,
        events: this.options.events,
        settings: this.runtime.settings,
        tools: this.runtime.tools,
        commands: this.runtime.commands,
        permissions: this.runtime.permissions,
        builtins: [coreToolsPlugin, ...builtInPlugins],
      });
      this.runtime.plugins = plugins;
      this.runtime.planner['options'].plugins = plugins;
      this.runtime.planner['options'].mode = this.mode;
    }
    await this.runtime.initialize();
    await this.runtime.providers.loadFromFile(resolveProviderConfigPath(process.cwd())).catch((err) => {
      this.options.logger.warn(`Could not load providers.json: ${(err as Error).message}`);
    });
    // Wire last-used model persistence: subscribe to provider.used events
    // and update settings + persist the active (provider, model) pair.
    this.options.events.on('provider.used', (payload) => {
      const p = payload as { id: string; model?: string };
      void this.runtime.settings.update('general', (cur) => ({
        ...cur,
        defaultProvider: p.id,
        defaultModel: p.model ?? cur.defaultModel,
      }));
    });
    // Restore last-used selection if it was persisted and still exists.
    const gen = this.runtime.settings.get('general');
    if (gen.defaultProvider && this.runtime.providers.has(gen.defaultProvider)) {
      this.runtime.providers.setActive(gen.defaultProvider);
    }
    // Pre-register built-in tools without triggering plugin loading so the
    // core tools are immediately available.
    const [{ filesystemTools }, { searchTools }, { terminalTools }, { gitTools }] = await Promise.all([
      import('../tools/filesystem/index.js'),
      import('../tools/search/index.js'),
      import('../tools/terminal/index.js'),
      import('../tools/git/index.js'),
    ]);
    this.runtime.tools.registerMany([...filesystemTools, ...searchTools, ...terminalTools, ...gitTools]);
    // Bind the status display to runtime events
    this.status.bind(this.options.events);
    this.options.events.on('mode.changed', (p) => {
      const ev = p as { from: string; to: string };
      this.print(`\n[mode] ${ev.from.toUpperCase()} → ${ev.to.toUpperCase()}`);
    });
    this.mode.onChange((ev) => {
      this.options.events.emitSync('mode.changed', ev);
    });
    this.options.events.emitSync('cli.initialized', {});
  }

  print(line: string): void {
    process.stdout.write(`${line}\n`);
  }

  async run(input?: string): Promise<void> {
    if (!this.rl && !this.options.noPrompt) {
      this.rl = createInterface({ input: process.stdin, output: process.stdout, prompt: this.options.prompt });
    }
    const commands: CommandRegistry = this.runtime.commands;
    if (input != null) {
      await this.handle(input, commands);
      return;
    }
    this.rl?.on('line', async (line) => {
      await this.handle(line, commands);
      if (!this.exitRequested && !this.options.noPrompt) this.rl?.prompt();
    });
    if (this.options.noPrompt) return;
    this.printBanner();
    this.rl?.prompt();
    await new Promise<void>((resolve) => {
      this.rl?.on('close', () => resolve());
    });
  }

  private printBanner(): void {
    const mode = this.mode.mode.toUpperCase();
    const provider = this.runtime.providers.activeIdOrUndefined() ?? '(no provider)';
    this.print(`\x1b[1mAI By\x1b[0m · mode: \x1b[36m${mode}\x1b[0m · provider: \x1b[33m${provider}\x1b[0m`);
    this.print('Type a request, a slash command, or press Tab to switch PLAN/EXECUTE mode.\n');
  }

  async handle(input: string, commands: CommandRegistry): Promise<void> {
    const trimmed = input.trim();
    if (!trimmed) return;
    // Tab key (received as a literal tab character) toggles PLAN/EXECUTE mode
    if (trimmed === '\t' || /^tab$/i.test(trimmed)) {
      const next = this.mode.toggle();
      this.print(`\n[mode] switched to ${next.toUpperCase()}`);
      return;
    }
    if (trimmed.startsWith('/')) {
      try {
        await commands.run(trimmed, {
          commands: this.runtime.commands,
          settings: this.runtime.settings,
          providers: this.runtime.providers,
          tools: this.runtime.tools,
          plugins: this.runtime.plugins,
          events: this.options.events,
          logger: this.options.logger,
          print: (line) => this.print(line),
          mode: this.mode,
          status: this.status,
        });
      } catch (err) {
        if (err instanceof CommandNotFoundError) {
          this.print(`Unknown command: ${err.message}`);
        } else if (err instanceof CommandParseError) {
          this.print(`Parse error: ${err.message}`);
        } else {
          this.print(`Error: ${(err as Error).message}`);
        }
      }
      return;
    }
    this.status.reset(8);
    this.status.setActivity(this.mode.isPlan() ? 'planning' : 'thinking', trimmed.slice(0, 60));
    try {
      const result = await this.runtime.run(trimmed, {
        context: { cwd: process.cwd() },
      });
      this.status.done(`done in ${result.steps.length} step(s)`);
      this.print(result.text || '(no response)');
    } catch (err) {
      this.status.fail((err as Error).message);
      this.print(`Error: ${(err as Error).message}`);
    }
  }

  async shutdown(): Promise<void> {
    this.rl?.close();
    this.exitRequested = true;
  }
}

export const createCLI = (opts?: CliOptions): CLI => new CLI(opts);

export { resolveConfigPath };
