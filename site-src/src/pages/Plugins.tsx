import { H1, P, Card, Grid, Code, Pill } from '../components/ui';

const plugins = [
  { name: 'memory', desc: 'Long-term persistent memory across sessions.', triggers: 'remember, memory, recall' },
  { name: 'context', desc: 'Project map and token counter.', triggers: 'project, map, overview, tokens' },
  { name: 'todo', desc: 'Lightweight todo list for the agent to track work.', triggers: 'todo, task, plan, checklist' },
  { name: 'web-search', desc: 'SearXNG + URL fetch.', triggers: 'search, web, docs, documentation, latest' },
  { name: 'mcp', desc: 'Model Context Protocol adapter (in-process + stdio).', triggers: 'mcp, playwright, browser' },
  { name: 'subagents', desc: 'Delegate to focused sub-agents.', triggers: 'delegate, specialist, worker' },
];

export function Plugins() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <Pill color="purple">Plugins</Pill>
      <H1>Built-in plugins</H1>
      <P>
        AI By is plugin-first. Every feature is a manifest-driven plugin. The core only reads the
        manifest — the implementation loads the first time the planner or the user needs it.
      </P>

      <div className="mt-6">
        <Grid cols={3}>
          {plugins.map((p) => (
            <Card key={p.name} title={p.name} icon="🧩">
              <P>{p.desc}</P>
              <div className="mt-2 text-xs text-ink-500 dark:text-ink-400 font-mono">triggers: {p.triggers}</div>
            </Card>
          ))}
        </Grid>
      </div>

      <h2 className="notion-h2 mt-14 mb-3">Write your own plugin</h2>
      <P>
        A plugin is a TypeScript file that exports a <code>Plugin</code> object. The manifest
        declares what it is, what tools it provides, and what keywords trigger its lazy load.
      </P>
      <Code lang="typescript">{`import type { Plugin, Tool } from '@ai-by/core';

const myTool: Tool = {
  definition: {
    id: 'myplugin.greet',
    name: 'Greet',
    description: 'Greets the user',
    category: 'misc',
    pluginId: 'myplugin',
    parameters: {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
    },
    keywords: ['greet', 'hello', 'say hi'],
  },
  async execute(args) {
    const a = args as { name: string };
    return { ok: true, data: { message: \`Hello, \${a.name}!\` } };
  },
};

export const myPlugin: Plugin = {
  manifest: {
    id: 'myplugin',
    version: '1.0.0',
    description: 'My custom plugin',
    lazy: true,
    enabled: true,
    triggers: ['greet', 'hello'],
  },
  async setup(ctx) {
    if (!ctx.tools.has(myTool.definition.id)) ctx.tools.register(myTool);
    return { tools: [myTool] };
  },
};`}</Code>
    </div>
  );
}
