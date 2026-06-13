/**
 * Learning layer: observes user queries and tool-call patterns and writes
 * a compact AGENT.md hint file that is appended to the system prompt to
 * tailor behaviour for the next session.
 */
import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';

export interface InteractionSample {
  timestamp: number;
  prompt: string;
  toolsUsed: string[];
  durationMs: number;
  ok: boolean;
}

export interface LearningStoreOptions {
  filePath: string;
  /** Max number of samples to retain for stats. */
  maxSamples?: number;
  /** Max number of patterns surfaced into AGENT.md. */
  maxPatterns?: number;
}

interface PersistedShape {
  samples: InteractionSample[];
  patterns: { pattern: string; count: number }[];
  hints: string[];
}

const DEFAULT_HINTS_HEADER = `# AGENT.md

> Auto-generated hints from your past interactions. The agent reads this file
> to personalize its behaviour. Edit it freely; your edits are preserved
> across regenerations.

`;

export class LearningStore {
  private samples: InteractionSample[] = [];
  private patterns: { pattern: string; count: number }[] = [];
  private hints: string[] = [];
  private options: Required<LearningStoreOptions>;
  private loaded = false;
  private dirty = false;

  constructor(options: LearningStoreOptions) {
    this.options = {
      filePath: options.filePath,
      maxSamples: options.maxSamples ?? 500,
      maxPatterns: options.maxPatterns ?? 12,
    };
  }

  async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.options.filePath, 'utf-8');
      const data = JSON.parse(raw) as Partial<PersistedShape>;
      this.samples = data.samples ?? [];
      this.patterns = data.patterns ?? [];
      this.hints = data.hints ?? [];
    } catch {
      this.samples = [];
      this.patterns = [];
      this.hints = [];
    }
    this.loaded = true;
  }

  record(sample: InteractionSample): void {
    this.samples.push(sample);
    if (this.samples.length > this.options.maxSamples) {
      this.samples.splice(0, this.samples.length - this.options.maxSamples);
    }
    // Extract simple patterns: most common first token of the prompt
    const firstToken = sample.prompt
      .toLowerCase()
      .replace(/[^a-z0-9_\- ]/g, ' ')
      .split(/\s+/)[0];
    if (firstToken && firstToken.length > 2) {
      const existing = this.patterns.find((p) => p.pattern === firstToken);
      if (existing) existing.count += 1;
      else this.patterns.push({ pattern: firstToken, count: 1 });
    }
    this.dirty = true;
  }

  addHint(hint: string): void {
    if (!hint.trim()) return;
    if (this.hints.includes(hint)) return;
    this.hints.push(hint);
    this.dirty = true;
  }

  setHints(hints: string[]): void {
    this.hints = hints.filter(Boolean);
    this.dirty = true;
  }

  topPatterns(limit = this.options.maxPatterns): { pattern: string; count: number }[] {
    return [...this.patterns].sort((a, b) => b.count - a.count).slice(0, limit);
  }

  /**
   * Render the AGENT.md file contents. Combines a header, observed
   * patterns, the most-used tools, and any hints.
   */
  renderAgentMd(): string {
    const lines: string[] = [DEFAULT_HINTS_HEADER];
    const patterns = this.topPatterns();
    if (patterns.length > 0) {
      lines.push('## Common request patterns');
      for (const p of patterns) {
        lines.push(`- "${p.pattern}..." (used ${p.count} times)`);
      }
      lines.push('');
    }
    const toolCounts = new Map<string, number>();
    for (const s of this.samples) {
      for (const t of s.toolsUsed) {
        toolCounts.set(t, (toolCounts.get(t) ?? 0) + 1);
      }
    }
    const topTools = Array.from(toolCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    if (topTools.length > 0) {
      lines.push('## Frequently used tools');
      for (const [t, c] of topTools) {
        lines.push(`- \`${t}\` (${c} calls)`);
      }
      lines.push('');
    }
    if (this.hints.length > 0) {
      lines.push('## Personalization hints');
      for (const h of this.hints) {
        lines.push(`- ${h}`);
      }
      lines.push('');
    }
    return lines.join('\n');
  }

  async flush(): Promise<void> {
    if (!this.dirty) return;
    await fs.mkdir(dirname(this.options.filePath), { recursive: true });
    const md = this.renderAgentMd();
    await fs.writeFile(this.options.filePath, md, 'utf-8');
    const json = join(dirname(this.options.filePath), 'agent-samples.json');
    const payload: PersistedShape = { samples: this.samples, patterns: this.patterns, hints: this.hints };
    await fs.writeFile(json, JSON.stringify(payload, null, 2), 'utf-8');
    this.dirty = false;
  }

  summary(): { samples: number; patterns: number; hints: number } {
    return { samples: this.samples.length, patterns: this.patterns.length, hints: this.hints.length };
  }
}

export const __learningTesting = { LearningStore };
