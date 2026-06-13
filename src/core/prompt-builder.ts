import type { Tool, ToolDefinition } from './types.js';

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
}

export const DEFAULT_IDENTITY = `You are AI By, a careful, production-grade coding agent.
You help the user with code generation, debugging, refactoring, and project maintenance.
You prefer to use tools over guessing. You are precise, concise, and never invent APIs.
When unsure, you ask the user a clarifying question.`;

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

  private environmentBlock(): string {
    const lines: string[] = ['## Environment'];
    if (this.options.cwd) lines.push(`Working directory: ${this.options.cwd}`);
    if (this.options.platform) lines.push(`Platform: ${this.options.platform}`);
    lines.push(`Date: ${this.options.date ?? new Date().toISOString()}`);
    return lines.join('\n');
  }

  private capabilitiesBlock(caps: string[]): string {
    return ['## Capabilities', ...caps.map((c) => `- ${c}`)].join('\n');
  }

  private toolsBlock(tools: Tool[]): string {
    const lines: string[] = ['## Available Tools'];
    for (const t of tools) {
      lines.push(this.toolEntry(t.definition));
    }
    return lines.join('\n\n');
  }

  private toolEntry(def: ToolDefinition): string {
    const lines: string[] = [];
    lines.push(`### ${def.id} (${def.category})`);
    lines.push(def.description);
    const required = def.parameters.required ?? [];
    const props = Object.entries(def.parameters.properties)
      .map(([k, v]) => {
        const req = required.includes(k) ? ' (required)' : '';
        const type = v.type;
        return `- ${k}${req}: ${type}${v.description ? ` - ${v.description}` : ''}`;
      })
      .join('\n');
    if (props) lines.push(props);
    return lines.join('\n');
  }
}

export const createPromptBuilder = (opts?: PromptBuilderOptions): PromptBuilder =>
  new PromptBuilder(opts);
