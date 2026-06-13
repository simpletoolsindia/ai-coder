import { describe, it, expect, beforeEach } from 'vitest';
import { resilientInvoke, validateArgsAgainstSchema, clearIdempotencyCache } from '../../src/core/resilience.js';
import type { Tool, ToolExecutionContext } from '../../src/core/types.js';

function def(id: string, properties: Record<string, { type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object' }> = {}, required: string[] = []): Tool {
  return {
    definition: {
      id,
      name: id,
      description: '',
      category: 'misc',
      pluginId: 'core',
      parameters: { type: 'object', properties, required },
    },
    execute: async () => ({ ok: true, data: 'ok' }),
  };
}

const ctx: ToolExecutionContext = {
  cwd: '/',
  caller: 't',
  sessionId: 's',
  permissions: { action: 'allow' },
  logger: { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined, child: () => ({} as never) } as never,
};

describe('resilientInvoke', () => {
  beforeEach(() => clearIdempotencyCache());

  it('returns ok on success', async () => {
    const r = await resilientInvoke(def('a'), {}, ctx);
    expect(r.ok).toBe(true);
  });

  it('rejects bad args before invoking', async () => {
    const r = await resilientInvoke(def('a', { name: { type: 'string' } }, ['name']), {}, ctx);
    expect(r.ok).toBe(false);
  });

  it('retries transient failures', async () => {
    let calls = 0;
    const tool: Tool = {
      definition: { id: 'x', name: 'x', description: '', category: 'misc', pluginId: 'core', parameters: { type: 'object', properties: {} } },
      execute: async () => {
        calls++;
        if (calls < 3) throw new Error('ECONNRESET');
        return { ok: true };
      },
    };
    const r = await resilientInvoke(tool, {}, ctx, { retry: { maxAttempts: 5, backoffMs: () => 1, retryOn: () => true } });
    expect(r.ok).toBe(true);
    expect(calls).toBe(3);
  });

  it('caches idempotent results', async () => {
    let calls = 0;
    const tool: Tool = {
      definition: { id: 'idem', name: 'idem', description: '', category: 'misc', pluginId: 'core', parameters: { type: 'object', properties: {} } },
      execute: async () => {
        calls++;
        return { ok: true, data: { calls } };
      },
    };
    const r1 = await resilientInvoke(tool, { x: 1 }, ctx, { idempotencyTtlMs: 5000 });
    const r2 = await resilientInvoke(tool, { x: 1 }, ctx, { idempotencyTtlMs: 5000 });
    expect(calls).toBe(1);
    expect(r1.data).toEqual(r2.data);
  });
});

describe('validateArgsAgainstSchema', () => {
  it('returns null when no required', () => {
    expect(validateArgsAgainstSchema({}, def('a').definition)).toBeNull();
  });

  it('reports missing required', () => {
    expect(validateArgsAgainstSchema({}, def('a', { name: { type: 'string' } }, ['name']).definition)).toContain('name');
  });

  it('reports wrong type', () => {
    expect(validateArgsAgainstSchema({ name: 1 }, def('a', { name: { type: 'string' } }, ['name']).definition)).toContain('string');
  });

  it('accepts correct args', () => {
    expect(validateArgsAgainstSchema({ name: 'x', count: 3 }, def('a', { name: { type: 'string' }, count: { type: 'integer' } }, ['name']).definition)).toBeNull();
  });
});
