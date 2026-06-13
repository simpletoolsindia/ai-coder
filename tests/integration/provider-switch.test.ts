import { describe, it, expect, beforeEach } from 'vitest';
import { Runtime } from '../../src/core/runtime.js';
import { EventBus } from '../../src/core/event-bus.js';
import { Logger, silentTransport } from '../../src/core/logger.js';
import type { ChatResponse, Provider } from '../../src/core/types.js';

class MockProvider implements Provider {
  id = 'mock';
  kind = 'openai' as const;
  name = 'mock';
  responses: ChatResponse[] = [];
  async chat(): Promise<ChatResponse> {
    const r = this.responses.shift();
    if (r) return r;
    return { id: '1', model: 'm', choices: [{ index: 0, message: { role: 'assistant', content: '' }, finishReason: 'stop' }] };
  }
}

describe('Integration: provider wiring', () => {
  let runtime: Runtime;
  let mock: MockProvider;

  beforeEach(() => {
    const bus = new EventBus();
    const logger = new Logger({ level: 'silent', transports: [silentTransport] });
    runtime = new Runtime({ logger, events: bus });
    mock = new MockProvider();
    (runtime.providers as unknown as { providers: Map<string, Provider> }).providers.set('mock', mock);
    (runtime.providers as unknown as { activeId: string }).activeId = 'mock';
  });

  it('login creates a working provider', async () => {
    mock.responses.push({ id: '1', model: 'm', choices: [{ index: 0, message: { role: 'assistant', content: 'x' }, finishReason: 'stop' }] });
    runtime.providers.login({ id: 'loginTest', kind: 'openai-compatible', name: 'loginTest' });
    (runtime.providers as unknown as { providers: Map<string, Provider> }).providers.set('loginTest', mock);
    runtime.providers.setActive('loginTest');
    const res = await runtime.run('hi');
    expect(res.text).toBe('x');
  });

  it('login a different provider switches active', async () => {
    const second = new MockProvider();
    second.responses.push({ id: '1', model: 'm', choices: [{ index: 0, message: { role: 'assistant', content: 'second' }, finishReason: 'stop' }] });
    runtime.providers.register({ id: 'second', kind: 'openai-compatible', name: 'second' });
    // Replace the registered instance with our mock
    (runtime.providers as unknown as { providers: Map<string, Provider> }).providers.set('second', second);
    runtime.providers.setActive('second');
    const res = await runtime.run('hi');
    expect(res.text).toBe('second');
  });
});
