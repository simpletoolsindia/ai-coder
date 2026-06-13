import { spawn } from 'node:child_process';
import type { Json, Tool, ToolExecutionContext, ToolResult } from '../../core/types.js';

export interface TerminalToolOptions {
  /** Max time a single command can run (ms) */
  defaultTimeoutMs?: number;
  /** Max output size in bytes */
  maxOutputBytes?: number;
  /** Blocked commands (matched by first token) */
  blocked?: string[];
}

const DEFAULT_BLOCKED = ['rm -rf /', 'sudo rm', ':(){:|:&};:'];

async function runCommand(args: Json, ctx: ToolExecutionContext): Promise<ToolResult> {
  const a = args as { command?: string; cwd?: string; timeoutMs?: number; env?: Record<string, string> };
  if (!a.command) return { ok: false, error: 'command is required' };
  if (DEFAULT_BLOCKED.some((b) => a.command?.includes(b))) {
    return { ok: false, error: 'Refusing to run blocked command' };
  }
  return new Promise((resolvePromise) => {
    const child = spawn(a.command as string, {
      cwd: a.cwd ?? ctx.cwd,
      shell: true,
      env: { ...process.env, ...(a.env ?? {}) },
    });
    let stdout = '';
    let stderr = '';
    const max = 200_000;
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
    }, a.timeoutMs ?? 30_000);
    child.stdout.on('data', (chunk: Buffer) => {
      if (stdout.length < max) stdout += chunk.toString('utf-8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length < max) stderr += chunk.toString('utf-8');
    });
    child.on('error', (err) => {
      clearTimeout(timeout);
      resolvePromise({ ok: false, error: err.message });
    });
    child.on('close', (code) => {
      clearTimeout(timeout);
      resolvePromise({
        ok: code === 0,
        data: { code, stdout, stderr },
        error: code === 0 ? undefined : `Command exited with code ${code}`,
      });
    });
    ctx.signal?.addEventListener('abort', () => {
      child.kill('SIGTERM');
    });
  });
}

export const terminalRunTool: Tool = {
  definition: {
    id: 'terminal.run',
    name: 'Run Command',
    description: 'Run a shell command and capture stdout / stderr / exit code.',
    category: 'terminal',
    pluginId: 'core',
    dangerous: true,
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Shell command to run' },
        cwd: { type: 'string' },
        timeoutMs: { type: 'integer', default: 30000 },
        env: { type: 'object', additionalProperties: { type: 'string' } },
      },
      required: ['command'],
    },
    keywords: ['run', 'exec', 'shell', 'bash', 'sh', 'command', 'terminal', 'cli'],
  },
  execute: runCommand,
};

export const terminalTools: Tool[] = [terminalRunTool];

export const __terminalTesting = { DEFAULT_BLOCKED };
