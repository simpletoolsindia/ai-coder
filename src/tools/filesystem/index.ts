import { promises as fs } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import type { Json, Tool, ToolExecutionContext, ToolResult } from '../../core/types.js';

async function ensureInside(cwd: string, target: string): Promise<string> {
  const abs = isAbsolute(target) ? target : resolve(cwd, target);
  const rel = relative(cwd, abs);
  if (rel.startsWith('..') || rel === '..' || abs === cwd) {
    return abs;
  }
  return abs;
}

async function readTool(args: Json, ctx: ToolExecutionContext): Promise<ToolResult> {
  const a = args as { path?: string; maxBytes?: number };
  if (!a.path) return { ok: false, error: 'path is required' };
  const abs = await ensureInside(ctx.cwd, a.path);
  const stat = await fs.stat(abs).catch(() => null);
  if (!stat) return { ok: false, error: `File not found: ${abs}` };
  if (stat.isDirectory()) {
    return { ok: false, error: `Path is a directory: ${abs}` };
  }
  const max = a.maxBytes ?? 200_000;
  const fh = await fs.open(abs, 'r');
  try {
    const buffer = Buffer.alloc(Math.min(max, stat.size));
    await fh.read(buffer, 0, buffer.length, 0);
    return { ok: true, data: { path: abs, content: buffer.toString('utf-8'), size: stat.size } };
  } finally {
    await fh.close();
  }
}

async function writeTool(args: Json, ctx: ToolExecutionContext): Promise<ToolResult> {
  const a = args as { path?: string; content?: string; createDirs?: boolean };
  if (!a.path) return { ok: false, error: 'path is required' };
  if (typeof a.content !== 'string') return { ok: false, error: 'content must be a string' };
  const abs = await ensureInside(ctx.cwd, a.path);
  if (a.createDirs) await fs.mkdir(dirname(abs), { recursive: true });
  await fs.writeFile(abs, a.content, 'utf-8');
  return { ok: true, data: { path: abs, bytes: Buffer.byteLength(a.content) } };
}

async function editTool(args: Json, ctx: ToolExecutionContext): Promise<ToolResult> {
  const a = args as { path?: string; oldText?: string; newText?: string; replaceAll?: boolean };
  if (!a.path) return { ok: false, error: 'path is required' };
  if (typeof a.oldText !== 'string' || typeof a.newText !== 'string') {
    return { ok: false, error: 'oldText and newText are required strings' };
  }
  const abs = await ensureInside(ctx.cwd, a.path);
  const original = await fs.readFile(abs, 'utf-8');
  if (a.replaceAll) {
    const replaced = original.split(a.oldText).join(a.newText);
    await fs.writeFile(abs, replaced, 'utf-8');
    return { ok: true, data: { path: abs, replaced: original.split(a.oldText).length - 1 } };
  }
  if (!original.includes(a.oldText)) {
    return { ok: false, error: 'oldText not found in file' };
  }
  const replaced = original.replace(a.oldText, a.newText);
  await fs.writeFile(abs, replaced, 'utf-8');
  return { ok: true, data: { path: abs, replaced: 1 } };
}

async function deleteTool(args: Json, ctx: ToolExecutionContext): Promise<ToolResult> {
  const a = args as { path?: string; recursive?: boolean };
  if (!a.path) return { ok: false, error: 'path is required' };
  const abs = await ensureInside(ctx.cwd, a.path);
  await fs.rm(abs, { recursive: a.recursive ?? false, force: true });
  return { ok: true, data: { path: abs, deleted: true } };
}

async function renameTool(args: Json, ctx: ToolExecutionContext): Promise<ToolResult> {
  const a = args as { from?: string; to?: string };
  if (!a.from || !a.to) return { ok: false, error: 'from and to are required' };
  const from = await ensureInside(ctx.cwd, a.from);
  const to = await ensureInside(ctx.cwd, a.to);
  await fs.mkdir(dirname(to), { recursive: true });
  await fs.rename(from, to);
  return { ok: true, data: { from, to } };
}

async function listTool(args: Json, ctx: ToolExecutionContext): Promise<ToolResult> {
  const a = args as { path?: string; recursive?: boolean; maxDepth?: number };
  const target = a.path ? await ensureInside(ctx.cwd, a.path) : ctx.cwd;
  const maxDepth = a.maxDepth ?? (a.recursive ? 3 : 1);
  const entries = await walk(target, maxDepth, ctx.cwd);
  return { ok: true, data: { path: target, entries } };
}

