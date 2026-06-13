# AI By

> A production-grade, plugin-first coding agent. The core stays minimal; everything else is a plugin, loaded only when needed.

AI By helps you generate, debug, refactor, and maintain code. It is designed to be:

- **Modular** – every feature is a plugin with a manifest
- **Lazy** – nothing loads until a request actually needs it
- **Configurable** – users control providers, plugins, tools, and permissions
- **OpenAI-compatible** – works with any OpenAI-compatible endpoint out of the box
- **Tested** – unit, integration, E2E and performance tests are first-class

**📖 Full documentation:** **<https://simpletoolsindia.github.io/ai-coder/>**

---

## 🚀 Single-line installation

The installer detects your OS, installs Node.js 20+ if missing, then installs AI By globally.

### macOS / Linux / WSL

```bash
curl -fsSL https://raw.githubusercontent.com/simpletoolsindia/ai-coder/main/install.sh | bash
```

### Windows (PowerShell)

```powershell
iwr -useb https://raw.githubusercontent.com/simpletoolsindia/ai-coder/main/install.ps1 | iex
```

### npm (any platform, Node already installed)

```bash
npm install -g ai-by
```

After install:

```bash
ai-by
```

---

## Quick start (from source)

```bash
git clone https://github.com/simpletoolsindia/ai-coder.git
cd ai-coder
npm install
npm run build
npm run dev

# in the REPL
/login openai openai https://api.openai.com/v1 sk-... gpt-4o
```

Or in batch / piped mode:

```bash
echo "/providers" | npm run dev
```

---

## Architecture

```
AI By
├── Core                  (always loaded, knows nothing about specific features)
│   ├── EventBus
│   ├── DI Container
│   ├── Settings Manager
│   ├── Command Registry
│   ├── Tool Registry / Resolver
│   ├── Permission Engine
│   ├── Plugin Manager    (manifest-driven, lazy)
│   ├── Provider Manager  (OpenAI-compatible by default)
│   ├── Planner           (with LoopGuard and CompletionCheck)
│   ├── Prompt Builder    (2-line OS meta + supported commands always included)
│   ├── Context Compressor(adaptive, auto-compact at 95% utilization)
│   ├── Mode Controller   (PLAN / EXECUTE)
│   ├── Tool RAG          (dynamic tool selection per request)
│   ├── Resilient Invoke  (retries, validation, idempotency)
│   ├── Learning Store    (writes AGENT.md)
│   └── Status Display    (emoji + progress bar, in-place TTY)
│
├── Built-in tools        (lazy; loaded on demand)
│   ├── Filesystem        (read / write / edit / delete / rename / list)
│   ├── Search            (glob / grep)
│   ├── Terminal          (run / batch)
│   └── Git               (diff / status / log)
│
└── Plugins               (lazy; loaded only when triggered)
    ├── memory            (long-term persistent memory)
    ├── context           (project map, token counter)
    ├── todo              (lightweight todo list)
    ├── web-search        (SearXNG + URL fetch)
    ├── mcp               (Model Context Protocol adapter)
    └── subagents         (delegate to focused sub-agents)
```

### Plugin manifest

Every plugin exposes a manifest. The core only reads the manifest; implementation is loaded on demand:

```ts
{
  id: "memory",
  version: "1.0.0",
  description: "Long-term persistent memory.",
  lazy: true,
  enabled: true,
  triggers: ["remember", "memory", "recall"],
  tags: ["memory", "persistence"],
  tools: ["memory.add", "memory.search"]
}
```

### Lazy loading

- The core does not import any plugin at startup
- When the user issues a request, the planner asks the plugin manager for plugins matching the request's tokens and tags
- Only matching plugins are loaded
- Built-in tools (filesystem, search, terminal, git) are also lazy

---

## CLI commands

| Command      | Description                                                |
|--------------|------------------------------------------------------------|
| `/help`      | List all available commands                                |
| `/login`     | Configure a new provider (OpenAI-compatible)               |
| `/providers` | List configured providers                                  |
| `/use`       | Set the active provider                                    |
| `/settings`  | View or update settings                                    |
| `/extensions`| List, enable, disable, inspect plugins                     |
| `/tools`     | List, enable, disable tools                                |
| `/mode`      | View or set the agent mode (plan / execute / toggle)        |
| `/compact`   | Compact the conversation context                           |
| `/doctor`    | Run runtime health checks (Node, providers, plugins, tools) |
| `/clear`     | Clear the screen                                           |
| `/exit`      | Exit AI By                                                 |

**Tab** in the REPL toggles between **PLAN** (read-only) and **EXECUTE** (full) modes.

### `/login` examples

