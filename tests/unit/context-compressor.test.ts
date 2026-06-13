import { describe, it, expect } from 'vitest';
import { ContextCompressor } from '../../src/core/context-compressor.js';
import type { ChatMessage } from '../../src/core/types.js';

const msgs = (n: number): ChatMessage[] =>
  Array.from({ length: n }, (_, i) => ({ role: i % 2 ? 'user' : 'assistant', content: `m${i}` }));

describe('ContextCompressor', () => {
  it('does not compress below threshold', async () => {
    const c = new ContextCompressor({ threshold: 5, keepRecent: 2 });
    const result = await c.compress(msgs(3));
    expect(result).toHaveLength(3);
  });

  it('compresses when over threshold', async () => {
    const c = new ContextCompressor({ threshold: 5, keepRecent: 2, maxSummaryChars: 1000 });
    const result = await c.compress(msgs(10));
    expect(result.length).toBeLessThan(10);
  });

  it('preserves first system message', async () => {
    const c = new ContextCompressor({ threshold: 3, keepRecent: 2 });
    const input: ChatMessage[] = [
      { role: 'system', content: 'sys' },
      ...msgs(10),
    ];
    const result = await c.compress(input);
    expect(result[0]?.content).toBe('sys');
  });

  it('keeps the most recent N messages intact', async () => {
    const c = new ContextCompressor({ threshold: 3, keepRecent: 3, maxSummaryChars: 1000 });
    const input = msgs(10);
    const result = await c.compress(input);
    const last = input.slice(-3);
    expect(result.slice(-3).map((m) => m.content)).toEqual(last.map((m) => m.content));
  });

  it('uses custom summarize function', async () => {
    const c = new ContextCompressor({
      threshold: 3,
      keepRecent: 2,
      summarize: () => 'CUSTOM',
    });
    const result = await c.compress(msgs(10));
    const summary = result.find((m) => m.content.includes('CUSTOM'));
    expect(summary).toBeDefined();
  });

  it('truncates long summaries', async () => {
    const c = new ContextCompressor({
      threshold: 3,
      keepRecent: 2,
      maxSummaryChars: 5,
      summarize: () => 'x'.repeat(1000),
    });
    const result = await c.compress(msgs(10));
    const summary = result.find((m) => m.role === 'system' && m.content.includes('xxxxx'));
    expect(summary?.content.length).toBeLessThan(100);
  });

  it('estimateSavings reports savings when compressing', () => {
    const c = new ContextCompressor({ threshold: 3, keepRecent: 2, maxSummaryChars: 1000 });
    const before = msgs(10);
    const { before: b, after, saved } = c.estimateSavings(before);
    expect(b).toBeGreaterThan(0);
    expect(after).toBeLessThanOrEqual(b);
    expect(saved).toBeGreaterThanOrEqual(0);
  });

  it('shouldCompress checks the threshold', () => {
    const c = new ContextCompressor({ threshold: 5, keepRecent: 1 });
    expect(c.shouldCompress(msgs(3))).toBe(false);
    expect(c.shouldCompress(msgs(6))).toBe(true);
  });
});
