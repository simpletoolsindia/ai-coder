# Plugins

AI By is plugin-first. Every feature beyond the core is a plugin with a manifest.

## Manifest

```ts
{
  id: "memory",
  version: "1.0.0",
  description: "Long-term persistent memory.",
  lazy: true,                    // loaded on demand
  enabled: true,                 // toggled by the user
  triggers: ["remember", "recall"],
  tags: ["memory", "persistence"],
  tools: ["memory.add", "memory.search"],
  dependencies: []
}
```

The core only reads the manifest. The implementation is loaded the first time the planner or the user asks for the plugin.

## Triggers

`triggers` is a list of words that, when found in a user request, cause the plugin to be lazy-loaded automatically. Combine with `tags` for semantic matching.

## Built-in plugins

| id          | What it does                              |
|-------------|-------------------------------------------|
| `memory`    | Persistent long-term memory               |
| `context`   | Project map, token counter                |
| `todo`      | Lightweight todo list                     |
| `web-search`| SearXNG + URL fetch                       |
| `mcp`       | Model Context Protocol adapter            |
| `subagents` | Delegate to focused sub-agents             |
| `core-tools`| Built-in filesystem, search, terminal     |

## Writing a plugin

See `examples/hello-plugin/`.