```text
/login openai openai https://api.openai.com/v1 sk-xxx gpt-4o
/login local ollama
/login anthropic openai-compatible https://api.anthropic.com sk-xxx claude-3-5-sonnet
/login lmstudio openai-compatible http://localhost:1234/v1
```

### Settings sections

```text
/settings general              → shows the general block
/settings general theme=dark   → updates one key
/settings search searxngUrl=https://searxng.example.com
/settings tools fs.delete.enabled=false
```

### Status UI

The REPL shows a live status line that updates in place:

```
💭 thinking      ▰▰▰▰▰▰▰▰  step 1/8
✏️ writing       ▰▰▰▰▰▰▰▰  package.json
📖 reading       ▰▰▰▰▰▰▰▰  README.md
✅ done in 4 step(s)
```

---

## Programmatic use

```ts
import { Runtime } from 'ai-by';

const runtime = new Runtime();
await runtime.initialize();
runtime.providers.register({ id: 'main', kind: 'openai-compatible', name: 'main', baseUrl: '...', apiKey: '...', defaultModel: 'gpt-4o' });
const result = await runtime.run('Create a TypeScript function that adds two numbers');
console.log(result.text);
```

You can also use the lower-level building blocks individually:

```ts
import { EventBus, Container, ToolRegistry, PermissionEngine, PluginManager, PromptBuilder, ContextCompressor, ProviderManager, Planner, ModeController, StatusDisplay, ToolRag, LoopGuard, LearningStore } from 'ai-by';
```

---

## Configuration files

```text
config/
├── settings.json    # general, plugins, tools, permissions, memory, search
├── providers.json   # provider list and active provider
├── plugins.json     # (auto-generated by /extensions)
├── tools.json       # (auto-generated by /tools)
├── permissions.json
├── memory.json      # persistent memory entries
└── search.json
```

All configuration files are JSON-validated by Zod schemas. Invalid values fail loudly at load time.

`general.defaultProvider` and `general.defaultModel` are auto-persisted after every successful chat and auto-restored on the next launch.

---

## Adding your own plugin

Create a file under `src/plugins/<id>/index.ts`:

```ts
import type { Plugin, Tool } from '../../core/types.js';

const myTool: Tool = {
  definition: {
    id: 'myplugin.greet',
    name: 'Greet',
    description: 'Greets the user',
    category: 'misc',
    pluginId: 'myplugin',
    parameters: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    keywords: ['greet', 'hello', 'say hi'],
  },
  async execute(args, ctx) {
    const a = args as { name: string };
    return { ok: true, data: { message: `Hello, ${a.name}!` } };
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
  async shutdown() {
    /* cleanup */
  },
};
```

Register it in the runtime:

```ts
import { myPlugin } from './plugins/myplugin/index.js';
runtime.plugins.registerManifest(myPlugin.manifest, { source: 'memory', plugin: myPlugin });
```

---

## Testing

```bash
npm test                # all tests
npm run test:unit       # unit only
npm run test:integration
npm run test:e2e
npm run test:perf
npm run test:coverage   # with coverage report
npm run lint
npm run typecheck
npm run validate:manifests
```

The test suite covers:

- Every core module with unit tests (target 90% line coverage)
- Plugin lifecycle, lazy loading, provider switching, tool resolution (integration)
- End-to-end "create project" workflow
- Performance smoke tests for startup, plugin load, context compression, tool resolution
- Mocked external services (no network calls in tests)

---

## Design principles

1. **The core must know nothing about specific features.** Memory, MCP, web search, sub-agents – all are plugins.
2. **Lazy loading everywhere.** No plugin loads until the planner or the user asks for it.
3. **Manifest-driven plugins.** The core only reads metadata; implementation is loaded later.
4. **Provider-agnostic.** OpenAI-compatible by default, with env-var-based configuration.
5. **Permissions and tool enablement are first-class.** Users control what the agent can do.
6. **Everything is testable.** Mocks for HTTP, providers, and MCP clients.
7. **Reliability is non-negotiable.** Every tool call is validated, retried on transient failure, de-duplicated via idempotency, gated by mode (PLAN vs EXECUTE), and verified by a loop guard + completion check before the agent exits.
8. **Self-improving.** The agent writes `AGENT.md` based on observed patterns and surfaces the most-used tools.

---

## Links

- **Documentation site:** <https://simpletoolsindia.github.io/ai-coder/>
- **GitHub repository:** <https://github.com/simpletoolsindia/ai-coder>
- **npm package:** <https://www.npmjs.com/package/ai-by>
- **Issues:** <https://github.com/simpletoolsindia/ai-coder/issues>
- **One-line install:** `curl -fsSL https://raw.githubusercontent.com/simpletoolsindia/ai-coder/main/install.sh | bash`

---

## License

MIT
