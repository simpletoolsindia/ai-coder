import type {
  AgentContext,
  AgentResult,
  AgentStep,
  ChatMessage,
  Json,
  ToolCall,
  ToolResult,
  Usage,
} from './types.js';
import { ProviderManager } from './provider-manager.js';
import { ToolRegistry } from './tool-resolver.js';
import { Logger } from './logger.js';
import { EventBus } from './event-bus.js';
import { PluginManager } from './plugin-manager.js';
import { PromptBuilder } from './prompt-builder.js';
import { ContextCompressor } from './context-compressor.js';
import { LoopGuard } from './loop-guard.js';
import { ModeController } from './mode-controller.js';

export interface PlannerOptions {
  providers: ProviderManager;
  tools: ToolRegistry;
  plugins?: PluginManager;
  promptBuilder: PromptBuilder;
  compressor?: ContextCompressor;
  logger: Logger;
  events?: EventBus;
  /** Maximum tool-calling iterations per request */
  maxSteps?: number;
  /** Auto-resolve plugins per request */
  autoResolvePlugins?: boolean;
  /** Loop detection and safe-exit verification */
  loopGuard?: LoopGuard;
  /** Mode controller (plan vs execute) */
  mode?: ModeController;
}

export interface PlannerRunOptions {
  /** Abort signal */
  signal?: AbortSignal;
  /** Override model */
  model?: string;
  /** Override temperature */
  temperature?: number;
  /** Override max tokens */
  maxTokens?: number;
  /** Pre-loaded plugin ids to skip resolution for */
  preloadedPluginIds?: string[];
  /** Max retry attempts if the loop guard reports incomplete work */
  maxRetries?: number;
}

export class Planner {
  private options: Required<Omit<PlannerOptions, 'compressor' | 'events' | 'plugins' | 'loopGuard' | 'mode'>> & {
    compressor?: ContextCompressor;
    events?: EventBus;
    plugins?: PluginManager;
    loopGuard: LoopGuard;
    mode?: ModeController;
  };

  constructor(options: PlannerOptions) {
    this.options = {
      providers: options.providers,
      tools: options.tools,
      plugins: options.plugins,
      promptBuilder: options.promptBuilder,
      compressor: options.compressor,
      logger: options.logger,
      events: options.events,
      maxSteps: options.maxSteps ?? 10,
      autoResolvePlugins: options.autoResolvePlugins ?? true,
      loopGuard: options.loopGuard ?? new LoopGuard(),
      mode: options.mode,
    };
  }

