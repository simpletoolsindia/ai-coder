import type { Json, Plugin, Tool, ToolExecutionContext, ToolResult } from '../../core/types.js';

export interface SubAgentSpec {
  name: string;
  systemPrompt: string;
  tools?: string[];
  maxSteps?: number;
}

export interface SubAgentResult {
  name: string;
  text: string;
  steps: number;
  ok: boolean;
  error?: string;
}

export interface SubAgentExecutorOptions {
  /**
   * Function that runs a sub-agent. The default implementation in this
   * plugin echoes the request to keep tests deterministic.
   */
  run?: (spec: SubAgentSpec, request: string) => Promise<SubAgentResult>;
}

const DEFAULT_RUN = async (spec: SubAgentSpec, request: string): Promise<SubAgentResult> => {
  return {
    name: spec.name,
    text: `[${spec.name}] would handle: ${request}`,
    steps: 0,
    ok: true,
  };
};

let executor: (spec: SubAgentSpec, request: string) => Promise<SubAgentResult> = DEFAULT_RUN;

export function setSubAgentExecutor(fn: (spec: SubAgentSpec, request: string) => Promise<SubAgentResult>): void {
  executor = fn;
}

export function getSubAgentExecutor(): (spec: SubAgentSpec, request: string) => Promise<SubAgentResult> {
  return executor;
}

const subAgentRunTool: Tool = {
  definition: {
    id: 'subagent.run',
    name: 'Run SubAgent',
    description: 'Delegate a task to a specialized sub-agent.',
    category: 'subagent',
    pluginId: 'subagents',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Sub-agent name' },
        systemPrompt: { type: 'string' },
        request: { type: 'string' },
        maxSteps: { type: 'integer', default: 5 },
        tools: { type: 'array', items: { type: 'string' } },
      },
      required: ['name', 'request'],
    },
    keywords: ['subagent', 'delegate', 'worker', 'sub-agent', 'agent', 'specialist'],
  },
  async execute(args: Json, _ctx: ToolExecutionContext): Promise<ToolResult> {
    const a = args as {
      name?: string;
      systemPrompt?: string;
      request?: string;
      maxSteps?: number;
      tools?: string[];
    };
    if (!a.name) return { ok: false, error: 'name is required' };
    if (!a.request) return { ok: false, error: 'request is required' };
    const spec: SubAgentSpec = {
      name: a.name,
      systemPrompt: a.systemPrompt ?? `You are ${a.name}, a focused sub-agent.`,
      tools: a.tools,
      maxSteps: a.maxSteps ?? 5,
    };
    try {
      const result = await executor(spec, a.request);
      return { ok: result.ok, data: result, error: result.error };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  },
};

export const subAgentsPlugin: Plugin = {
  manifest: {
    id: 'subagents',
    version: '1.0.0',
    description: 'Delegate work to specialized sub-agents with isolated prompts and tools.',
    tools: ['subagent.run'],
    lazy: true,
    enabled: true,
    triggers: ['subagent', 'delegate', 'specialist', 'worker', 'helper agent'],
    tags: ['subagents', 'multi-agent'],
  },
  async setup(ctx) {
    if (!ctx.tools.has(subAgentRunTool.definition.id)) {
      ctx.tools.register(subAgentRunTool);
    }
    return { tools: [subAgentRunTool] };
  },
  async shutdown() {
    executor = DEFAULT_RUN;
  },
};

export const __subAgentsTesting = { DEFAULT_RUN };
