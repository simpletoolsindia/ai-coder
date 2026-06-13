import type { Json, Tool, ToolExecutionContext, ToolResult } from '../../core/types.js';
import { execShell } from '../../core/os.js';

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
  const { code, stdout, stderr } = await execShell(a.command, {
    cwd: a.cwd ?? ctx.cwd,
    env: a.env,
    timeoutMs: a.timeoutMs ?? 30_000,
    signal: ctx.signal,
  });
  return {
    ok: code === 0,
    data: { code, stdout, stderr },
    error: code === 0 ? undefined : `Command exited with code ${code}`,
  };
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

/**
 * Batch runner: takes an array of commands and runs them sequentially,
 * stopping on the first non-zero exit. Returns a compact array result
 * so the LLM only has to make one tool call instead of N.
 */
async function runBatch(args: Json, ctx: ToolExecutionContext): Promise<ToolResult> {
  const a = args as { commands?: string[]; cwd?: string; stopOnError?: boolean };
  if (!Array.isArray(a.commands) || a.commands.length === 0) {
    return { ok: false, error: 'commands must be a non-empty array' };
  }
  const stop = a.stopOnError ?? true;
  const results: { command: string; code: number; stdout: string; stderr: string }[] = [];
  for (const cmd of a.commands) {
    const r = await terminalRunTool.execute({ command: cmd, cwd: a.cwd } as Json, ctx);
    const data = (r.data ?? { code: -1, stdout: '', stderr: '' }) as { code: number; stdout: string; stderr: string };
    results.push({ command: cmd, code: data.code, stdout: data.stdout, stderr: data.stderr });
    if (stop && !r.ok) break;
  }
  return { ok: true, data: { results, count: results.length } };
}

const terminalBatchTool: Tool = {
  definition: {
    id: 'terminal.batch',
    name: 'Run Commands (Batch)',
    description:
      'Run multiple shell commands sequentially in a single tool call. ' +
      'Stops on the first failure unless stopOnError is false. ' +
      'Prefer this over repeated terminal.run calls to reduce round-trips.',
    category: 'terminal',
    pluginId: 'core',
    dangerous: true,
    parameters: {
      type: 'object',
      properties: {
        commands: { type: 'array', items: { type: 'string' } },
        cwd: { type: 'string' },
        stopOnError: { type: 'boolean', default: true },
      },
      required: ['commands'],
    },
    keywords: ['batch', 'multi', 'sequence', 'pipeline', 'commands'],
  },
  execute: runBatch,
};

export const terminalTools: Tool[] = [terminalRunTool, terminalBatchTool];

export const __terminalTesting = { DEFAULT_BLOCKED };
