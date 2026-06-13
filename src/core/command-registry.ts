import type { CommandContext, CommandDefinition } from './types.js';
import { EventBus } from './event-bus.js';
import { Logger, createLogger } from './logger.js';

export interface CommandRegistryOptions {
  logger?: Logger;
  events?: EventBus;
  /** Character that prefixes a command. Default "/" */
  prefix?: string;
}

export class CommandNotFoundError extends Error {
  constructor(name: string) {
    super(`Command "${name}" not found`);
    this.name = 'CommandNotFoundError';
  }
}

export class CommandParseError extends Error {
  constructor(input: string, reason: string) {
    super(`Could not parse command "${input}": ${reason}`);
    this.name = 'CommandParseError';
  }
}

export class CommandRegistry {
  private commands = new Map<string, CommandDefinition>();
  private aliases = new Map<string, string>();
  private options: Required<Omit<CommandRegistryOptions, 'events' | 'logger'>> & {
    logger: Logger;
    events?: EventBus;
  };

  constructor(options: CommandRegistryOptions = {}) {
    this.options = {
      logger: options.logger ?? createLogger({ level: 'info' }),
      events: options.events,
      prefix: options.prefix ?? '/',
    };
  }

  register(cmd: CommandDefinition): void {
    if (this.commands.has(cmd.name)) {
      throw new Error(`Command "${cmd.name}" is already registered`);
    }
    this.commands.set(cmd.name, cmd);
    this.options.events?.emitSync('command.registered', { id: cmd.id, name: cmd.name });
  }

  registerMany(cmds: CommandDefinition[]): void {
    for (const c of cmds) this.register(c);
  }

  registerAlias(alias: string, target: string): void {
    if (alias === target) {
      throw new Error('Alias cannot be the same as target');
    }
    this.aliases.set(alias, target);
  }

  unregister(name: string): boolean {
    const existed = this.commands.delete(name);
    for (const [k, v] of this.aliases.entries()) {
      if (v === name) this.aliases.delete(k);
    }
    return existed;
  }

  has(name: string): boolean {
    return this.commands.has(this.resolveAlias(name));
  }

  get(name: string): CommandDefinition | undefined {
    return this.commands.get(this.resolveAlias(name));
  }

  resolveAlias(name: string): string {
    let current = name;
    const seen = new Set<string>();
    while (this.aliases.has(current)) {
      if (seen.has(current)) break;
      seen.add(current);
      current = this.aliases.get(current) as string;
    }
    return current;
  }

  list(opts: { includeHidden?: boolean } = {}): CommandDefinition[] {
    return Array.from(this.commands.values()).filter((c) => opts.includeHidden || !c.hidden);
  }

  names(): string[] {
    return Array.from(this.commands.keys());
  }

  parse(input: string): { name: string; args: string } {
    const trimmed = input.trim();
    if (!trimmed) {
      throw new CommandParseError(input, 'empty input');
    }
    if (!trimmed.startsWith(this.options.prefix)) {
      throw new CommandParseError(input, `expected prefix "${this.options.prefix}"`);
    }
    const body = trimmed.slice(this.options.prefix.length);
    const space = body.search(/\s/);
    if (space === -1) {
      return { name: this.options.prefix + body, args: '' };
    }
    return { name: this.options.prefix + body.slice(0, space), args: body.slice(space + 1).trim() };
  }

  async run(input: string, ctx: Partial<CommandContext> = {}): Promise<{ name: string; args: string }> {
    const parsed = this.parse(input);
    const cmd = this.get(parsed.name);
    if (!cmd) {
      throw new CommandNotFoundError(parsed.name);
    }
    const fullCtx: CommandContext = {
      container: ctx.container,
      events: ctx.events as never,
      logger: ctx.logger ?? this.options.logger,
      settings: ctx.settings as never,
      providers: ctx.providers as never,
      tools: ctx.tools as never,
      plugins: ctx.plugins,
      print: ctx.print ?? ((line) => process.stdout.write(`${line}\n`)),
      mode: ctx.mode,
      status: ctx.status,
    };
    (fullCtx as unknown as { commands: CommandRegistry }).commands = this;
    await cmd.execute(parsed.args, fullCtx);
    this.options.events?.emitSync('command.executed', { name: parsed.name, args: parsed.args });
    return parsed;
  }

  clear(): void {
    this.commands.clear();
    this.aliases.clear();
  }
}

export const createCommandRegistry = (opts?: CommandRegistryOptions): CommandRegistry =>
  new CommandRegistry(opts);
