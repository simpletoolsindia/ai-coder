import type { AgentContext, ChatMessage } from './types.js';

export interface CompressionResult {
  messages: ChatMessage[];
  removedCount: number;
  summaryTokens: number;
}

export interface ContextCompressorOptions {
  /** When the number of messages exceeds this, compress */
  threshold: number;
  /** Keep this many recent messages intact */
  keepRecent: number;
  /** Maximum characters in a summary */
  maxSummaryChars: number;
  /** Inject a marker for the removed region */
  marker?: string;
  /** Optional summary provider (defaults to a heuristic) */
  summarize?: (messages: ChatMessage[]) => Promise<string> | string;
  /** Token budget; messages whose combined chars exceed this trigger compression. Default 24000. */
  tokenBudgetChars?: number;
}

const DEFAULT_OPTIONS: Required<Omit<ContextCompressorOptions, 'summarize'>> & {
  summarize?: ContextCompressorOptions['summarize'];
} = {
  threshold: 10,
  keepRecent: 4,
  maxSummaryChars: 1200,
  marker: '[... older messages were compressed to save context ...]',
  tokenBudgetChars: 24_000,
};

export class ContextCompressor {
  private options: Required<Omit<ContextCompressorOptions, 'summarize'>> & {
    summarize?: ContextCompressorOptions['summarize'];
  };

  constructor(options: Partial<ContextCompressorOptions> = {}) {
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
    };
  }

  shouldCompress(messages: ChatMessage[]): boolean {
    if (messages.length > this.options.threshold) return true;
    return this.measure(messages) > this.options.tokenBudgetChars;
  }

  /** Returns the number of characters across all messages. */
  measure(messages: ChatMessage[]): number {
    let total = 0;
    for (const m of messages) total += (m.content?.length ?? 0) + 8;
    return total;
  }

  /** Returns the rough utilization percentage 0..1 of the token budget. */
  utilization(messages: ChatMessage[]): number {
    if (this.options.tokenBudgetChars === 0) return 0;
    return Math.min(1, this.measure(messages) / this.options.tokenBudgetChars);
  }

  /** True when utilization >= threshold (default 0.95). */
  shouldAutoCompact(messages: ChatMessage[], threshold = 0.95): boolean {
    return this.utilization(messages) >= threshold;
  }

  async compress(messages: ChatMessage[], _ctx?: AgentContext): Promise<ChatMessage[]> {
    if (messages.length <= this.options.threshold && this.measure(messages) <= this.options.tokenBudgetChars) {
      return messages;
    }
    // If we have a very long single message, aggressively truncate it
    if (messages.length <= 2) {
      return messages.map((m) => truncateIfHuge(m, this.options.maxSummaryChars * 4));
    }
    const keep = this.options.keepRecent;
    const head = messages[0];
    const tail = messages.slice(-keep);
    const middle = messages.slice(1, messages.length - keep);
    if (middle.length === 0) return messages;
    const summary = this.options.summarize
      ? await this.options.summarize(middle)
      : heuristicSummary(middle);
    const truncated =
      summary.length > this.options.maxSummaryChars
        ? `${summary.slice(0, this.options.maxSummaryChars)}...`
        : summary;
    const summaryMessage: ChatMessage = {
      role: 'system',
      content: `${this.options.marker}\n${truncated}`,
    };
    if (!head) return [summaryMessage, ...tail];
    return [head, summaryMessage, ...tail];
  }

  /**
   * Aggressive full compact: produces a single system summary plus the
   * most recent N messages. Used by /compact and at high utilization.
   */
  async compact(messages: ChatMessage[]): Promise<ChatMessage[]> {
    const keep = Math.min(2, messages.length);
    const head = messages[0];
    const tail = messages.slice(-keep);
    const middle = messages.slice(1, messages.length - keep);
    const summary = this.options.summarize
      ? await this.options.summarize(middle)
      : heuristicSummary(middle);
    const summaryMessage: ChatMessage = {
      role: 'system',
      content: `${this.options.marker}\n${summary}`.slice(0, this.options.maxSummaryChars * 4),
    };
    if (!head) return [summaryMessage, ...tail];
    return [head, summaryMessage, ...tail];
  }

  estimateSavings(messages: ChatMessage[]): { before: number; after: number; saved: number } {
    const before = JSON.stringify(messages).length;
    if (messages.length <= this.options.threshold) {
      return { before, after: before, saved: 0 };
    }
    const keep = this.options.keepRecent;
    const head = messages[0];
    const tail = messages.slice(-keep);
    const middle = messages.slice(1, messages.length - keep);
    const summary = heuristicSummary(middle).slice(0, this.options.maxSummaryChars);
    const afterList: ChatMessage[] = head
      ? [head, { role: 'system', content: summary }, ...tail]
      : [{ role: 'system', content: summary }, ...tail];
    const after = JSON.stringify(afterList).length;
    return { before, after, saved: Math.max(0, before - after) };
  }
}

function truncateIfHuge(m: ChatMessage, max: number): ChatMessage {
  if (m.content.length <= max) return m;
  return { ...m, content: `${m.content.slice(0, max)}... [truncated ${m.content.length - max} chars]` };
}

function heuristicSummary(messages: ChatMessage[]): string {
  const lines: string[] = [];
  let i = 0;
  for (const m of messages) {
    if (m.role === 'system') continue;
    const preview = m.content.replace(/\s+/g, ' ').slice(0, 120);
    lines.push(`${i + 1}. [${m.role}] ${preview}`);
    i++;
  }
  return lines.join('\n');
}

export const createContextCompressor = (opts?: Partial<ContextCompressorOptions>): ContextCompressor =>
  new ContextCompressor(opts);

export const __compressorTesting = { heuristicSummary };
