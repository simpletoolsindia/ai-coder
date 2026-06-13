import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProviderManager, ProviderNotFoundError } from '../../src/core/provider-manager.js';
import { EventBus } from '../../src/core/event-bus.js';
import { OpenAICompatibleProvider } from '../../src/providers/openai-compatible.js';
import type { ChatResponse, Provider } from '../../src/core/types.js';

class MockProvider implements Provider {
  id = 'mock';
  kind = 'openai' as const;
  name = 'mock';
  chat = vi.fn(async (): Promise<ChatResponse> => ({
    id: '1',
    model: 'm',
    choices: [{ index: 0, message: { role: 'assistant', content: 'hi' }, finishReason: 'stop' }],
  }));
}

describe('ProviderManager', () => {
  let pm: ProviderManager;
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
    pm = new ProviderManager({ events: bus, env: {} });
  });

  it('registers a provider and sets it active', () => {
    const p = pm.register({
      id: 'a',
      kind: 'openai-compatible',
      name: 'a',
    });
    expect(p).toBeInstanceOf(OpenAICompatibleProvider);
    expect(pm.activeIdOrUndefined()).toBe('a');
  });

  it('throws on duplicate', () => {
    pm.register({ id: 'a', kind: 'openai-compatible', name: 'a' });
    expect(() => pm.register({ id: 'a', kind: 'openai-compatible', name: 'a' })).toThrow();
  });

  it('throws when getting missing provider', () => {
    expect(() => pm.get('missing')).toThrow(ProviderNotFoundError);
  });

  it('unregister removes the provider', () => {
    pm.register({ id: 'a', kind: 'openai-compatible', name: 'a' });
    expect(pm.unregister('a')).toBe(true);
  });

  it('setActive switches the active provider', () => {
    pm.register({ id: 'a', kind: 'openai-compatible', name: 'a' });
    pm.register({ id: 'b', kind: 'openai-compatible', name: 'b' });
    pm.setActive('b');
    expect(pm.activeIdOrUndefined()).toBe('b');
  });

  it('login registers and makes active', () => {
    const p = pm.login({ id: 'a', kind: 'openai', name: 'a', apiKey: 'k' });
    expect(p).toBeDefined();
    expect(pm.activeIdOrUndefined()).toBe('a');
  });

  it('login replaces existing', () => {
    pm.login({ id: 'a', kind: 'openai', name: 'a', apiKey: 'k' });
    pm.login({ id: 'a', kind: 'openai', name: 'a', apiKey: 'k2' });
    expect(pm.getConfig('a')?.apiKey).toBe('k2');
  });

  it('list returns all configs', () => {
    pm.register({ id: 'a', kind: 'openai-compatible', name: 'a' });
    pm.register({ id: 'b', kind: 'openai-compatible', name: 'b' });
    expect(pm.list().map((c) => c.id).sort()).toEqual(['a', 'b']);
  });

  it('updateConfig updates fields', () => {
    pm.register({ id: 'a', kind: 'openai-compatible', name: 'a' });
    pm.updateConfig('a', { defaultModel: 'gpt-4o' });
    expect(pm.getConfig('a')?.defaultModel).toBe('gpt-4o');
  });

  it('uses env key when not provided', () => {
    const pm2 = new ProviderManager({ env: { OPENAI_API_KEY: 'envkey' } });
    pm2.register({ id: 'o', kind: 'openai', name: 'o' });
    const p = pm2.get('o') as OpenAICompatibleProvider;
    expect((p as unknown as { opts: { apiKey?: string } }).opts.apiKey).toBe('envkey');
  });

  it('uses env baseUrl when not provided', () => {
    const pm2 = new ProviderManager({ env: { OPENAI_BASE_URL: 'https://x' } });
    pm2.register({ id: 'o', kind: 'openai', name: 'o' });
    const p = pm2.get('o') as OpenAICompatibleProvider;
    expect((p as unknown as { opts: { baseUrl?: string } }).opts.baseUrl).toBe('https://x');
  });

  it('uses ollama defaults', () => {
    pm.register({ id: 'o', kind: 'ollama', name: 'o' });
    const p = pm.get('o') as OpenAICompatibleProvider;
    expect((p as unknown as { opts: { baseUrl?: string } }).opts.baseUrl).toBe('http://localhost:11434/v1');
  });

  it('emits provider.registered event', () => {
    let seen: unknown;
    bus.on('provider.registered', (p) => (seen = p));
    pm.register({ id: 'a', kind: 'openai-compatible', name: 'a' });
    expect(seen).toBeDefined();
  });

  it('chat calls the active provider', async () => {
    const mock = new MockProvider();
    (pm as unknown as { providers: Map<string, Provider> }).providers.set('mock', mock);
    (pm as unknown as { activeId: string }).activeId = 'mock';
    const res = await pm.chat({ messages: [] });
    expect(res.choices[0]?.message.content).toBe('hi');
  });

  it('active() throws when no providers', () => {
    expect(() => pm.active()).toThrow();
  });

  it('tryGet returns undefined for missing', () => {
    expect(pm.tryGet('missing')).toBeUndefined();
  });
});

describe('OpenAICompatibleProvider', () => {
  it('throws when no baseUrl', async () => {
    const p = new OpenAICompatibleProvider({ id: 'x', name: 'x', kind: 'openai-compatible' });
    await expect(p.chat({ messages: [] })).rejects.toThrow(/baseUrl/);
  });

  it('returns response on success', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          id: '1',
          model: 'm',
          choices: [{ index: 0, message: { role: 'assistant', content: 'hi' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
        }),
        { status: 200 },
      ),
    );
    const p = new OpenAICompatibleProvider({
      id: 'x',
      name: 'x',
      kind: 'openai-compatible',
      baseUrl: 'https://x',
      apiKey: 'k',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const res = await p.chat({ messages: [{ role: 'user', content: 'hello' }] });
    expect(res.choices[0]?.message.content).toBe('hi');
    expect(res.usage?.totalTokens).toBe(3);
  });

  it('retries on failure', async () => {
    let attempts = 0;
    const fetchImpl = vi.fn(async () => {
      attempts++;
      if (attempts < 3) {
        return new Response('fail', { status: 500 });
      }
      return new Response(
        JSON.stringify({
          id: '1',
          model: 'm',
          choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
        }),
        { status: 200 },
      );
    });
    const p = new OpenAICompatibleProvider({
      id: 'x',
      name: 'x',
      kind: 'openai-compatible',
      baseUrl: 'https://x',
      retry: 3,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const res = await p.chat({ messages: [] });
    expect(attempts).toBe(3);
    expect(res.choices[0]?.message.content).toBe('ok');
  });

  it('aborts when signal is aborted', async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => {
      controller.abort();
      throw new Error('aborted');
    });
    const p = new OpenAICompatibleProvider({
      id: 'x',
      name: 'x',
      kind: 'openai-compatible',
      baseUrl: 'https://x',
      retry: 0,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(p.chat({ messages: [], signal: controller.signal })).rejects.toThrow();
  });

  it('listModels returns model ids', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ data: [{ id: 'm1' }, { id: 'm2' }] }), { status: 200 }),
    );
    const p = new OpenAICompatibleProvider({
      id: 'x',
      name: 'x',
      kind: 'openai-compatible',
      baseUrl: 'https://x',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const models = await p.listModels();
    expect(models).toEqual(['m1', 'm2']);
  });
});
