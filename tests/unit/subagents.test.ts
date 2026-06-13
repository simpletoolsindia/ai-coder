import { describe, it, expect, beforeEach } from 'vitest';
import { setSubAgentExecutor, getSubAgentExecutor, subAgentsPlugin } from '../../src/plugins/subagents/index.js';
import { inMemoryIO, SettingsManager } from '../../src/core/settings-manager.js';
import { ToolRegistry } from '../../src/core/tool-resolver.js';
import { CommandRegistry } from '../../src/core/command-registry.js';
import { PermissionEngine } from '../../src/core/permission-engine.js';
import { EventBus } from '../../src/core/event-bus.js';

describe('subagents plugin', () => {
  beforeEach(() => {
    setSubAgentExecutor(async (spec, req) => ({ name: spec.name, text: `hi ${req}`, steps: 1, ok: true }));
  });

  it('runs the default executor when none set', async () => {
    setSubAgentExecutor(getSubAgentExecutor());
    const settings = new SettingsManager({ io: inMemoryIO(), fileName: 's.json', configDir: '/tmp/x', autoPersist: false });
    const tools = new ToolRegistry({ settings });
    await subAgentsPlugin.setup!({
      container: undefined as never,
      events: new EventBus(),
      logger: undefined as never,
      settings,
      providers: undefined as never,
      tools,
      commands: new CommandRegistry(),
      permissions: new PermissionEngine({ settings }),
    });
    const res = await tools.invoke('subagent.run', { name: 'worker', request: 'fix bug' }, { cwd: '/', caller: 't', sessionId: 's' });
    expect(res.ok).toBe(true);
  });

  it('setup registers the subagent.run tool', async () => {
    const settings = new SettingsManager({ io: inMemoryIO(), fileName: 's.json', configDir: '/tmp/x', autoPersist: false });
    const tools = new ToolRegistry({ settings });
    await subAgentsPlugin.setup!({
      container: undefined as never,
      events: new EventBus(),
      logger: undefined as never,
      settings,
      providers: undefined as never,
      tools,
      commands: new CommandRegistry(),
      permissions: new PermissionEngine({ settings }),
    });
    expect(tools.has('subagent.run')).toBe(true);
  });

  it('handles errors from custom executor', async () => {
    setSubAgentExecutor(async () => {
      throw new Error('boom');
    });
    const settings = new SettingsManager({ io: inMemoryIO(), fileName: 's.json', configDir: '/tmp/x', autoPersist: false });
    const tools = new ToolRegistry({ settings });
    await subAgentsPlugin.setup!({
      container: undefined as never,
      events: new EventBus(),
      logger: undefined as never,
      settings,
      providers: undefined as never,
      tools,
      commands: new CommandRegistry(),
      permissions: new PermissionEngine({ settings }),
    });
    const res = await tools.invoke('subagent.run', { name: 'a', request: 'b' }, { cwd: '/', caller: 't', sessionId: 's' });
    expect(res.ok).toBe(false);
  });
});
