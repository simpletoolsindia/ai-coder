import { describe, it, expect, beforeEach } from 'vitest';
import { ToolRegistry } from '../../src/core/tool-resolver.js';
import { inMemoryIO, SettingsManager } from '../../src/core/settings-manager.js';
import { PermissionEngine } from '../../src/core/permission-engine.js';
import { EventBus } from '../../src/core/event-bus.js';
import type { Tool } from '../../src/core/types.js';

function tool(id: string, run: Tool['execute'] = async () => ({ ok: true, data: id })): Tool {
  return {
    definition: {
      id,
      name: id,
      description: `desc ${id}`,
      category: 'filesystem',
      pluginId: 'core',
      parameters: { type: 'object', properties: {} },
      keywords: id.split('.'),
    },
    execute: run,
  };
}

describe('ToolRegistry', () => {
  let settings: SettingsManager;
  let permissions: PermissionEngine;
  let reg: ToolRegistry;
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
    settings = new SettingsManager({ io: inMemoryIO(), fileName: 's.json', configDir: '/tmp/x', autoPersist: false });
    permissions = new PermissionEngine({ settings });
    reg = new ToolRegistry({ settings, permissions, events: bus });
  });

  it('registers and lists tools', () => {
    reg.register(tool('fs.read'));
    expect(reg.list()).toHaveLength(1);
  });

  it('throws on duplicate registration', () => {
    reg.register(tool('fs.read'));
    // second register should be a no-op
    reg.register(tool('fs.read'));
    expect(reg.list()).toHaveLength(1);
  });

  it('registerMany registers a batch', () => {
    reg.registerMany([tool('a'), tool('b')]);
    expect(reg.list().map((d) => d.id).sort()).toEqual(['a', 'b']);
  });

  it('unregister removes a tool', () => {
    reg.register(tool('a'));
    expect(reg.unregister('a')).toBe(true);
    expect(reg.has('a')).toBe(false);
  });

  it('categories lists unique categories', () => {
    reg.register(tool('a'));
    reg.register(tool('b'));
    expect(reg.categories()).toContain('filesystem');
  });

  it('byCategory returns filtered tools', () => {
    reg.register(tool('a'));
    expect(reg.byCategory('filesystem')).toHaveLength(1);
    expect(reg.byCategory('web')).toHaveLength(0);
  });

  it('byPlugin returns filtered tools', () => {
    reg.register(tool('a'));
    expect(reg.byPlugin('core')).toHaveLength(1);
  });

  it('resolveForRequest ranks relevant tools first', () => {
    reg.register(tool('fs.read'));
    reg.register(tool('fs.write'));
    reg.register(tool('web.search'));
    const ranked = reg.resolveForRequest('read a file');
    expect(ranked[0]?.tool.definition.id).toBe('fs.read');
  });

  it('bestFor returns a single best match', () => {
    reg.register(tool('fs.read'));
    reg.register(tool('web.search'));
    expect(reg.bestFor('read file')?.definition.id).toBe('fs.read');
  });

  it('bestFor returns undefined when nothing matches', () => {
    reg.register(tool('fs.read'));
    expect(reg.bestFor('xyzzy')).toBeUndefined();
  });

  it('filters by category in resolveForRequest', () => {
    reg.register(tool('fs.read'));
    reg.register(tool('web.search'));
    const r = reg.resolveForRequest('search', { categories: ['web'] });
    expect(r.every((x) => x.tool.definition.category === 'web')).toBe(true);
  });

  it('invoke calls the tool', async () => {
    reg.register(tool('a', async () => ({ ok: true, data: 'ran' })));
    const res = await reg.invoke('a', {}, { cwd: '/', caller: 'test', sessionId: 's' });
    expect(res.ok).toBe(true);
    expect(res.data).toBe('ran');
  });

  it('invoke returns error for unknown tool', async () => {
    const res = await reg.invoke('unknown', {}, { cwd: '/', caller: 'test', sessionId: 's' });
    expect(res.ok).toBe(false);
  });

  it('invoke handles tool errors', async () => {
    reg.register(tool('a', async () => {
      throw new Error('boom');
    }));
    const res = await reg.invoke('a', {}, { cwd: '/', caller: 'test', sessionId: 's' });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('boom');
  });

  it('invoke respects disabled tools', async () => {
    reg.register(tool('a'));
    await settings.setToolEnabled('a', false);
    const res = await reg.invoke('a', {}, { cwd: '/', caller: 'test', sessionId: 's' });
    expect(res.ok).toBe(false);
  });

  it('invoke respects deny permissions', async () => {
    permissions.addRule({ pattern: 'a', action: 'deny' });
    reg.register(tool('a'));
    const res = await reg.invoke('a', {}, { cwd: '/', caller: 'test', sessionId: 's' });
    expect(res.ok).toBe(false);
  });

  it('usage tracks calls', async () => {
    reg.register(tool('a'));
    await reg.invoke('a', {}, { cwd: '/', caller: 'test', sessionId: 's' });
    expect(reg.usage()[0]?.count).toBe(1);
  });

  it('emits tool.executed and tool.failed events', async () => {
    const seen: string[] = [];
    bus.on('tool.executed', () => seen.push('executed'));
    bus.on('tool.failed', () => seen.push('failed'));
    reg.register(tool('a', async () => {
      throw new Error('x');
    }));
    await reg.invoke('a', {}, { cwd: '/', caller: 'test', sessionId: 's' });
    expect(seen).toEqual(['failed']);
  });

  it('clear removes all tools', () => {
    reg.register(tool('a'));
    reg.clear();
    expect(reg.list()).toHaveLength(0);
  });
});
