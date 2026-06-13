import { Link } from 'react-router-dom';
import { H1, P, Callout, Card, Grid, Pill, Code } from '../components/ui';

function HeroTerminal() {
  return (
    <div className="rounded-notion overflow-hidden border border-ink-200 dark:border-ink-700 shadow-notion bg-ink-50 dark:bg-ink-900">
      <div className="flex items-center gap-1.5 px-3 h-8 bg-ink-100 dark:bg-ink-800 border-b border-ink-200 dark:border-ink-700">
        <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
        <span className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
        <span className="w-2.5 h-2.5 rounded-full bg-green-400" />
        <span className="ml-2 text-[11px] text-ink-500 dark:text-ink-400 font-mono">~/code · ai-coder</span>
      </div>
      <div className="font-mono text-[13px] leading-relaxed p-4 text-ink-700 dark:text-ink-200 space-y-1">
        <p><span className="text-brand-600">$</span> ai-coder</p>
        <p className="text-ink-500 dark:text-ink-400">AI By · mode: PLAN · provider: openai · model: gpt-4o</p>
        <p className="text-ink-500 dark:text-ink-400">Type a request, a slash command, or press Tab to switch PLAN/EXECUTE mode.</p>
        <p>&nbsp;</p>
        <p><span className="text-brand-600">ai-coder&gt;</span> build me a TypeScript todo API</p>
        <p className="text-cyan-700 dark:text-cyan-300">💭 thinking ▰▰▰▰▰▰▰▰  step 1/8  planning</p>
        <p className="text-amber-700 dark:text-amber-300">📋 PLAN mode: read &amp; search only · tab to switch</p>
        <p className="text-emerald-700 dark:text-emerald-300">✅ plan ready · 3 files · 4 steps</p>
        <p>&nbsp;</p>
        <p><span className="text-ink-500">[Tab]</span> switched to EXECUTE</p>
        <p><span className="text-brand-600">ai-coder&gt;</span> go</p>
        <p className="text-cyan-700 dark:text-cyan-300">✏️ writing  ▰▰▰▰▰▰▰▰  package.json</p>
        <p className="text-cyan-700 dark:text-cyan-300">✏️ writing  ▰▰▰▰▰▰▰▰  src/server.ts</p>
        <p className="text-cyan-700 dark:text-cyan-300">🐚 running  ▰▰▰▰▰▰▰▱  npm test</p>
        <p className="text-emerald-700 dark:text-emerald-300">✅ done in 6 step(s)</p>
      </div>
    </div>
  );
}

export function Home() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-16">
      <div className="grid md:grid-cols-2 gap-10 items-center">
        <div>
          <Pill color="purple">v0.2.3 · OpenAI-compatible · cross-platform</Pill>
          <h1 className="notion-h1 mt-4">
            The coding agent <span className="text-brand-600">that ships</span>.
          </h1>
          <P>
            AI By is a production-grade coding agent built for non-technical users.
            One command to install, a beautiful terminal UI to use, and a plugin system
            for the things you actually need. Reads, writes, runs tests, opens PRs —
            with <span className="font-semibold">PLAN/EXECUTE</span> safety built in.
          </P>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link to="/install" className="notion-btn notion-btn-primary">Install in 30s →</Link>
            <a href="https://github.com/simpletoolsindia/ai-coder" target="_blank" rel="noreferrer" className="notion-btn">View on GitHub</a>
            <Link to="/features" className="notion-btn">All features</Link>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Pill>React-based TUI</Pill>
            <Pill>PLAN/EXECUTE</Pill>
            <Pill>MCP</Pill>
            <Pill>Sub-agents</Pill>
            <Pill>Auto-compact</Pill>
            <Pill>Cross-platform</Pill>
          </div>
        </div>
        <div>
          <HeroTerminal />
        </div>
      </div>

      <div className="mt-20">
        <h2 className="notion-eyebrow">Why AI By</h2>
        <h3 className="notion-h2 mt-1 mb-6">Built for real work, not demos.</h3>
        <Grid cols={3}>
          <Card title="Safe by default" icon="🛡️">
            PLAN mode is read-only. EXECUTE mode is opt-in. Every tool call is
            retried, validated, and permission-checked before it runs.
          </Card>
          <Card title="Lazy plugins" icon="🧩">
            Memory, MCP, web search, sub-agents — every feature is a plugin
            that loads only when the request actually needs it.
          </Card>
          <Card title="100% reliable" icon="🔁">
            Schema validation, retries on transient errors, idempotency
            cache, loop detection, completion verification, auto-retry.
          </Card>
          <Card title="Self-improving" icon="📚">
            Writes <code>AGENT.md</code> with the patterns it sees in your
            work, so the next session starts smarter.
          </Card>
          <Card title="Cross-platform" icon="🪟">
            One installer for macOS, Linux, Windows. Node.js 20+ is installed
            automatically if missing.
          </Card>
          <Card title="OpenAI-compatible" icon="🔌">
            Works with OpenAI, Anthropic, Gemini, Ollama, LM Studio, or any
            custom endpoint. <code>/login</code> walks you through it.
          </Card>
        </Grid>
      </div>

      <div className="mt-20">
        <h2 className="notion-eyebrow">Install</h2>
        <h3 className="notion-h2 mt-1 mb-6">One command, any OS.</h3>
        <div className="grid md:grid-cols-3 gap-4">
          <Card title="macOS · Linux · WSL" icon="🐚">
            <Code lang="bash">{`curl -fsSL https://raw.githubusercontent.com/simpletoolsindia/ai-coder/main/install.sh | bash`}</Code>
          </Card>
          <Card title="Windows PowerShell" icon="🪟">
            <Code lang="powershell">{`iwr -useb https://raw.githubusercontent.com/simpletoolsindia/ai-coder/main/install.ps1 | iex`}</Code>
          </Card>
          <Card title="npm (any platform)" icon="📦">
            <Code lang="bash">{`npm install -g ai-by`}</Code>
          </Card>
        </div>
        <div className="mt-6">
          <Callout tone="info">
            <span>
              After install, run <code className="not-prose">ai-coder</code>, then <code className="not-prose">/login</code> to configure a provider.
              See the <Link className="notion-link" to="/install">Install page</Link> for the full walkthrough.
            </span>
          </Callout>
        </div>
      </div>
    </div>
  );
}
