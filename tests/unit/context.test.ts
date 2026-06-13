import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { contextPlugin } from '../../src/plugins/context/index.js';
import { inMemoryIO, SettingsManager } from '../../src/core/settings-manager.js';
import { ToolRegistry } from '../../src/core/tool-resolver.js';
import { CommandRegistry } from '../../src/core/command-registry.js';
import { PermissionEngine } from '../../src/core/permission-engine.js';
import { EventBus } from '../../src/core/event-bus.js';
import { promises as fs } from 'node:fs';
import type { ToolExecutionContext } from '../../src/core/types.js';

let dir: string;
let _ctx: ToolExecutionContext;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ai-by-ctx-'));
  _ctx = {
    cwd: dir,
    caller: 'test',
    sessionId: 's',
    permissions: { action: 'allow' },
    logger: { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined, child: () => ({} as never) } as never,
  };
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('context plugin', () => {
  it('setup registers tools', async () => {
    const settings = new SettingsManager({ io: inMemoryIO(), fileName: 's.json', configDir: '/tmp/x', autoPersist: false });
    const tools = new ToolRegistry({ settings });
    await contextPlugin.setup!({
      container: undefined as never,
      events: new EventBus(),
      logger: undefined as never,
      settings,
      providers: undefined as never,
      tools,
      commands: new CommandRegistry(),
      permissions: new PermissionEngine({ settings }),
    });
    expect(tools.has('context.project-map')).toBe(true);
    expect(tools.has('context.tokens')).toBe(true);
  });

  it('builds a project map', async () => {
    await fs.writeFile(join(dir, 'index.ts'), 'export const x = 1;\n', 'utf-8');
    await fs.mkdir(join(dir, 'src'));
    await fs.writeFile(join(dir, 'src', 'a.ts'), 'export const a = 1;\n', 'utf-8');
    const settings = new SettingsManager({ io: inMemoryIO(), fileName: 's.json', configDir: '/tmp/x', autoPersist: false });
    const tools = new ToolRegistry({ settings });
    await contextPlugin.setup!({
      container: undefined as never,
      events: new EventBus(),
      logger: undefined as never,
      settings,
      providers: undefined as never,
      tools,
      commands: new CommandRegistry(),
      permissions: new PermissionEngine({ settings }),
    });
    const res = await tools.invoke('context.project-map', { cwd: '.' }, { cwd: dir, caller: 't', sessionId: 's' });
    expect(res.ok).toBe(true);
    const data = res.data as { count: number; entries: { path: string }[] };
    expect(data.count).toBeGreaterThanOrEqual(2);
  });

  it('counts tokens in a string', async () => {
    const settings = new SettingsManager({ io: inMemoryIO(), fileName: 's.json', configDir: '/tmp/x', autoPersist: false });
    const tools = new ToolRegistry({ settings });
    await contextPlugin.setup!({
      container: undefined as never,
      events: new EventBus(),
      logger: undefined as never,
      settings,
      providers: undefined as never,
      tools,
      commands: new CommandRegistry(),
      permissions: new PermissionEngine({ settings }),
    });
    const res = await tools.invoke('context.tokens', { text: 'hello world' }, { cwd: dir, caller: 't', sessionId: 's' });
    expect(res.ok).toBe(true);
  });
});
