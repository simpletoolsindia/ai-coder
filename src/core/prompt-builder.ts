import type { Tool, ToolDefinition } from './types.js';
import { getOsInfo } from './os.js';

export interface PromptBuilderOptions {
  /** Base identity of the agent */
  identity?: string;
  /** Capabilities the agent should advertise */
  capabilities?: string[];
  /** Working directory description */
  cwd?: string;
  /** Platform info */
  platform?: string;
  /** Date injected into the system prompt */
  date?: string;
  /** Extra sections appended to the system prompt */
  extras?: string[];
  /** Current mode: plan or execute */
  mode?: 'plan' | 'execute';
  /** Override the OS meta line */
  osMeta?: string;
  /** Override the supported commands line */
  supportedCommands?: string;
}

export const DEFAULT_IDENTITY = `You are AI By, a coding agent. Be precise, brief, and use tools.`;

export const PLAN_MODE_INSTRUCTIONS = `You are in PLAN mode. Read-only tools only. Do not modify files or run mutating commands. After planning, stop and wait for the user to press Tab to switch to EXECUTE mode.`;

export const EXECUTE_MODE_INSTRUCTIONS = `You are in EXECUTE mode. You may use any tool. Make the requested changes, then summarize what you did.`;

/** Default supported commands summary, used in the system prompt. */
export const DEFAULT_SUPPORTED_COMMANDS =
  'node, npm, npx, git, ls, cat, cp, mv, mkdir, rm, grep, find, curl, wget, echo, pwd, env, which, ps, tar, zip';

export class PromptBuilder {
  private options: PromptBuilderOptions;

  constructor(options: PromptBuilderOptions = {}) {
    this.options = options;
  }

  with(extra: Partial<PromptBuilderOptions>): PromptBuilder {
    return new PromptBuilder({ ...this.options, ...extra });
  }

  build(tools: Tool[] = []): string {
    const sections: string[] = [];
    sections.push(this.options.identity ?? DEFAULT_IDENTITY);
    if (this.options.mode === 'plan') {
      sections.push(PLAN_MODE_INSTRUCTIONS);
    } else if (this.options.mode === 'execute') {
      sections.push(EXECUTE_MODE_INSTRUCTIONS);
    }
    sections.push(this.metaBlock());
    sections.push(this.environmentBlock());
    if (this.options.capabilities && this.options.capabilities.length > 0) {
      sections.push(this.capabilitiesBlock(this.options.capabilities));
    }
    if (tools.length > 0) {
      sections.push(this.toolsBlock(tools));
    }
    for (const e of this.options.extras ?? []) {
      sections.push(e);
    }
    return sections.join('\n\n');
  }

  /**
   * Build a minimal prompt that just lists the tool names and short
   * descriptions. Used by the tool RAG when the LLM is asked to choose
   * a tool before doing real work.
   */
  buildToolIndex(tools: Tool[]): string {
    const lines: string[] = ['Available tools:'];
    for (const t of tools) {
      lines.push(`- ${t.definition.id}: ${t.definition.description}`);
    }
    return lines.join('\n');
  }

  /**
   * Two-line meta block: OS and supported commands. Always included
   * so the LLM is aware of the host platform and what binaries it
   * can rely on.
   */
  private metaBlock(): string {
    const os = getOsInfo();
    const osLine =
      this.options.osMeta ??
      `OS: ${os.platform} (${os.arch}) · shell: ${os.shell} · home: ${os.home} · null: ${os.nullDevice}`;
    const cmds = this.options.supportedCommands ?? DEFAULT_SUPPORTED_COMMANDS;
    return `${osLine}\nSupported commands: ${cmds}`;
  }

  private environmentBlock(): string {
    const lines: string[] = ['## Env'];
    if (this.options.cwd) lines.push(`cwd: ${this.options.cwd}`);
    if (this.options.platform) lines.push(`platform: ${this.options.platform}`);
    lines.push(`date: ${this.options.date ?? new Date().toISOString()}`);
    return lines.join('\n');
  }

  private capabilitiesBlock(caps: string[]): string {
    return ['## Capabilities', ...caps.map((c) => `- ${c}`)].join('\n');
  }

  private toolsBlock(tools: Tool[]): string {
    const lines: string[] = ['## Tools'];
    for (const t of tools) {
      lines.push(this.toolEntry(t.definition));
    }
    return lines.join('\n\n');
  }

  private toolEntry(def: ToolDefinition): string {
    const lines: string[] = [];
    lines.push(`### ${def.id}`);
    lines.push(def.description);
    const required = def.parameters.required ?? [];
    const props = Object.entries(def.parameters.properties)
      .map(([k, v]) => {
        const req = required.includes(k) ? ' (required)' : '';
        return `- ${k}${req}: ${v.type}`;
      })
      .join(', ');
    if (props) lines.push(`args: ${props}`);
    return lines.join('\n');
  }
}

export const createPromptBuilder = (opts?: PromptBuilderOptions): PromptBuilder =>
  new PromptBuilder(opts);
