import type { Plugin } from '../core/types.js';
import { memoryPlugin } from './memory/index.js';
import { contextPlugin } from './context/index.js';
import { todoPlugin } from './todo/index.js';
import { webSearchPlugin } from './web-search/index.js';
import { mcpPlugin } from './mcp/index.js';
import { subAgentsPlugin } from './subagents/index.js';

export const builtInPlugins: Plugin[] = [
  memoryPlugin,
  contextPlugin,
  todoPlugin,
  webSearchPlugin,
  mcpPlugin,
  subAgentsPlugin,
];

export { memoryPlugin } from './memory/index.js';
export { contextPlugin } from './context/index.js';
export { todoPlugin } from './todo/index.js';
export { webSearchPlugin } from './web-search/index.js';
export { mcpPlugin } from './mcp/index.js';
export { subAgentsPlugin } from './subagents/index.js';

export { getMemoryStore, setMemoryStore, MemoryStore } from './memory/index.js';
export { getTodoStore, setTodoStore, TodoStore } from './todo/index.js';
export type { TodoItem } from './todo/index.js';
export { __todoTesting } from './todo/index.js';
export { getSearchProvider, setSearchProvider, SearXNGProvider } from './web-search/index.js';
export { getMCPRegistry, setMCPRegistry, InProcessMCPClient, MCPClientRegistry } from './mcp/index.js';
export type { SubAgentSpec, SubAgentResult } from './subagents/index.js';
export { setSubAgentExecutor, getSubAgentExecutor } from './subagents/index.js';
