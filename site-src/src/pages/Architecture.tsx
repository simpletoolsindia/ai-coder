import { H1, P, Code, Callout, Pill } from '../components/ui';

export function Architecture() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <Pill color="green">Architecture</Pill>
      <H1>How it fits together</H1>
      <P>
        The core stays minimal. Everything else is a plugin, loaded only when needed. This
        page is the map of the codebase.
      </P>

      <h2 className="notion-h2 mt-10 mb-3">Layers</h2>
      <Code lang="text">{`AI By
├── Core (always loaded)
│   ├── EventBus               pub/sub
│   ├── DI Container           scoped services
│   ├── Settings Manager       Zod-validated JSON
│   ├── Command Registry       parse / dispatch
│   ├── Tool Registry / Resolver  intelligent tool selection
│   ├── Permission Engine      rule-based evaluation
│   ├── Plugin Manager         manifest-driven, lazy
│   ├── Provider Manager       OpenAI-compatible by default
│   ├── Planner                LoopGuard + CompletionCheck
│   ├── Prompt Builder         2-line OS meta + supported commands
│   ├── Context Compressor     auto-compact at 95% utilization
│   ├── Mode Controller        PLAN / EXECUTE
│   ├── Tool RAG               dynamic per-request tool selection
│   ├── Resilient Invoke       validation, retries, idempotency
│   ├── Learning Store         writes AGENT.md
│   └── Status Display         emoji + progress bar
│
├── Built-in tools (lazy)
│   ├── Filesystem  read / write / edit / delete / rename / list
│   ├── Search      glob / grep
│   ├── Terminal    run / batch
│   └── Git         diff / status / log
│
└── Plugins (lazy)
    ├── memory      long-term persistent memory
    ├── context     project map, token counter
    ├── todo        lightweight todo list
    ├── web-search  SearXNG + URL fetch
    ├── mcp         Model Context Protocol adapter
    └── subagents   delegate to focused sub-agents`}</Code>

      <h2 className="notion-h2 mt-12 mb-3">A request, end to end</h2>
      <ol className="list-decimal pl-5 space-y-2 text-ink-700 dark:text-ink-300">
        <li>User types a request in the TUI.</li>
        <li>The runtime asks the <strong>PluginManager</strong> for plugins matching the request's tokens.</li>
        <li>The <strong>ToolRag</strong> selects a small, relevant subset of tools for the system prompt.</li>
        <li>The <strong>Planner</strong> calls the active provider with that prompt + tool definitions.</li>
        <li>The provider returns either text or <code>tool_calls</code>.</li>
        <li>For each tool call, the <strong>ModeController</strong> checks the current mode; the <strong>PermissionEngine</strong> checks the rules; <strong>ResilientInvoke</strong> validates args, retries on failure, and caches idempotent calls.</li>
        <li>Tool results are appended and the loop continues. The <strong>LoopGuard</strong> detects repeated/oscillating/no-progress calls; the <strong>CompletionCheck</strong> verifies the agent actually finished the work before returning.</li>
        <li>On exit, the <strong>LearningStore</strong> records the interaction, refreshes <code>AGENT.md</code>, and persists the (provider, model) pair so the next launch auto-restores them.</li>
      </ol>

      <div className="mt-10">
        <Callout tone="info">
          <span>
            The core <span className="font-semibold">never</span> directly depends on memory, MCP, web search, or sub-agents. All of those are plugins.
            That's what makes the core testable in isolation and the agent easy to extend.
          </span>
        </Callout>
      </div>
    </div>
  );
}
