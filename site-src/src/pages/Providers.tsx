import { H1, P, Card, Grid, Code, Pill } from '../components/ui';

const providers = [
  { name: 'OpenAI', kind: 'openai', baseUrl: 'https://api.openai.com/v1' },
  { name: 'Anthropic', kind: 'openai-compatible', baseUrl: 'https://api.anthropic.com' },
  { name: 'Gemini', kind: 'openai-compatible', baseUrl: 'https://generativelanguage.googleapis.com/v1beta' },
  { name: 'Ollama (local)', kind: 'ollama', baseUrl: 'http://localhost:11434/v1' },
  { name: 'LM Studio (local)', kind: 'openai-compatible', baseUrl: 'http://localhost:1234/v1' },
  { name: 'Custom OpenAI-compatible', kind: 'openai-compatible', baseUrl: 'your base URL' },
];

export function Providers() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <Pill color="blue">Providers</Pill>
      <H1>Multi-provider out of the box</H1>
      <P>
        AI By ships with an OpenAI-compatible provider that works with any chat-completions
        endpoint. Configure with <code>/login</code> or environment variables.
      </P>

      <div className="mt-6">
        <Grid cols={3}>
          {providers.map((p) => (
            <Card key={p.name} title={p.name} icon="🔌">
              <P><span className="font-mono text-xs text-ink-500">kind:</span> <code>{p.kind}</code></P>
              <P><span className="font-mono text-xs text-ink-500">baseUrl:</span> <code>{p.baseUrl}</code></P>
            </Card>
          ))}
        </Grid>
      </div>

      <h2 className="notion-h2 mt-12 mb-3">Quick login</h2>
      <Code lang="text">{`# OpenAI
/login openai openai https://api.openai.com/v1 sk-xxx gpt-4o

# Anthropic
/login anthropic openai-compatible https://api.anthropic.com sk-xxx claude-3-5-sonnet

# Ollama
/login local ollama http://localhost:11434/v1`}</Code>

      <h2 className="notion-h2 mt-12 mb-3">Environment variables</h2>
      <P>Providers fall back to env vars when no value is supplied to <code>/login</code>.</P>
      <Code lang="bash">{`# Specific provider
OPENAI_API_KEY=sk-xxx
OPENAI_BASE_URL=https://api.openai.com/v1

# Or by provider id
OPENAI_API_KEY=sk-xxx
MYPROVIDER_API_KEY=xxx
MYPROVIDER_BASE_URL=https://...`}</Code>
    </div>
  );
}
