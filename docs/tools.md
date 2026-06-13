# Tools

Tools are loaded lazily. The core ships with a few built-in tools; plugins can add their own.

## Built-in tools

| id            | Plugin       | Description                            |
|---------------|--------------|----------------------------------------|
| `fs.read`     | core-tools   | Read a file                            |
| `fs.write`    | core-tools   | Write a file                           |
| `fs.edit`     | core-tools   | Replace a substring                    |
| `fs.delete`   | core-tools   | Delete a file or directory             |
| `fs.rename`   | core-tools   | Move / rename                          |
| `fs.list`     | core-tools   | List a directory                       |
| `search.glob` | core-tools   | Find files by glob                     |
| `search.grep` | core-tools   | Grep files for a literal string        |
| `terminal.run`| core-tools   | Run a shell command                    |
| `memory.*`    | memory       | Add / search / list / remove memory    |
| `context.*`   | context      | Project map and token counter          |
| `todo.*`      | todo         | Todo list management                   |
| `web.search`  | web-search   | SearXNG web search                     |
| `web.fetch`   | web-search   | Fetch a URL                            |
| `mcp.list`    | mcp          | List MCP tools                         |
| `mcp.<srv>.<t>`| mcp         | Dynamically generated per-server tools |
| `subagent.run`| subagents    | Delegate to a sub-agent                |

## Enable / disable

```text
/tools                              → list tools
/tools disable fs.delete            → disable
/tools enable fs.delete             → enable
```

Disabled tools cannot be invoked even if the planner selects them.

## Permissions

Every tool invocation passes through the permission engine. Rules can allow, deny, or prompt per tool id or glob pattern:

```json
{
  "default": "ask",
  "rules": [
    { "pattern": "fs.*", "action": "allow" },
    { "pattern": "terminal.run", "action": "prompt" }
  ]
}
```
