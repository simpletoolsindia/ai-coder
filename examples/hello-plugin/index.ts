import type { Plugin, Tool, ToolExecutionContext, ToolResult } from '../src/core/types.js';

const helloTool: Tool = {
  definition: {
    id: 'hello.greet',
    name: 'Greet',
    description: 'Greets the user by name.',
    category: 'misc',
    pluginId: 'hello-plugin',
    parameters: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Name to greet' } },
      required: ['name'],
    },
    keywords: ['greet', 'hello', 'say hi', 'wave'],
  },
  async execute(args: Json, _ctx: ToolExecutionContext): Promise<ToolResult> {
    const a = args as { name?: string };
    if (!a.name) return { ok: false, error: 'name is required' };
    return { ok: true, data: { message: `Hello, ${a.name}!` } };
  },
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type Json = import('../src/core/types.js').Json;

export const helloPlugin: Plugin = {
  manifest: {
    id: 'hello-plugin',
    version: '1.0.0',
    description: 'A minimal example plugin that registers a single "greet" tool.',
    lazy: true,
    enabled: true,
    triggers: ['greet', 'hello', 'say hi'],
    tags: ['example', 'demo'],
  },
  async setup(ctx) {
    if (!ctx.tools.has(helloTool.definition.id)) ctx.tools.register(helloTool);
    return { tools: [helloTool] };
  },
  async shutdown() {
    /* no-op */
  },
};
