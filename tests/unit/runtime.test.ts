import { describe, it, expect, beforeEach } from 'vitest';
import { Runtime } from '../../src/core/runtime.js';
import { Logger, silentTransport } from '../../src/core/logger.js';
import { EventBus } from '../../src/core/event-bus.js';
import { inMemoryIO, SettingsManager } from '../../src/core/settings-manager.js';
import { ProviderManager } from '../../src/core/provider-manager.js';
import { ToolRegistry } from '../../src/core/tool-resolver.js';
import { CommandRegistry } from '../../src/core/command-registry.js';
import { PermissionEngine } from '../../src/core/permission-engine.js';
import { ContextCompressor } from '../../src/core/context-compressor.js';
import { PromptBuilder } from '../../src/core/prompt-builder.js';
import type { ChatResponse, Provider } from '../../src/core/types.js';

class MockProvider implements Provider {
  id = 'mock';
  kind = 'openai' as const;
  name = 'mock';
  async chat(): Promise<ChatResponse> {
    return {
      id: '1',
      model: 'm',
      choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finishReason: 'stop' }],
    };
  }
}

describe('Runtime', () => {
  let bus: EventBus;
  let settings: SettingsManager;
  let providers: ProviderManager;
  let tools: ToolRegistry;
  let commands: CommandRegistry;
  let permissions: PermissionEngine;

  beforeEach(() => {
    bus = new EventBus();
    settings = new SettingsManager({ io: inMemoryIO(), fileName: 's.json', configDir: '/tmp/x', autoPersist: false });
    providers = new ProviderManager({ events: bus });
    const mock = new MockProvider();
    (providers as unknown as { providers: Map<string, Provider> }).providers.set('mock', mock);
    (providers as unknown as { activeId: string }).activeId = 'mock';
    tools = new ToolRegistry({ settings, permissions: new PermissionEngine({ settings }) });
    commands = new CommandRegistry();
    permissions = new PermissionEngine({ settings });
  });

  it('initializes settings and providers', async () => {
    const logger = new Logger({ level: 'silent', transports: [silentTransport] });
    const r = new Runtime({ logger, events: bus, settings, providers, tools, commands, permissions });
    await r.initialize();
    expect(r.settings.get('general').theme).toBe('auto');
  });

  it('runs a request via the planner', async () => {
    const logger = new Logger({ level: 'silent', transports: [silentTransport] });
    const r = new Runtime({ logger, events: bus, settings, providers, tools, commands, permissions });
    const res = await r.run('hello');
    expect(res.ok).toBe(true);
    expect(res.text).toBe('ok');
  });

  it('uses provided promptBuilder and compressor', async () => {
    const logger = new Logger({ level: 'silent', transports: [silentTransport] });
    const compressor = new ContextCompressor();
    const r = new Runtime({
      logger,
      events: bus,
      settings,
      providers,
      tools,
      commands,
      permissions,
      compressor,
      promptBuilder: new PromptBuilder({ identity: 'TEST' }),
    });
    const res = await r.run('hi');
    expect(res.ok).toBe(true);
  });
});
