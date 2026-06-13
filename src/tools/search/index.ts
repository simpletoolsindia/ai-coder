import { promises as fs } from 'node:fs';
import { resolve } from 'node:path';
import { glob } from 'glob';
import type { Json, Tool, ToolExecutionContext, ToolResult } from '../../core/types.js';

interface GlobResult {
  matches: string[];
  count: number;
}

async function globTool(args: Json, ctx: ToolExecutionContext): Promise<ToolResult> {
  const a = args as { pattern?: string; cwd?: string; ignore?: string[]; maxResults?: number };
  if (!a.pattern) return { ok: false, error: 'pattern is required' };
  const cwd = a.cwd ? resolve(ctx.cwd, a.cwd) : ctx.cwd;
  const matches = await glob(a.pattern, {
    cwd,
    nodir: false,
    dot: false,
    ignore: a.ignore ?? ['**/node_modules/**', '**/.git/**'],
    absolute: false,
  });
  const max = a.maxResults ?? 200;
  const truncated = matches.slice(0, max);
  const result: GlobResult = { matches: truncated, count: matches.length };
  return { ok: true, data: result };
}

interface GrepMatch {
  path: string;
  line: number;
  text: string;
}

async function grepTool(args: Json, ctx: ToolExecutionContext): Promise<ToolResult> {
  const a = args as {
    pattern?: string;
    include?: string;
    cwd?: string;
    maxResults?: number;
    caseSensitive?: boolean;
  };
  if (!a.pattern) return { ok: false, error: 'pattern is required' };
  const cwd = a.cwd ? resolve(ctx.cwd, a.cwd) : ctx.cwd;
  const max = a.maxResults ?? 200;
  const matches: GrepMatch[] = [];
  const files = await glob(a.include ?? '**/*', {
    cwd,
    nodir: true,
    ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**'],
    absolute: true,
  });
  const re = new RegExp(escapeRegExp(a.pattern), a.caseSensitive ? '' : 'i');
  for (const file of files) {
    if (matches.length >= max) break;
    let stat;
    try {
      stat = await fs.stat(file);
    } catch {
      continue;
    }
    if (stat.size > 1_000_000) continue;
    let content: string;
    try {
      content = await fs.readFile(file, 'utf-8');
    } catch {
      continue;
    }
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (matches.length >= max) break;
      const text = lines[i] ?? '';
      if (re.test(text)) {
        matches.push({ path: file, line: i + 1, text });
      }
    }
  }
  return { ok: true, data: { matches, count: matches.length } };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const searchGlobTool: Tool = {
  definition: {
    id: 'search.glob',
    name: 'Glob Search',
    description: 'Find files matching a glob pattern.',
    category: 'search',
    pluginId: 'core',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Glob pattern, e.g. "src/**/*.ts"' },
        cwd: { type: 'string' },
        ignore: { type: 'array', items: { type: 'string' } },
        maxResults: { type: 'integer', default: 200 },
      },
      required: ['pattern'],
    },
    keywords: ['glob', 'files', 'find', 'match', 'pattern'],
  },
  execute: globTool,
};

export const searchGrepTool: Tool = {
  definition: {
    id: 'search.grep',
    name: 'Grep Search',
    description: 'Search for a literal string in files. Returns matching lines with file paths.',
    category: 'search',
    pluginId: 'core',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string' },
        include: { type: 'string', description: 'Glob for files to include' },
        cwd: { type: 'string' },
        maxResults: { type: 'integer', default: 200 },
        caseSensitive: { type: 'boolean', default: false },
      },
      required: ['pattern'],
    },
    keywords: ['grep', 'search', 'find', 'content', 'text', 'string'],
  },
  execute: grepTool,
};

export const searchTools: Tool[] = [searchGlobTool, searchGrepTool];
