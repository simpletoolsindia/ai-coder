import { H1, P, Card, Code, Pill } from '../components/ui';

const commands = [
  { name: '/help', desc: 'List all available commands.' },
  { name: '/login', desc: 'Configure a new provider. Usage: /login <id> <kind> [baseUrl] [apiKey] [model]' },
  { name: '/providers', desc: 'List configured providers; mark the active one with *.' },
  { name: '/use <id>', desc: 'Set the active provider.' },
  { name: '/settings', desc: 'View or update settings. Usage: /settings [section] [key=value]…' },
  { name: '/extensions', desc: 'List, enable, disable, or inspect plugins.' },
  { name: '/tools', desc: 'List, enable, or disable tools. Shows usage stats.' },
  { name: '/mode [plan|execute|toggle]', desc: 'View or set the agent mode. Press Tab in the TUI to toggle.' },
  { name: '/compact', desc: 'Compact the conversation context.' },
  { name: '/doctor', desc: 'Run runtime health checks (Node, providers, plugins, tools).' },
  { name: '/clear', desc: 'Clear the screen and reset the conversation.' },
  { name: '/exit', desc: 'Exit AI By.' },
];

export function Commands() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <Pill>Commands</Pill>
      <H1>Slash commands</H1>
      <P>Every command in the REPL. Most have aliases via <code>/help</code>.</P>

      <div className="mt-6 grid gap-2">
        {commands.map((c) => (
          <Card key={c.name}>
            <div className="flex items-baseline gap-3">
              <code className="font-mono text-[13px] text-brand-700 dark:text-brand-300 whitespace-nowrap">{c.name}</code>
              <span className="text-ink-600 dark:text-ink-300 text-sm">{c.desc}</span>
            </div>
          </Card>
        ))}
      </div>

      <h2 className="notion-h2 mt-12 mb-3">Login examples</h2>
      <Code lang="text">{`# OpenAI
/login openai openai https://api.openai.com/v1 sk-xxx gpt-4o

# Local Ollama
/login local ollama

# Anthropic via OpenAI-compatible gateway
/login anthropic openai-compatible https://api.anthropic.com sk-xxx claude-3-5-sonnet

# LM Studio
/login lmstudio openai-compatible http://localhost:1234/v1

# Gemini
/login gemini openai-compatible https://generativelanguage.googleapis.com/v1beta \${GEMINI_API_KEY} gemini-1.5-pro`}</Code>

      <h2 className="notion-h2 mt-12 mb-3">Settings keys</h2>
      <Code lang="text">{`/settings general theme=dark
/settings search searxngUrl=https://searxng.example.com
/settings tools fs.delete.enabled=false
/settings memory maxEntries=500`}</Code>
    </div>
  );
}
