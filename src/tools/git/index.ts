import { spawn } from 'node:child_process';
import type { Json, Tool, ToolExecutionContext, ToolResult } from '../../core/types.js';

function run(cmd: string, cwd: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, { cwd, shell: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c: Buffer) => (stdout += c.toString('utf-8')));
    child.stderr.on('data', (c: Buffer) => (stderr += c.toString('utf-8')));
    child.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
}

async function diffTool(args: Json, ctx: ToolExecutionContext): Promise<ToolResult> {
  const a = args as {
    path?: string;
    staged?: boolean;
    fromRef?: string;
    toRef?: string;
    maxLines?: number;
  };
  const cwd = a.path ?? ctx.cwd;
  const max = a.maxLines ?? 2000;
  let cmd: string;
  if (a.fromRef && a.toRef) {
    cmd = `git diff ${a.fromRef}..${a.toRef} -- .`;
  } else if (a.staged) {
    cmd = `git diff --staged -- .`;
  } else {
    cmd = `git diff -- .`;
  }
  const { code, stdout, stderr } = await run(cmd, cwd);
  if (code !== 0) {
    // Not a git repo or git not installed — fall back to a noop message
    if (/not a git repository/i.test(stderr) || /git: command not found/i.test(stderr)) {
      return { ok: true, data: { git: false, message: stderr.trim() || 'git not available', diff: '' } };
    }
    return { ok: false, error: stderr || `git diff exited with code ${code}` };
  }
  const lines = stdout.split('\n');
  const truncated = lines.length > max ? `${lines.slice(0, max).join('\n')}\n... (${lines.length - max} more lines)` : stdout;
  return {
    ok: true,
    data: {
      git: true,
      diff: truncated,
      lineCount: lines.length,
      truncated: lines.length > max,
    },
  };
}

async function statusTool(args: Json, ctx: ToolExecutionContext): Promise<ToolResult> {
  const cwd = (args as { path?: string }).path ?? ctx.cwd;
  const { code, stdout, stderr } = await run('git status --short --branch', cwd);
  if (code !== 0) {
    return { ok: true, data: { git: false, message: stderr.trim() || 'git not available' } };
  }
  return { ok: true, data: { git: true, status: stdout } };
}

async function logTool(args: Json, ctx: ToolExecutionContext): Promise<ToolResult> {
  const a = args as { path?: string; limit?: number; oneline?: boolean };
  const cwd = a.path ?? ctx.cwd;
  const limit = a.limit ?? 20;
  const fmt = a.oneline === false ? 'medium' : 'oneline';
  const { code, stdout, stderr } = await run(`git log -n ${limit} --${fmt}`, cwd);
  if (code !== 0) {
    return { ok: true, data: { git: false, message: stderr.trim() || 'git not available' } };
  }
  return { ok: true, data: { git: true, log: stdout } };
}

export const gitDiffTool: Tool = {
  definition: {
    id: 'git.diff',
    name: 'Git Diff',
    description: 'Show what changed (working tree or staged). Read-only.',
    category: 'git',
    pluginId: 'core',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        staged: { type: 'boolean', default: false },
        fromRef: { type: 'string' },
        toRef: { type: 'string' },
        maxLines: { type: 'integer', default: 2000 },
      },
    },
    keywords: ['diff', 'changes', 'what changed', 'git diff', 'show changes'],
  },
  execute: diffTool,
};

export const gitStatusTool: Tool = {
  definition: {
    id: 'git.status',
    name: 'Git Status',
    description: 'Show working tree status. Read-only.',
    category: 'git',
    pluginId: 'core',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string' } },
    },
    keywords: ['status', 'git status', 'modified', 'untracked'],
  },
  execute: statusTool,
};

export const gitLogTool: Tool = {
  definition: {
    id: 'git.log',
    name: 'Git Log',
    description: 'Show recent commits. Read-only.',
    category: 'git',
    pluginId: 'core',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        limit: { type: 'integer', default: 20 },
        oneline: { type: 'boolean', default: true },
      },
    },
    keywords: ['log', 'history', 'commits', 'recent'],
  },
  execute: logTool,
};

export const gitTools: Tool[] = [gitDiffTool, gitStatusTool, gitLogTool];
