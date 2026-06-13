import { H1, P, Card, Grid, Pill } from '../components/ui';

const items = [
  {
    icon: '🧭',
    title: 'PLAN / EXECUTE modes',
    body: 'Read-only plan mode by default. Press Tab in the TUI to switch to EXECUTE. Plan mode allows fs.read, search.*, web.*, memory read, and read-only bash (ls, cat, curl, git status, …).',
  },
  {
    icon: '🎨',
    title: 'Beautiful React TUI',
    body: 'Built with ink (React for CLIs). Sidebar with providers / tools / plugins, chat history, live activity feed, animated loading bar with the current tool and step counter.',
  },
  {
    icon: '🛡️',
    title: '100% tool reliability',
    body: 'Schema validation before invocation, retries on transient failures, idempotency cache for duplicate calls, loop guard (repeated / oscillating / no-progress), completion check, auto-retry if work is incomplete.',
  },
  {
    icon: '🧩',
    title: 'Plugin-first',
    body: 'Memory, MCP, web search, sub-agents, context — every feature is a manifest-driven plugin. The core knows nothing about specific features.',
  },
  {
    icon: '🧠',
    title: 'Persistent memory',
    body: 'Save facts, code conventions, and decisions. Search across sessions. Configurable retention, persistent JSON store, opt-in per project.',
  },
  {
    icon: '🗜️',
    title: 'Adaptive context compression',
    body: 'Auto-compact at 95% context utilization. Manual /compact command for explicit control. Aggressive single-message truncation for huge tool outputs.',
  },
  {
    icon: '🔎',
    title: 'Tool RAG',
    body: 'The system prompt does not dump every tool. A small, highly-relevant subset is chosen per request.',
  },
  {
    icon: '🔁',
    title: 'Multi-provider',
    body: 'OpenAI, Anthropic, Gemini, Ollama, LM Studio, any OpenAI-compatible endpoint. /login walks you through it. Last-used (provider, model) is persisted and restored.',
  },
  {
    icon: '🪟',
    title: 'Cross-platform',
    body: 'macOS, Linux, Windows. One installer that detects your OS and installs missing dependencies. Cross-platform shell exec abstraction for tools.',
  },
  {
    icon: '🧩',
    title: 'MCP',
    body: 'Model Context Protocol adapter for in-process and stdio servers. Tools registered server-side automatically appear in the agent.',
  },
  {
    icon: '🤝',
    title: 'Sub-agents',
    body: 'Delegate to focused sub-agents with isolated prompts. Each sub-agent can use a different system prompt and tool subset.',
  },
  {
    icon: '📊',
    title: 'Live status UI',
    body: 'Emoji + progress bar per tool call: 💭 thinking, 📖 reading, ✏️ writing, 🐚 running, 🌐 searching, 🧠 remembering, 🗜️ compressing, …',
  },
  {
    icon: '📚',
    title: 'Self-improving (AGENT.md)',
    body: 'Writes an AGENT.md with the patterns it sees in your work (most-used tools, common request shapes, your hints). The next session starts with that context.',
  },
  {
    icon: '🩺',
    title: '/doctor',
    body: 'Runtime health check — Node version, platform, providers, tools, settings. Surfaces what is misconfigured before it bites.',
  },
  {
    icon: '🔐',
    title: 'Permissions first',
    body: 'Per-tool allow/deny/ask rules. Tool-level enable/disable in settings. Plan mode is a hard allow-list on top of that.',
  },
  {
    icon: '📝',
    title: 'Markdown-aware chat',
    body: 'Code blocks, headers, links, lists all render cleanly. Diff highlighting in tool results when relevant.',
  },
  {
    icon: '🧪',
    title: 'Comprehensive tests',
    body: 'Unit, integration, E2E, performance. Mocks for HTTP, providers, MCP. 86%+ line coverage, 0 lint errors.',
  },
  {
    icon: '🌐',
    title: 'Docs site',
    body: 'This site. Notion-style, modern, fast, dark-mode aware. Auto-deployed to GitHub Pages on every push to main.',
  },
];

export function Features() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <Pill>Features</Pill>
      <H1>Everything in the box</H1>
      <P>
        AI By is small on the outside and packed on the inside. The core is <span className="font-semibold">15 modules</span>;
        the surface is built out of plugins, built-in tools, and a small set of battle-tested defaults.
      </P>
      <div className="mt-8">
        <Grid cols={3}>
          {items.map((f) => (
            <Card key={f.title} title={f.title} icon={f.icon}>{f.body}</Card>
          ))}
        </Grid>
      </div>
    </div>
  );
}
