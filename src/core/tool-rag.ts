/**
 * Tool RAG: pick a small, highly-relevant subset of tools to expose to the
 * LLM for a given request, instead of dumping every registered tool into
 * the prompt. This keeps the system prompt small and the tool selection
 * accurate.
 */
import type { Tool, ToolDefinition } from './types.js';

export interface ToolIndexEntry {
  id: string;
  description: string;
  category: string;
  keywords: string[];
  embedding: number[] | null;
}

export interface ToolRagOptions {
  /** Maximum number of tools to expose. Default 8. */
  maxTools?: number;
  /** Minimum score to include. Default 0. */
  minScore?: number;
  /** Always include these tool ids even if they score low. */
  alwaysInclude?: string[];
}

export class ToolRag {
  private entries = new Map<string, ToolIndexEntry>();
  private options: Required<ToolRagOptions>;

  constructor(options: ToolRagOptions = {}) {
    this.options = {
      maxTools: options.maxTools ?? 8,
      minScore: options.minScore ?? 1,
      alwaysInclude: options.alwaysInclude ?? [],
    };
  }

  build(tools: Tool[]): void {
    this.entries.clear();
    for (const t of tools) {
      const tokens = (t.definition.keywords ?? []).concat([
        t.definition.id,
        t.definition.name,
        t.definition.category,
        ...t.definition.description.toLowerCase().split(/\s+/).filter((w) => w.length > 3),
      ]);
      this.entries.set(t.definition.id, {
        id: t.definition.id,
        description: t.definition.description,
        category: t.definition.category,
        keywords: Array.from(new Set(tokens.map((k) => k.toLowerCase()))),
        embedding: null,
      });
    }
  }

  select(request: string): ToolDefinition[] {
    const tokens = tokenize(request);
    const scores = new Map<string, number>();
    for (const e of this.entries.values()) {
      let s = 0;
      for (const tok of tokens) {
        if (e.id.toLowerCase().includes(tok)) s += 3;
        if (e.description.toLowerCase().includes(tok)) s += 2;
        if (e.category.toLowerCase() === tok) s += 2;
        if (e.keywords.some((k) => k.includes(tok) || tok.includes(k))) s += 1;
      }
      if (s >= this.options.minScore) scores.set(e.id, s);
    }
    // Always-include
    for (const id of this.options.alwaysInclude) {
      if (this.entries.has(id) && !scores.has(id)) scores.set(id, 0);
    }
    const ranked = Array.from(scores.entries()).sort((a, b) => b[1] - a[1]);
    const top = ranked.slice(0, this.options.maxTools).map(([id]) => id);
    return top
      .map((id) => Array.from(this.entries.values()).find((e) => e.id === id))
      .filter((e): e is ToolIndexEntry => Boolean(e))
      .map((e) => this.toDefinition(e))
      .filter((d): d is ToolDefinition => Boolean(d));
  }

  private toDefinition(entry: ToolIndexEntry): ToolDefinition | null {
    // Look up the live tool definition by walking the registered tools
    // indirectly: we just return a stub ToolDefinition with enough info
    // for the planner. The full execution still uses the live tool from
    // the ToolRegistry.
    return {
      id: entry.id,
      name: entry.id,
      description: entry.description,
      category: entry.category as ToolDefinition['category'],
      pluginId: 'core',
      parameters: { type: 'object', properties: {}, additionalProperties: true },
    };
  }
}

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9_\- ]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

export const __toolRagTesting = { ToolRag, tokenize };
