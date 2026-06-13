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
}

const DEFAULT_OPTIONS: Required<Omit<ContextCompressorOptions, 'summarize'>> & {
  summarize?: ContextCompressorOptions['summarize'];
} = {
  threshold: 10,
  keepRecent: 4,
  maxSummaryChars: 1200,
  marker: '[... older messages were compressed to save context ...]',
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
    return messages.length > this.options.threshold;
  }

  async compress(messages: ChatMessage[], _ctx?: AgentContext): Promise<ChatMessage[]> {
    if (messages.length <= this.options.threshold) return messages;
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
