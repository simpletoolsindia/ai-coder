import { describe, it, expect, vi } from 'vitest';
import { CLI } from '../../src/interfaces/cli.js';
import { Runtime } from '../../src/core/runtime.js';
import { Logger, silentTransport } from '../../src/core/logger.js';
import { EventBus } from '../../src/core/event-bus.js';
import { inMemoryIO, SettingsManager } from '../../src/core/settings-manager.js';
import { ProviderManager } from '../../src/core/provider-manager.js';
import { ToolRegistry } from '../../src/core/tool-resolver.js';
import { CommandRegistry } from '../../src/core/command-registry.js';
import { PermissionEngine } from '../../src/core/permission-engine.js';
import type { ChatResponse, Provider } from '../../src/core/types.js';

class MockProvider implements Provider {
  id = 'mock';
  kind = 'openai' as const;
  name = 'mock';
  async chat(): Promise<ChatResponse> {
    return {
      id: '1',
      model: 'm',
      choices: [{ index: 0, message: { role: 'assistant', content: 'hi' }, finishReason: 'stop' }],
    };
  }
}

function makeCLI(opts: { chatImpl?: () => Promise<ChatResponse> } = {}) {
  const logger = new Logger({ level: 'silent', transports: [silentTransport] });
  const bus = new EventBus();
  const settings = new SettingsManager({ io: inMemoryIO(), fileName: 's.json', configDir: '/tmp/x', autoPersist: false });
  const providers = new ProviderManager({ events: bus });
  const mock = new MockProvider();
  if (opts.chatImpl) mock.chat = opts.chatImpl;
  (providers as unknown as { providers: Map<string, Provider> }).providers.set('mock', mock);
  (providers as unknown as { activeId: string }).activeId = 'mock';
  const tools = new ToolRegistry({ settings });
  const commands = new CommandRegistry();
  const permissions = new PermissionEngine({ settings });
  const runtime = new Runtime({ logger, events: bus, settings, providers, tools, commands, permissions });
  const cli = new CLI({ runtime, logger, events: bus, noPrompt: true, noPlugins: true });
  return { cli, runtime, providers, bus, logger };
}

describe('CLI', () => {
  it('runs a slash command', async () => {
    const { cli, runtime } = makeCLI();
    await cli.initialize();
    const seen: string[] = [];
    runtime.commands.register({
      id: 't',
      name: '/t',
      description: '',
      pluginId: 'core',
      execute: (_args, ctx) => {
        ctx.print('ok');
        seen.push('ok');
      },
    });
    await cli.handle('/t', runtime.commands);
    expect(seen.length).toBe(1);
  });

  it('handles unknown command', async () => {
    const { cli, runtime } = makeCLI();
    await cli.initialize();
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await cli.handle('/unknown', runtime.commands);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('handles non-slash input by sending to runtime', async () => {
    const { cli, runtime } = makeCLI({
      chatImpl: async () => ({
        id: '1',
        model: 'm',
        choices: [{ index: 0, message: { role: 'assistant', content: 'reply' }, finishReason: 'stop' }],
      }),
    });
    await cli.initialize();
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await cli.handle('hello', runtime.commands);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('ignores empty input', async () => {
    const { cli, runtime } = makeCLI();
    await cli.initialize();
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await cli.handle('', runtime.commands);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
