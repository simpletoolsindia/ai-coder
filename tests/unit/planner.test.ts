import { describe, it, expect } from 'vitest';
import { Planner } from '../../src/core/planner.js';
import { EventBus } from '../../src/core/event-bus.js';
import { Logger, silentTransport } from '../../src/core/logger.js';
import { inMemoryIO, SettingsManager } from '../../src/core/settings-manager.js';
import { ProviderManager } from '../../src/core/provider-manager.js';
import { ToolRegistry } from '../../src/core/tool-resolver.js';
import { CommandRegistry } from '../../src/core/command-registry.js';
import { PermissionEngine } from '../../src/core/permission-engine.js';
import { PromptBuilder } from '../../src/core/prompt-builder.js';
import { ContextCompressor } from '../../src/core/context-compressor.js';
import type { AgentContext, ChatResponse, Provider } from '../../src/core/types.js';

class MockProvider implements Provider {
  id = 'mock';
  kind = 'openai' as const;
  name = 'mock';
  calls = 0;
  async chat(): Promise<ChatResponse> {
    this.calls++;
    return {
      id: '1',
      model: 'm',
      choices: [
        { index: 0, message: { role: 'assistant', content: `reply ${this.calls}` }, finishReason: 'stop' },
      ],
    };
  }
}

function ctx(overrides: Partial<AgentContext> = {}): AgentContext {
  return {
    cwd: '/',
    sessionId: 's',
    systemPrompt: 'sys',
    messages: [],
    tools: [],
    request: 'hi',
    budget: { maxSteps: 5, maxTokens: 1000, deadlineMs: 60_000 },
    meta: {},
    ...overrides,
  };
}

describe('Planner', () => {
  function makePlanner(chatImpl: (call: number) => ChatResponse) {
    const bus = new EventBus();
    const logger = new Logger({ level: 'silent', transports: [silentTransport] });
    const settings = new SettingsManager({ io: inMemoryIO(), fileName: 's.json', configDir: '/tmp/x', autoPersist: false });
    const tools = new ToolRegistry({ settings });
    const _commands = new CommandRegistry();
    const _permissions = new PermissionEngine({ settings });
    const providers = new ProviderManager({ events: bus });
    const mock: MockProvider = new MockProvider();
    mock.chat = async () => chatImpl(mock.calls++);
    (providers as unknown as { providers: Map<string, Provider> }).providers.set('mock', mock);
    (providers as unknown as { activeId: string }).activeId = 'mock';
    const planner = new Planner({
      providers,
      tools,
      promptBuilder: new PromptBuilder(),
      compressor: new ContextCompressor(),
      logger,
      events: bus,
    });
    return { planner, providers, tools, bus, mock };
  }

  it('runs a single-step request', async () => {
    const { planner } = makePlanner(() => ({
      id: '1',
      model: 'm',
      choices: [{ index: 0, message: { role: 'assistant', content: 'hi' }, finishReason: 'stop' }],
    }));
    const res = await planner.run(ctx());
    expect(res.ok).toBe(true);
    expect(res.text).toBe('hi');
  });

  it('returns an error when no provider', async () => {
    const logger = new Logger({ level: 'silent', transports: [silentTransport] });
    const settings = new SettingsManager({ io: inMemoryIO(), fileName: 's.json', configDir: '/tmp/x', autoPersist: false });
    const providers = new ProviderManager({});
    const tools = new ToolRegistry({ settings });
    const planner = new Planner({
      providers,
      tools,
      promptBuilder: new PromptBuilder(),
      logger,
    });
    await expect(planner.run(ctx())).rejects.toThrow();
  });

  it('handles tool calls', async () => {
    let calls = 0;
    const { planner, tools } = makePlanner(() => {
      calls++;
      if (calls === 1) {
        return {
          id: '1',
          model: 'm',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: '',
                tool_calls: [
                  {
                    id: 'c1',
                    type: 'function',
                    function: { name: 'mock', arguments: '{}' },
                  },
                ],
              },
              finishReason: 'tool_calls',
            },
          ],
        };
      }
      return {
        id: '2',
        model: 'm',
        choices: [{ index: 0, message: { role: 'assistant', content: 'done' }, finishReason: 'stop' }],
      };
    });
    tools.register({
      definition: {
        id: 'mock',
        name: 'mock',
        description: 'd',
        category: 'filesystem',
        pluginId: 'core',
        parameters: { type: 'object', properties: {} },
      },
      execute: async () => ({ ok: true, data: 'r' }),
    });
    const res = await planner.run(
      ctx({
        tools: [
          {
            definition: {
              id: 'mock',
              name: 'mock',
              description: 'd',
              category: 'filesystem',
              pluginId: 'core',
              parameters: { type: 'object', properties: {} },
            },
            execute: async () => ({ ok: true, data: 'r' }),
          },
        ],
      }),
    );
    expect(res.ok).toBe(true);
    expect(res.text).toBe('done');
  });

  it('handles invalid tool args', async () => {
    let calls = 0;
    const { planner } = makePlanner(() => {
      calls++;
      if (calls === 1) {
        return {
          id: '1',
          model: 'm',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: '',
                tool_calls: [
                  { id: 'c1', type: 'function', function: { name: 'unknown', arguments: 'not-json' } },
                ],
              },
              finishReason: 'tool_calls',
            },
          ],
        };
      }
      return {
        id: '2',
        model: 'm',
        choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finishReason: 'stop' }],
      };
    });
    const res = await planner.run(ctx());
    expect(res.ok).toBe(true);
    expect(res.text).toBe('ok');
  });

  it('accumulates usage', async () => {
    const { planner } = makePlanner(() => ({
      id: '1',
      model: 'm',
      choices: [{ index: 0, message: { role: 'assistant', content: 'a' }, finishReason: 'stop' }],
      usage: { promptTokens: 5, completionTokens: 2, totalTokens: 7 },
    }));
    const res = await planner.run(ctx());
    expect(res.usage.totalTokens).toBe(7);
  });

  it('respects max steps', async () => {
    const { planner } = makePlanner(() => ({
      id: '1',
      model: 'm',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [{ id: 'c1', type: 'function', function: { name: 'mock', arguments: '{}' } }],
          },
          finishReason: 'tool_calls',
        },
      ],
    }));
    const res = await planner.run(ctx({ budget: { maxSteps: 2, maxTokens: 1000, deadlineMs: 60_000 } }));
    expect(res.ok).toBe(false);
    expect(res.error).toBe('max steps reached');
  });
});
