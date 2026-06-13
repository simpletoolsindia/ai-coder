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
    }
    await this.runtime.initialize();
    await this.runtime.providers.loadFromFile(resolveProviderConfigPath(process.cwd())).catch((err) => {
      this.options.logger.warn(`Could not load providers.json: ${(err as Error).message}`);
    });
    // Pre-register built-in tools without triggering plugin loading so the
    // core tools are immediately available.
    const [{ filesystemTools }, { searchTools }, { terminalTools }] = await Promise.all([
      import('../tools/filesystem/index.js'),
      import('../tools/search/index.js'),
      import('../tools/terminal/index.js'),
    ]);
    this.runtime.tools.registerMany([...filesystemTools, ...searchTools, ...terminalTools]);
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
    this.rl?.prompt();
    await new Promise<void>((resolve) => {
      this.rl?.on('close', () => resolve());
    });
  }

  async handle(input: string, commands: CommandRegistry): Promise<void> {
    const trimmed = input.trim();
    if (!trimmed) return;
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
    try {
      const result = await this.runtime.run(trimmed);
      this.print(result.text || '(no response)');
    } catch (err) {
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