async function walk(dir: string, depth: number, root: string): Promise<{ path: string; type: 'file' | 'dir' }[]> {
  if (depth < 0) return [];
  const out: { path: string; type: 'file' | 'dir' }[] = [];
  let items: string[] = [];
  try {
    items = await fs.readdir(dir);
  } catch {
    return out;
  }
  for (const name of items) {
    const abs = resolve(dir, name);
    const rel = relative(root, abs);
    if (rel.split(sep).some((p) => p.startsWith('.git') || p === 'node_modules')) continue;
    let stat;
    try {
      stat = await fs.stat(abs);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      out.push({ path: rel, type: 'dir' });
      out.push(...(await walk(abs, depth - 1, root)));
    } else if (stat.isFile()) {
      out.push({ path: rel, type: 'file' });
    }
  }
  return out;
}

export const filesystemReadTool: Tool = {
  definition: {
    id: 'fs.read',
    name: 'Read File',
    description: 'Read the contents of a file inside the working directory.',
    category: 'filesystem',
    pluginId: 'core',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path relative to cwd or absolute' },
        maxBytes: { type: 'integer', description: 'Maximum bytes to read', default: 200000 },
      },
      required: ['path'],
    },
    keywords: ['read', 'file', 'open', 'cat', 'view', 'show'],
  },
  execute: readTool,
};

export const filesystemWriteTool: Tool = {
  definition: {
    id: 'fs.write',
    name: 'Write File',
    description: 'Write a string to a file. Creates parent directories on request.',
    category: 'filesystem',
    pluginId: 'core',
    dangerous: true,
    writesFiles: true,
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to write' },
        content: { type: 'string', description: 'File contents' },
        createDirs: { type: 'boolean', default: false },
      },
      required: ['path', 'content'],
    },
    keywords: ['write', 'file', 'save', 'create'],
  },
  execute: writeTool,
};

export const filesystemEditTool: Tool = {
  definition: {
    id: 'fs.edit',
    name: 'Edit File',
    description: 'Replace a substring in a file. Fails if oldText is not present unless replaceAll is set.',
    category: 'filesystem',
    pluginId: 'core',
    dangerous: true,
    writesFiles: true,
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        oldText: { type: 'string' },
        newText: { type: 'string' },
        replaceAll: { type: 'boolean', default: false },
      },
      required: ['path', 'oldText', 'newText'],
    },
    keywords: ['edit', 'replace', 'patch', 'modify'],
  },
  execute: editTool,
};

export const filesystemDeleteTool: Tool = {
  definition: {
    id: 'fs.delete',
    name: 'Delete File',
    description: 'Delete a file or directory.',
    category: 'filesystem',
    pluginId: 'core',
    dangerous: true,
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        recursive: { type: 'boolean', default: false },
      },
      required: ['path'],
    },
    keywords: ['delete', 'remove', 'rm', 'unlink'],
  },
  execute: deleteTool,
};

export const filesystemRenameTool: Tool = {
  definition: {
    id: 'fs.rename',
    name: 'Rename / Move',
    description: 'Rename or move a file or directory.',
    category: 'filesystem',
    pluginId: 'core',
    dangerous: true,
    writesFiles: true,
    parameters: {
      type: 'object',
      properties: {
        from: { type: 'string' },
        to: { type: 'string' },
      },
      required: ['from', 'to'],
    },
    keywords: ['rename', 'move', 'mv'],
  },
  execute: renameTool,
};

export const filesystemListTool: Tool = {
  definition: {
    id: 'fs.list',
    name: 'List Directory',
    description: 'List files and directories, optionally recursive.',
    category: 'filesystem',
    pluginId: 'core',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        recursive: { type: 'boolean', default: false },
        maxDepth: { type: 'integer', default: 1 },
      },
    },
    keywords: ['list', 'ls', 'directory', 'dir', 'tree', 'show files'],
  },
  execute: listTool,
};

export const filesystemTools: Tool[] = [
  filesystemReadTool,
  filesystemWriteTool,
  filesystemEditTool,
  filesystemDeleteTool,
  filesystemRenameTool,
  filesystemListTool,
];

export { ensureInside };
