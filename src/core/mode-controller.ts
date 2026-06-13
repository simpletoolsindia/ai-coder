/**
 * Plan / Execute mode controller.
 *
 * In PLAN mode the agent may only use read-only tools (filesystem read,
 * search, web, memory read, bash read-only). In EXECUTE mode the full
 * tool set is available. The user toggles between modes (typically with
 * Tab in the REPL).
 */
import type { ToolDefinition } from './types.js';

/** Tools considered safe in plan mode (no filesystem or system mutations). */
const SAFE_TOOL_CATEGORIES: ReadonlySet<string> = new Set([
  'filesystem',
  'search',
  'web',
  'memory',
  'context',
  'todo',
  'mcp',
  'subagent',
  'misc',
]);

/** Tools that are always unsafe in plan mode regardless of category. */
const UNSAFE_TOOL_IDS: ReadonlySet<string> = new Set([
  'fs.write',
  'fs.edit',
  'fs.delete',
  'fs.rename',
  'terminal.exec',
  'todo.remove',
  'memory.remove',
]);

/** Shell command verbs that are read-only and safe to run in plan mode. */
const SAFE_BASH_VERBS: ReadonlySet<string> = new Set([
  'ls', 'cat', 'head', 'tail', 'less', 'more', 'echo', 'pwd', 'env', 'printenv',
  'which', 'where', 'type', 'whoami', 'id', 'date', 'uname', 'hostname',
  'df', 'du', 'free', 'ps', 'top', 'uptime', 'wc', 'stat', 'file',
  'find', 'grep', 'rg', 'awk', 'sed', 'sort', 'uniq', 'cut', 'tr',
  'diff', 'cmp', 'md5sum', 'sha256sum', 'sha1sum', 'xxd', 'od',
  'curl', 'wget', 'ping', 'nslookup', 'dig', 'traceroute', 'mtr',
  'git', 'log', 'man', 'tldr', 'help', 'info', 'tree', 'jq', 'yq',
  'tar', 'gzip', 'gunzip', 'zipinfo', 'unzip', 'lsof', 'ss', 'netstat',
]);

const UNSAFE_BASH_VERBS: ReadonlySet<string> = new Set([
  'rm', 'rmdir', 'mv', 'cp', 'mkdir', 'touch', 'chmod', 'chown', 'chgrp',
  'dd', 'mkfs', 'mount', 'umount', 'fdisk', 'parted',
  'kill', 'killall', 'pkill', 'shutdown', 'reboot', 'halt', 'poweroff',
  'systemctl', 'service', 'apt', 'apt-get', 'yum', 'dnf', 'pacman', 'brew', 'pip', 'npm', 'yarn', 'pnpm',
  'git',  // mostly safe but write operations must be blocked; checked below
  'sudo', 'su', 'doas',
  'mkfs', 'mkswap', 'swapon', 'swapoff',
  'iptables', 'firewall-cmd', 'ufw',
  'useradd', 'usermod', 'userdel', 'groupadd', 'groupmod', 'groupdel',
  'crontab', 'at', 'batch',
]);

const SAFE_GIT_SUBCOMMANDS: ReadonlySet<string> = new Set([
  'status', 'log', 'diff', 'show', 'branch', 'tag', 'remote', 'ls-files',
  'ls-tree', 'rev-parse', 'describe', 'shortlog', 'blame', 'grep',
  'config --get', 'help', 'version',
]);

export type AgentMode = 'plan' | 'execute';

export interface ModeChangeEvent {
  from: AgentMode;
  to: AgentMode;
  reason: 'user' | 'auto' | 'command';
}

export interface ModeGateDecision {
  allowed: boolean;
  reason: string;
}

export class ModeController {
  private current: AgentMode = 'plan';
  private listeners = new Set<(e: ModeChangeEvent) => void>();

  get mode(): AgentMode {
    return this.current;
  }

  isPlan(): boolean {
    return this.current === 'plan';
  }

  isExecute(): boolean {
    return this.current === 'execute';
  }

