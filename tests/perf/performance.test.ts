import { describe, it, expect } from 'vitest';
import { Runtime } from '../../src/core/runtime.js';
import { Logger, silentTransport } from '../../src/core/logger.js';
import { PluginManager } from '../../src/core/plugin-manager.js';
import { coreToolsPlugin } from '../../src/tools/index.js';
import { builtInPlugins } from '../../src/plugins/index.js';
import { SettingsManager } from '../../src/core/settings-manager.js';
import { inMemoryIO } from '../../src/core/settings-manager.js';
import { ToolRegistry } from '../../src/core/tool-resolver.js';
import { CommandRegistry } from '../../src/core/command-registry.js';
import { PermissionEngine } from '../../src/core/permission-engine.js';
import { EventBus } from '../../src/core/event-bus.js';
import { ContextCompressor } from '../../src/core/context-compressor.js';
import type { ChatMessage } from '../../src/core/types.js';

describe('Performance smoke tests', () => {
  it('Runtime construction is under 2s for 5 instances', () => {
    const start = Date.now();
    for (let i = 0; i < 5; i++) {
      new Runtime({ logger: new Logger({ level: 'silent', transports: [silentTransport] }) });
    }
    const dur = Date.now() - start;
    expect(dur).toBeLessThan(2000);
  });

  it('Plugin Manager with 7 builtins constructs in under 1s', () => {
    const bus = new EventBus();
    const settings = new SettingsManager({ io: inMemoryIO(), fileName: 's.json', configDir: '/tmp/x', autoPersist: false });
    const tools = new ToolRegistry({ settings });
    const commands = new CommandRegistry();
    const permissions = new PermissionEngine({ settings });
    const start = Date.now();
    new PluginManager({
      settings,
      tools,
      commands,
      permissions,
      events: bus,
      builtins: [coreToolsPlugin, ...builtInPlugins],
    });
    const dur = Date.now() - start;
    expect(dur).toBeLessThan(1000);
  });

  it('Context compressor handles 200 messages in under 1s', async () => {
    const c = new ContextCompressor({ threshold: 20, keepRecent: 5, maxSummaryChars: 5000 });
    const msgs: ChatMessage[] = Array.from({ length: 200 }, (_, i) => ({
      role: i % 2 ? 'user' : 'assistant',
      content: 'x'.repeat(500),
    }));
    const start = Date.now();
    const compressed = await c.compress(msgs);
    const dur = Date.now() - start;
    expect(dur).toBeLessThan(1000);
    expect(compressed.length).toBeLessThan(20);
  });

  it('Tool resolution over 100 tools is fast', () => {
    const settings = new SettingsManager({ io: inMemoryIO(), fileName: 's.json', configDir: '/tmp/x', autoPersist: false });
    const reg = new ToolRegistry({ settings });
    for (let i = 0; i < 100; i++) {
      reg.register({
        definition: {
          id: `tool.${i}`,
          name: `Tool ${i}`,
          description: `does thing ${i}`,
          category: 'filesystem',
          pluginId: 'core',
          parameters: { type: 'object', properties: {} },
          keywords: [`k${i}`, 'common'],
        },
        execute: async () => ({ ok: true }),
      });
    }
    const start = Date.now();
    const ranked = reg.resolveForRequest('k42 common', { maxTools: 10 });
    const dur = Date.now() - start;
    expect(dur).toBeLessThan(200);
    expect(ranked.length).toBeGreaterThan(0);
    expect(ranked.length).toBeLessThanOrEqual(10);
  });
});

