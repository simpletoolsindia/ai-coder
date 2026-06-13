import type { Json, Plugin, Tool, ToolDefinition, ToolExecutionContext, ToolResult } from '../../core/types.js';

export interface MCPServerConfig {
  id: string;
  /** Command to spawn (stdio transport) */
  command: string;
  args?: string[];
  env?: Record<string, string>;
  /** Disabled by default until user enables */
  enabled?: boolean;
}

export interface MCPToolDescriptor {
  name: string;
  description: string;
  inputSchema: unknown;
}

export interface MCPClient {
  listTools(): Promise<MCPToolDescriptor[]>;
  callTool(name: string, args: Json): Promise<Json>;
  close(): Promise<void>;
}

/**
 * Minimal in-process mock client. A real implementation would speak JSON-RPC
 * over stdio or HTTP. We expose the same interface so the plugin is
 * swappable.
 */
export class InProcessMCPClient implements MCPClient {
  private tools = new Map<string, { descriptor: MCPToolDescriptor; handler: (args: Json) => Promise<Json> }>();

  registerTool(descriptor: MCPToolDescriptor, handler: (args: Json) => Promise<Json>): void {
    this.tools.set(descriptor.name, { descriptor, handler });
  }

  async listTools(): Promise<MCPToolDescriptor[]> {
    return Array.from(this.tools.values()).map((t) => t.descriptor);
  }

  async callTool(name: string, args: Json): Promise<Json> {
    const t = this.tools.get(name);
    if (!t) throw new Error(`MCP tool "${name}" not found`);
    return t.handler(args);
  }

  async close(): Promise<void> {
    this.tools.clear();
  }
}

export class MCPClientRegistry {
  private clients = new Map<string, MCPClient>();
  register(id: string, client: MCPClient): void {
    this.clients.set(id, client);
  }
  unregister(id: string): boolean {
    return this.clients.delete(id);
  }
  get(id: string): MCPClient | undefined {
    return this.clients.get(id);
  }
  ids(): string[] {
    return Array.from(this.clients.keys());
  }
}

let globalRegistry: MCPClientRegistry | undefined;

export function getMCPRegistry(): MCPClientRegistry {
  if (!globalRegistry) globalRegistry = new MCPClientRegistry();
  return globalRegistry;
}

export function setMCPRegistry(r: MCPClientRegistry): void {
  globalRegistry = r;
}

function descriptorToToolDefinition(serverId: string, d: MCPToolDescriptor): ToolDefinition {
  return {
    id: `mcp.${serverId}.${d.name}`,
    name: d.name,
    description: d.description,
    category: 'mcp',
    pluginId: 'mcp',
    network: true,
    parameters:
      (d.inputSchema as ToolDefinition['parameters']) ?? {
        type: 'object',
        properties: {},
        additionalProperties: true,
      },
  };
}

async function listMCPTools(ctx: ToolExecutionContext): Promise<{ tools: ToolDefinition[] }> {
  const registry = getMCPRegistry();
  const tools: ToolDefinition[] = [];
  for (const id of registry.ids()) {
    const client = registry.get(id);
    if (!client) continue;
    try {
      const descs = await client.listTools();
      for (const d of descs) {
        tools.push(descriptorToToolDefinition(id, d));
      }
    } catch (err) {
      ctx.logger.warn(`Failed to list MCP tools for "${id}": ${(err as Error).message}`);
    }
  }
  return { tools };
}

const mcpListTool: Tool = {
  definition: {
    id: 'mcp.list',
    name: 'List MCP Tools',
    description: 'List all tools exposed by all registered MCP clients.',
    category: 'mcp',
    pluginId: 'mcp',
    parameters: { type: 'object', properties: {} },
    keywords: ['mcp', 'list', 'tools', 'server'],
  },
  async execute(_args: Json, ctx: ToolExecutionContext): Promise<ToolResult> {
    const { tools } = await listMCPTools(ctx);
    return { ok: true, data: { count: tools.length, tools } };
  },
};

const mcpCallToolFactory = (serverId: string, toolName: string): Tool => ({
  definition: {
    id: `mcp.${serverId}.${toolName}`,
    name: toolName,
    description: `MCP tool "${toolName}" from server "${serverId}".`,
    category: 'mcp',
    pluginId: 'mcp',
    network: true,
    parameters: { type: 'object', properties: {}, additionalProperties: true },
    keywords: ['mcp', serverId, toolName],
  },
  async execute(args: Json): Promise<ToolResult> {
    const client = getMCPRegistry().get(serverId);
    if (!client) return { ok: false, error: `MCP server "${serverId}" not found` };
    try {
      const data = await client.callTool(toolName, args);
      return { ok: true, data };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  },
});

export const mcpPlugin: Plugin = {
  manifest: {
    id: 'mcp',
    version: '1.0.0',
    description: 'Model Context Protocol integration (stdio servers, in-process clients).',
    tools: ['mcp.list'],
    lazy: true,
    enabled: false,
    triggers: ['mcp', 'playwright', 'browser', 'stdio', 'tool server'],
    tags: ['mcp', 'integration'],
  },
  async setup(ctx) {
    const tools: Tool[] = [mcpListTool];
    const registry = getMCPRegistry();
    for (const serverId of registry.ids()) {
      const client = registry.get(serverId);
      if (!client) continue;
      try {
        const descs = await client.listTools();
        for (const d of descs) {
          tools.push(mcpCallToolFactory(serverId, d.name));
        }
      } catch (err) {
        ctx.logger.warn?.(`MCP setup failed for "${serverId}": ${(err as Error).message}`);
      }
    }
    for (const t of tools) {
      if (!ctx.tools.has(t.definition.id)) ctx.tools.register(t);
    }
    return { tools };
  },
  async shutdown() {
    const registry = getMCPRegistry();
    for (const id of registry.ids()) {
      await registry.get(id)?.close().catch(() => undefined);
    }
  },
};

export const __mcpTesting = { InProcessMCPClient, MCPClientRegistry };