  async run(ctx: AgentContext, opts: PlannerRunOptions = {}): Promise<AgentResult> {
    const maxRetries = opts.maxRetries ?? 1;
    let attempt = 0;
    let lastResult: AgentResult | undefined;

    while (attempt <= maxRetries) {
      lastResult = await this.runOnce(ctx, opts);
      if (!lastResult.ok) {
        attempt++;
        continue;
      }
      const check = this.options.loopGuard.completionCheck(lastResult, lastResult.steps);
      if (check.complete) {
        return lastResult;
      }
      if (!check.retry || attempt >= maxRetries) {
        return {
          ...lastResult,
          ok: false,
          error: `Incomplete work: ${check.reason}`,
        };
      }
      // Inject a follow-up request to push the agent to finish
      this.options.logger.warn(`Completion check failed: ${check.reason}. Retrying.`);
      ctx.messages = [
        ...ctx.messages,
        { role: 'assistant', content: lastResult.text },
        { role: 'user', content: `Your last response was incomplete (${check.reason}). Finish the work and confirm.` },
      ];
      attempt++;
    }
    return lastResult ?? { ok: false, text: '', steps: [], usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }, error: 'no result' };
  }

  private async runOnce(ctx: AgentContext, opts: PlannerRunOptions): Promise<AgentResult> {
    const deadline = Date.now() + ctx.budget.deadlineMs;
    const provider = this.options.providers.active();
    const messages: ChatMessage[] = [
      { role: 'system', content: ctx.systemPrompt },
      ...ctx.messages,
    ];
    const tools = ctx.tools.map((t) => t.definition);
    const usage: Usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    const steps: AgentStep[] = [];
    const maxSteps = Math.min(this.options.maxSteps, ctx.budget.maxSteps);
    let loopOccurrence = 0;

    for (let i = 0; i < maxSteps; i++) {
      if (Date.now() > deadline) break;
      if (opts.signal?.aborted) break;
      const start = Date.now();

      let workingMessages = messages;
      if (this.options.compressor && messages.length > 6) {
        workingMessages = await this.options.compressor.compress(messages, ctx);
      }

      await this.options.plugins?.runHook('beforeRequest', { prompt: ctx.request, context: ctx.meta as Json });

      const res = await provider.chat({
        messages: workingMessages,
        tools,
        model: opts.model,
        temperature: opts.temperature,
        maxTokens: opts.maxTokens,
        signal: opts.signal,
      });
      this.options.providers.markUsed(provider.id, res.model);
      if (res.usage) {
        usage.promptTokens += res.usage.promptTokens;
        usage.completionTokens += res.usage.completionTokens;
        usage.totalTokens += res.usage.totalTokens;
      }
      const choice = res.choices[0];
      if (!choice) {
        return { ok: false, text: '', steps, usage, error: 'No choice in response' };
      }
      const toolResults: ToolResult[] = [];
      const step: AgentStep = {
        index: i,
        choice,
        toolResults,
        startedAt: start,
        durationMs: Date.now() - start,
      };
      steps.push(step);
      messages.push(choice.message);

      // Loop detection
      const detection = this.options.loopGuard.inspect(steps);
      if (detection.detected) {
        loopOccurrence++;
        this.options.logger.warn(`Loop detected (${detection.reason}): ${detection.detail}`);
        this.options.events?.emitSync('agent.loopDetected', detection);
        if (this.options.loopGuard.shouldForceExit(detection, loopOccurrence)) {
          return {
            ok: false,
            text: choice.message.content,
            steps,
            usage,
            error: `Loop detected: ${detection.reason} - ${detection.detail}`,
          };
        }
      }

      if (!choice.message.tool_calls || choice.message.tool_calls.length === 0) {
        const final = choice.message.content ?? '';
        await this.options.plugins?.runHook('afterRequest', {
          prompt: ctx.request,
          response: final,
          context: ctx.meta as Json,
        });
        return { ok: true, text: final, steps, usage };
      }

      await this.options.plugins?.runHook('beforeToolCall', {
        tool: choice.message.tool_calls[0]?.function.name ?? '',
        args: {},
      });

      for (const call of choice.message.tool_calls) {
        if (Date.now() > deadline) break;
        const result = await this.executeToolCall(call, ctx);
        toolResults.push(result);
        messages.push({
          role: 'tool',
          content: JSON.stringify(result.ok ? result.data : { error: result.error }),
          tool_call_id: call.id,
        });
      }

      await this.options.plugins?.runHook('afterToolCall', {
        tool: choice.message.tool_calls[0]?.function.name ?? '',
        result: toolResults[0] ?? { ok: false, error: 'no result' },
      });
    }

    return { ok: false, text: '', steps, usage, error: 'max steps reached' };
  }

  private async executeToolCall(call: ToolCall, ctx: AgentContext): Promise<ToolResult> {
    let parsed: unknown = {};
    try {
      parsed = JSON.parse(call.function.arguments || '{}');
    } catch {
      return { ok: false, error: `Invalid JSON arguments for tool "${call.function.name}"` };
    }
    return this.options.tools.invoke(
      call.function.name,
      parsed as never,
      { cwd: ctx.cwd, caller: 'planner', sessionId: ctx.sessionId, signal: ctx.meta['signal'] as AbortSignal | undefined },
    );
  }
}

export const createPlanner = (opts: PlannerOptions): Planner => new Planner(opts);