  setMode(next: AgentMode, reason: ModeChangeEvent['reason'] = 'user'): void {
    if (next === this.current) return;
    const from = this.current;
    this.current = next;
    const ev: ModeChangeEvent = { from, to: next, reason };
    for (const l of this.listeners) {
      try {
        l(ev);
      } catch {
        /* ignore */
      }
    }
  }

  toggle(): AgentMode {
    const next: AgentMode = this.current === 'plan' ? 'execute' : 'plan';
    this.setMode(next, 'user');
    return next;
  }

  onChange(listener: (e: ModeChangeEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Decide whether a tool may be invoked in the current mode. Plan mode
   * permits only safe tools and safe bash commands. Execute mode permits
   * everything.
   */
  evaluate(tool: ToolDefinition, args: Record<string, unknown> = {}): ModeGateDecision {
    if (this.current === 'execute') {
      return { allowed: true, reason: 'execute mode permits all tools' };
    }
    if (tool.id === 'terminal.run') {
      return this.evaluateBash(args);
    }
    if (tool.id === 'terminal.exec') {
      return { allowed: false, reason: 'terminal.exec is blocked in plan mode' };
    }
    if (UNSAFE_TOOL_IDS.has(tool.id)) {
      return {
        allowed: false,
        reason: `Tool "${tool.id}" is blocked in plan mode. Press Tab to switch to EXECUTE mode.`,
      };
    }
    if (tool.id.startsWith('git.')) {
      return this.evaluateGit(tool.id, args);
    }
    if (!SAFE_TOOL_CATEGORIES.has(tool.category)) {
      return {
        allowed: false,
        reason: `Tools in category "${tool.category}" are not available in plan mode.`,
      };
    }
    return { allowed: true, reason: 'plan mode permits safe tools' };
  }

  private evaluateBash(args: Record<string, unknown>): ModeGateDecision {
    const cmd = (args['command'] as string | undefined)?.trim() ?? '';
    if (!cmd) return { allowed: false, reason: 'empty command' };
    const firstToken = cmd.split(/\s+/)[0]?.toLowerCase() ?? '';
    if (!firstToken) return { allowed: false, reason: 'unable to parse command' };
    if (UNSAFE_BASH_VERBS.has(firstToken) && !SAFE_BASH_VERBS.has(firstToken)) {
      return {
        allowed: false,
        reason: `"${firstToken}" is not read-only. Allowed in plan mode: ${[...SAFE_BASH_VERBS].slice(0, 8).join(', ')}, ...`,
      };
    }
    if (!SAFE_BASH_VERBS.has(firstToken)) {
      return {
        allowed: false,
        reason: `"${firstToken}" is not in the plan-mode allow-list. Press Tab to switch to EXECUTE mode.`,
      };
    }
    return { allowed: true, reason: `read-only command "${firstToken}"` };
  }

  private evaluateGit(toolId: string, args: Record<string, unknown>): ModeGateDecision {
    const cmd = (args['command'] as string | undefined) ?? (args['subcommand'] as string | undefined) ?? '';
    const subcommand = cmd.split(/\s+/)[0]?.toLowerCase() ?? '';
    if (subcommand && !SAFE_GIT_SUBCOMMANDS.has(subcommand) && !SAFE_GIT_SUBCOMMANDS.has(cmd.toLowerCase())) {
      // Custom dispatcher tool names like git.status are fine
      if (toolId === 'git.status' || toolId === 'git.diff' || toolId === 'git.log' || toolId === 'git.show') {
        return { allowed: true, reason: 'read-only git tool' };
      }
      return {
        allowed: false,
        reason: `git ${subcommand} is a write operation. Press Tab to switch to EXECUTE mode.`,
      };
    }
    return { allowed: true, reason: 'read-only git command' };
  }
}

export const __modeTesting = { SAFE_BASH_VERBS, UNSAFE_BASH_VERBS, SAFE_GIT_SUBCOMMANDS, SAFE_TOOL_CATEGORIES, UNSAFE_TOOL_IDS };
