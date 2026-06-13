# AI By

> A production-grade, plugin-first coding agent. The core stays minimal; everything else is a plugin, loaded only when needed.

## Features

- **Plugin-first architecture** – every feature is a plugin with a manifest
- **Lazy loading** – nothing loads until a request needs it
- **OpenAI-compatible** – works with OpenAI, Anthropic, Gemini, Ollama, LM Studio, and any custom endpoint
- **MCP** – Model Context Protocol adapter for stdio / in-process servers
- **SearXNG web search** – opt-in web access with configurable instance
- **Persistent memory**, project maps, todo lists, sub-agents
- **Comprehensive testing** – unit, integration, E2E, performance

## Quick start

```bash
npm install
npm run build
node dist/cli.js
```

In the REPL:

```text
/login openai openai https://api.openai.com/v1 sk-... gpt-4o
```

## Commands

- `/help` – list commands
- `/login <id> <kind> [baseUrl] [apiKey] [model]` – configure a provider
- `/providers` – list providers
- `/use <id>` – set the active provider
- `/settings [section] [key=value]...` – view / update settings
- `/extensions [enable|disable|info] <id>` – manage plugins
- `/tools [enable|disable] <id>` – manage tools
- `/clear` – clear the screen
- `/exit` – exit

## Scripts

```bash
npm test                # all tests
npm run test:unit
npm run test:integration
npm run test:e2e
npm run test:perf
npm run test:coverage
npm run lint
npm run typecheck
npm run validate:manifests
```

## License

MIT
