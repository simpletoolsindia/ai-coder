import { minimatch } from './utils/minimatch.js';
import type { PermissionAction, PermissionDecision, PermissionRule, ToolDefinition } from './types.js';
import { EventBus } from './event-bus.js';
import { Logger, createLogger } from './logger.js';
import { SettingsManager } from './settings-manager.js';

export interface PermissionEngineOptions {
  logger?: Logger;
  events?: EventBus;
  settings?: SettingsManager;
  /** Custom prompt callback (returns true to allow, false to deny) */
  prompt?: (info: PermissionPrompt) => Promise<boolean>;
}

export interface PermissionPrompt {
  tool: ToolDefinition;
  args: Record<string, unknown>;
  reason: string;
  rule?: PermissionRule;
}

export class PermissionDeniedError extends Error {
  constructor(public toolId: string, public reason: string) {
    super(`Permission denied for tool "${toolId}": ${reason}`);
    this.name = 'PermissionDeniedError';
  }
}

export class PermissionEngine {
  private rules: PermissionRule[] = [];
  private defaultAction: PermissionAction = 'ask';
  private options: Required<Omit<PermissionEngineOptions, 'events' | 'settings' | 'prompt'>> & {
    events?: EventBus;
    settings?: SettingsManager;
    prompt?: PermissionEngineOptions['prompt'];
  };

  constructor(options: PermissionEngineOptions = {}) {
    this.options = {
      logger: options.logger ?? createLogger({ level: 'info' }),
      events: options.events,
      settings: options.settings,
      prompt: options.prompt,
    };
  }

  setRules(rules: PermissionRule[]): void {
    this.rules = [...rules];
  }

  addRule(rule: PermissionRule): void {
    this.rules.push(rule);
  }

  removeRule(pattern: string): boolean {
    const before = this.rules.length;
    this.rules = this.rules.filter((r) => r.pattern !== pattern);
    return this.rules.length < before;
  }

  getRules(): PermissionRule[] {
    return [...this.rules];
  }

  setDefault(action: PermissionAction): void {
    this.defaultAction = action;
  }

  /**
   * Evaluate whether a tool call is allowed.
   * Decision order:
   *  1. Tool-level setting in settings (if attached)
   *  2. Most specific matching rule
   *  3. Default action
   */
  async evaluate(tool: ToolDefinition, args: Record<string, unknown> = {}): Promise<PermissionDecision> {
    if (this.options.settings) {
      const toolSettings = this.options.settings.get('tools')[tool.id];
      if (toolSettings && toolSettings.enabled === false) {
        return {
          action: 'deny',
          reason: `Tool "${tool.id}" is disabled in settings`,
        };
      }
      if (toolSettings && toolSettings.permission === 'allow') {
        return { action: 'allow', reason: 'tool setting allow' };
      }
      if (toolSettings && toolSettings.permission === 'deny') {
        return { action: 'deny', reason: 'tool setting deny' };
      }
    }

    const candidates: { rule: PermissionRule; score: number }[] = [];
    for (const rule of this.rules) {
      if (rule.target && rule.target !== '*' && rule.target !== tool.id) continue;
      if (minimatch(tool.id, rule.pattern) || minimatch(tool.name, rule.pattern)) {
        const score = rule.pattern.length;
        candidates.push({ rule, score });
      } else if (rule.target === '*') {
        candidates.push({ rule, score: rule.pattern.length });
      }
    }
    candidates.sort((a, b) => b.score - a.score);
    const top = candidates[0];
    if (top) {
      if (top.rule.action === 'prompt' && this.options.prompt) {
        const ok = await this.options.prompt({
          tool,
          args,
          reason: top.rule.description ?? 'permission required',
          rule: top.rule,
        });
        return { action: ok ? 'allow' : 'deny', rule: top.rule, reason: 'user prompt' };
      }
      return { action: top.rule.action, rule: top.rule };
    }

    if (this.defaultAction === 'prompt' && this.options.prompt) {
      const ok = await this.options.prompt({
        tool,
        args,
        reason: 'no matching rule, default prompt',
      });
      return { action: ok ? 'allow' : 'deny', reason: 'default prompt' };
    }

    return { action: this.defaultAction, reason: 'default rule' };
  }

  async enforce(tool: ToolDefinition, args: Record<string, unknown> = {}): Promise<PermissionDecision> {
    const decision = await this.evaluate(tool, args);
    if (decision.action === 'deny') {
      throw new PermissionDeniedError(tool.id, decision.reason ?? 'denied');
    }
    this.options.events?.emitSync('permission.evaluated', {
      tool: tool.id,
      action: decision.action,
    });
    return decision;
  }

  clear(): void {
    this.rules = [];
  }
}

export const createPermissionEngine = (opts?: PermissionEngineOptions): PermissionEngine =>
  new PermissionEngine(opts);
