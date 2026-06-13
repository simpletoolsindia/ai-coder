import { promises as fs } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';
import type { Json, Plugin, Tool, ToolExecutionContext, ToolResult } from '../../core/types.js';

export interface MemoryEntry {
  id: string;
  content: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

const MemoryFileSchema = z.object({
  entries: z.array(
    z.object({
      id: z.string(),
      content: z.string(),
      tags: z.array(z.string()).default([]),
      createdAt: z.number(),
      updatedAt: z.number(),
    }),
  ),
});

export interface MemoryStoreOptions {
  persistPath: string;
  maxEntries: number;
  logger?: { info: (m: string) => void; warn: (m: string) => void; error: (m: string) => void };
}

export class MemoryStore {
  private entries: MemoryEntry[] = [];
  private options: MemoryStoreOptions;
  private loaded = false;

  constructor(options: MemoryStoreOptions) {
    this.options = options;
  }

  async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.options.persistPath, 'utf-8');
      const parsed = MemoryFileSchema.parse(JSON.parse(raw));
      this.entries = parsed.entries;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.options.logger?.warn(`Memory load failed: ${(err as Error).message}`);
      }
      this.entries = [];
    }
    this.loaded = true;
  }

  async save(): Promise<void> {
    const path = this.options.persistPath;
    await fs.mkdir(dirname(path), { recursive: true });
    await fs.writeFile(path, JSON.stringify({ entries: this.entries }, null, 2), 'utf-8');
  }

  size(): number {
    return this.entries.length;
  }

  list(): MemoryEntry[] {
    return [...this.entries];
  }

  add(content: string, tags: string[] = []): MemoryEntry {
    const now = Date.now();
    const entry: MemoryEntry = {
      id: `mem_${now.toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      content,
      tags,
      createdAt: now,
      updatedAt: now,
    };
    this.entries.push(entry);
    if (this.entries.length > this.options.maxEntries) {
      this.entries.splice(0, this.entries.length - this.options.maxEntries);
    }
    return entry;
  }

  remove(id: string): boolean {
    const before = this.entries.length;
    this.entries = this.entries.filter((e) => e.id !== id);
    return this.entries.length < before;
  }

  search(query: string, limit = 10): MemoryEntry[] {
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return this.entries.slice(-limit);
    const scored = this.entries
      .map((e) => {
        const hay = `${e.content} ${e.tags.join(' ')}`.toLowerCase();
        let s = 0;
        for (const t of tokens) if (hay.includes(t)) s += 1;
        return { entry: e, score: s };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((x) => x.entry);
    return scored;
  }

  clear(): void {
    this.entries = [];
  }

  isLoaded(): boolean {
    return this.loaded;
  }
}

let globalStore: MemoryStore | undefined;

export function getMemoryStore(): MemoryStore {
  if (!globalStore) {
    globalStore = new MemoryStore({
      persistPath: resolve(process.cwd(), 'config', 'memory.json'),
      maxEntries: 1000,
    });
  }
  return globalStore;
}

export function setMemoryStore(store: MemoryStore): void {
  globalStore = store;
}

const memoryAddTool: Tool = {
  definition: {
    id: 'memory.add',
    name: 'Add Memory',
    description: 'Add a long-term memory entry.',
    category: 'memory',
    pluginId: 'memory',
    parameters: {
      type: 'object',
      properties: {
        content: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['content'],
    },
    keywords: ['memory', 'remember', 'save', 'note', 'store'],
  },
  async execute(args: Json, _ctx: ToolExecutionContext): Promise<ToolResult> {
    const a = args as { content?: string; tags?: string[] };
    if (!a.content) return { ok: false, error: 'content is required' };
    const store = getMemoryStore();
    const entry = store.add(a.content, a.tags ?? []);
    await store.save().catch(() => undefined);
    return { ok: true, data: entry };
  },
};

const memorySearchTool: Tool = {
  definition: {
    id: 'memory.search',
    name: 'Search Memory',
    description: 'Search long-term memory entries by content or tags.',
    category: 'memory',
    pluginId: 'memory',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        limit: { type: 'integer', default: 10 },
      },
      required: ['query'],
    },
    keywords: ['memory', 'search', 'recall', 'find', 'history'],
  },
  async execute(args: Json, _ctx: ToolExecutionContext): Promise<ToolResult> {
    const a = args as { query?: string; limit?: number };
    if (!a.query) return { ok: false, error: 'query is required' };
    const store = getMemoryStore();
    return { ok: true, data: { results: store.search(a.query, a.limit ?? 10) } };
  },
};

const memoryListTool: Tool = {
  definition: {
    id: 'memory.list',
    name: 'List Memory',
    description: 'List all memory entries, most recent first.',
    category: 'memory',
    pluginId: 'memory',
    parameters: { type: 'object', properties: { limit: { type: 'integer', default: 50 } } },
    keywords: ['memory', 'list', 'show', 'all'],
  },
  async execute(args: Json, _ctx: ToolExecutionContext): Promise<ToolResult> {
    const a = args as { limit?: number };
    const store = getMemoryStore();
    const all = store.list();
    return { ok: true, data: { entries: all.slice(-(a.limit ?? 50)) } };
  },
};

const memoryRemoveTool: Tool = {
  definition: {
    id: 'memory.remove',
    name: 'Remove Memory',
    description: 'Remove a memory entry by id.',
    category: 'memory',
    pluginId: 'memory',
    dangerous: true,
    parameters: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
    keywords: ['memory', 'remove', 'delete', 'forget'],
  },
  async execute(args: Json, _ctx: ToolExecutionContext): Promise<ToolResult> {
    const a = args as { id?: string };
    if (!a.id) return { ok: false, error: 'id is required' };
    const store = getMemoryStore();
    const ok = store.remove(a.id);
    if (ok) await store.save().catch(() => undefined);
    return { ok, data: { id: a.id, removed: ok } };
  },
};

export const memoryPlugin: Plugin = {
  manifest: {
    id: 'memory',
    version: '1.0.0',
    description: 'Long-term persistent memory across sessions.',
    tools: ['memory.add', 'memory.search', 'memory.list', 'memory.remove'],
    lazy: true,
    enabled: true,
    triggers: ['remember', 'memory', 'recall', 'forget', 'note'],
    tags: ['memory', 'persistence'],
  },
  async setup(ctx) {
    const store = getMemoryStore();
    const config = ctx.settings.get('memory');
    store['options'] = { ...store['options'], persistPath: config.persistPath, maxEntries: config.maxEntries };
    await store.load();
    ctx.events?.emit('plugin.memory.loaded', { count: store.size() });
    const tools = [memoryAddTool, memorySearchTool, memoryListTool, memoryRemoveTool];
    for (const t of tools) {
      if (!ctx.tools.has(t.definition.id)) ctx.tools.register(t);
    }
    return {
      tools,
      hooks: ['beforeRequest', 'afterRequest'],
    };
  },
  async shutdown() {
    const store = getMemoryStore();
    await store.save().catch(() => undefined);
  },
};
