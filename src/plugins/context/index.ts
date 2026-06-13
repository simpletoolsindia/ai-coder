import { promises as fs } from 'node:fs';
import { resolve } from 'node:path';
import { glob } from 'glob';
import type { Json, Plugin, Tool, ToolExecutionContext, ToolResult } from '../../core/types.js';

interface ProjectEntry {
  path: string;
  bytes: number;
  tokens: number;
  preview: string;
}

async function buildProjectMap(root: string, maxFiles = 500): Promise<ProjectEntry[]> {
  const files = await glob('**/*', {
    cwd: root,
    nodir: true,
    dot: false,
    ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/coverage/**', '**/.next/**', '**/build/**'],
    absolute: true,
  });
  const out: ProjectEntry[] = [];
  for (const f of files.slice(0, maxFiles)) {
    let stat;
    try {
      stat = await fs.stat(f);
    } catch {
      continue;
    }
    if (stat.size > 1_000_000) continue;
    let content: string;
    try {
      content = await fs.readFile(f, 'utf-8');
    } catch {
      continue;
    }
    out.push({
      path: f,
      bytes: stat.size,
      tokens: estimateTokens(content),
      preview: content.split('\n').slice(0, 3).join('\n'),
    });
  }
  return out;
}

function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

const projectMapTool: Tool = {
  definition: {
    id: 'context.project-map',
    name: 'Build Project Map',
    description: 'Build a project map with file sizes and token estimates.',
    category: 'context',
    pluginId: 'context',
    parameters: {
      type: 'object',
      properties: {
        cwd: { type: 'string' },
        maxFiles: { type: 'integer', default: 500 },
      },
    },
    keywords: ['project', 'map', 'structure', 'overview', 'tree', 'files', 'tokens'],
  },
  async execute(args: Json, ctx: ToolExecutionContext): Promise<ToolResult> {
    const a = args as { cwd?: string; maxFiles?: number };
    const root = a.cwd ? resolve(ctx.cwd, a.cwd) : ctx.cwd;
    const entries = await buildProjectMap(root, a.maxFiles ?? 500);
    const totalTokens = entries.reduce((s, e) => s + e.tokens, 0);
    return { ok: true, data: { root, entries, totalTokens, count: entries.length } };
  },
};

const tokenCountTool: Tool = {
  definition: {
    id: 'context.tokens',
    name: 'Token Counter',
    description: 'Estimate the token count of a string using a 4-chars-per-token heuristic.',
    category: 'context',
    pluginId: 'context',
    parameters: {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text'],
    },
    keywords: ['token', 'count', 'estimate', 'length'],
  },
  async execute(args: Json): Promise<ToolResult> {
    const a = args as { text?: string };
    if (typeof a.text !== 'string') return { ok: false, error: 'text is required' };
    return { ok: true, data: { tokens: estimateTokens(a.text), characters: a.text.length } };
  },
};

export const contextPlugin: Plugin = {
  manifest: {
    id: 'context',
    version: '1.0.0',
    description: 'Project context: project map and token estimation.',
    tools: ['context.project-map', 'context.tokens'],
    lazy: true,
    enabled: true,
    triggers: ['project', 'map', 'context', 'overview', 'tokens', 'structure'],
    tags: ['context', 'analysis'],
  },
  async setup(ctx) {
    const tools = [projectMapTool, tokenCountTool];
    for (const t of tools) {
      if (!ctx.tools.has(t.definition.id)) ctx.tools.register(t);
    }
    return { tools };
  },
  async shutdown() {
    /* no-op */
  },
};

export const __contextTesting = { estimateTokens, buildProjectMap };
