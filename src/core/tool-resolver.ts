import type { Json, Tool, ToolDefinition, ToolResult } from './types.js';
import { EventBus } from './event-bus.js';
import { Logger, createLogger } from './logger.js';
import { PermissionEngine } from './permission-engine.js';
import { SettingsManager } from './settings-manager.js';
import { ModeController } from './mode-controller.js';
import { resilientInvoke } from './resilience.js';

export interface ToolRegistryOptions {
  logger?: Logger;
  events?: EventBus;
  settings?: SettingsManager;
  permissions?: PermissionEngine;
  mode?: ModeController;
}

export interface ResolvedTool {
  tool: Tool;
  score: number;
  reasons: string[];
}

export class ToolRegistry {
  private tools = new Map<string, Tool>();
  private options: Required<Omit<ToolRegistryOptions, 'events' | 'settings' | 'permissions' | 'mode'>> & {
    events?: EventBus;
    settings?: SettingsManager;
    permissions?: PermissionEngine;
    mode?: ModeController;
  };
  private usageStats = new Map<
    string,
    { count: number; lastUsed: number; errors: number }
  >();

  constructor(options: ToolRegistryOptions = {}) {
    this.options = {
      logger: options.logger ?? createLogger({ level: 'info' }),
      events: options.events,
      settings: options.settings,
      permissions: options.permissions,
      mode: options.mode,
    };
  }

  register(tool: Tool): void {
    if (this.tools.has(tool.definition.id)) {
      return;
    }
    this.tools.set(tool.definition.id, tool);
    this.options.events?.emitSync('tool.registered', { id: tool.definition.id });
  }

  registerMany(tools: Tool[]): void {
    for (const t of tools) this.register(t);
  }

  unregister(id: string): boolean {
    const removed = this.tools.delete(id);
    if (removed) this.options.events?.emitSync('tool.unregistered', { id });
    return removed;
  }

  has(id: string): boolean {
    return this.tools.has(id);
  }

  get(id: string): Tool | undefined {
    return this.tools.get(id);
  }

  list(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((t) => t.definition);
  }

  categories(): string[] {
    return Array.from(new Set(this.list().map((t) => t.category))).sort();
  }

  byCategory(category: string): ToolDefinition[] {
    return this.list().filter((t) => t.category === category);
  }

  byPlugin(pluginId: string): ToolDefinition[] {
    return this.list().filter((t) => t.pluginId === pluginId);
  }

  resolveForRequest(
    request: string,
    opts: { maxTools?: number; minScore?: number; categories?: string[] } = {},
  ): ResolvedTool[] {
    const tokens = tokenize(request);
    const max = opts.maxTools ?? 8;
    const minScore = opts.minScore ?? 0;
    const allowedCategories = opts.categories
      ? new Set(opts.categories)
      : undefined;
    const results: ResolvedTool[] = [];
    for (const tool of this.tools.values()) {
      if (allowedCategories && !allowedCategories.has(tool.definition.category)) continue;
      if (this.options.settings && !this.options.settings.isToolEnabled(tool.definition.id)) continue;
      const { score, reasons } = scoreTool(tool.definition, tokens);
      if (score >= minScore) {
        results.push({ tool, score, reasons });
      }
    }
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, max);
  }

  /**
   * Find the single best tool to handle a request.
   * Returns undefined if no tool seems relevant.
   */
  bestFor(request: string, categories?: string[]): Tool | undefined {
    return this.resolveForRequest(request, { maxTools: 1, minScore: 1, categories })[0]?.tool;
  }

  async invoke(
    id: string,
    args: Json,
    ctx: {
      cwd: string;
      caller: string;
      sessionId: string;
      signal?: AbortSignal;
    },
  ): Promise<ToolResult> {
    const tool = this.tools.get(id);
    if (!tool) {
      return { ok: false, error: `Tool "${id}" not found` };
    }

    // Mode gate (plan vs execute)
    if (this.options.mode) {
      const decision = this.options.mode.evaluate(tool.definition, (args as Record<string, unknown>) ?? {});
      if (!decision.allowed) {
        return { ok: false, error: decision.reason };
      }
    }

    if (this.options.permissions) {
      try {
        await this.options.permissions.enforce(tool.definition, args as Record<string, unknown>);
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
    }

    const start = Date.now();
    const result = await resilientInvoke(
      tool,
      args,
      {
        cwd: ctx.cwd,
        caller: ctx.caller,
        sessionId: ctx.sessionId,
        signal: ctx.signal,
        permissions: { action: 'allow' },
        logger: this.options.logger.child(`tool:${id}`),
      },
    );
    const dur = Date.now() - start;
    this.recordUsage(id, !result.ok);
    if (result.ok) {
      this.options.events?.emitSync('tool.executed', { id, ok: true, durationMs: dur });
    } else {
      this.options.events?.emitSync('tool.failed', { id, error: result.error });
    }
    return { ...result, durationMs: dur };
  }

  usage(): Array<{ id: string; count: number; lastUsed: number; errors: number }> {
    return Array.from(this.usageStats.entries()).map(([id, s]) => ({ id, ...s }));
  }

  private recordUsage(id: string, isError: boolean): void {
    const cur = this.usageStats.get(id) ?? { count: 0, lastUsed: 0, errors: 0 };
    cur.count += 1;
    cur.lastUsed = Date.now();
    if (isError) cur.errors += 1;
    this.usageStats.set(id, cur);
  }

  clear(): void {
    this.tools.clear();
    this.usageStats.clear();
  }
}

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'my', 'your',
  'and', 'or', 'but', 'if', 'then', 'else', 'of', 'to', 'in', 'on', 'at',
  'for', 'with', 'by', 'from', 'as', 'this', 'that', 'these', 'those',
  'do', 'does', 'did', 'have', 'has', 'had', 'will', 'would', 'can', 'could',
  'should', 'may', 'might', 'must', 'shall', 'just', 'please', 'tell', 'me', 'about',
]);

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9_\- ]/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !STOP_WORDS.has(t));
}

function scoreTool(def: ToolDefinition, tokens: string[]): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;
  const haystack = [
    def.id,
    def.name,
    def.description,
    def.category,
    ...(def.keywords ?? []),
  ]
    .join(' ')
    .toLowerCase();
  for (const t of tokens) {
    if (haystack.includes(t)) {
      score += 1;
      reasons.push(`token "${t}" matches`);
    }
    if (def.id.toLowerCase().includes(t)) {
      score += 2;
    }
  }
  return { score, reasons };
}

export const createToolRegistry = (opts?: ToolRegistryOptions): ToolRegistry => new ToolRegistry(opts);
