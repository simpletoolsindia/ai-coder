import { describe, it, expect, beforeEach } from 'vitest';
import { PermissionEngine, PermissionDeniedError } from '../../src/core/permission-engine.js';
import { EventBus } from '../../src/core/event-bus.js';
import { inMemoryIO } from '../../src/core/settings-manager.js';
import { SettingsManager } from '../../src/core/settings-manager.js';
import type { Tool, ToolDefinition } from '../../src/core/types.js';

function defTool(id: string, dangerous = false): ToolDefinition {
  return {
    id,
    name: id,
    description: 'd',
    category: 'filesystem',
    pluginId: 'core',
    dangerous,
    parameters: { type: 'object', properties: {} },
  };
}

function _makeTool(id: string, dangerous = false): Tool {
  return { definition: defTool(id, dangerous), execute: async () => ({ ok: true }) };
}

describe('PermissionEngine', () => {
  let settings: SettingsManager;
  let engine: PermissionEngine;

  beforeEach(() => {
    settings = new SettingsManager({ io: inMemoryIO(), fileName: 's.json', configDir: '/tmp/x', autoPersist: false });
    engine = new PermissionEngine({ settings });
  });

  it('uses default ask when no rules', async () => {
    const decision = await engine.evaluate(defTool('fs.read'));
    expect(decision.action).toBe('ask');
  });

  it('matches a specific rule', async () => {
    engine.addRule({ pattern: 'fs.read', action: 'allow' });
    const d = await engine.evaluate(defTool('fs.read'));
    expect(d.action).toBe('allow');
  });

  it('uses glob pattern', async () => {
    engine.addRule({ pattern: 'fs.*', action: 'deny' });
    const d = await engine.evaluate(defTool('fs.read'));
    expect(d.action).toBe('deny');
  });

  it('respects target filter', async () => {
    engine.addRule({ pattern: 'fs.read', action: 'deny', target: 'fs.write' });
    const d = await engine.evaluate(defTool('fs.read'));
    expect(d.action).toBe('ask');
  });

  it('respects tool setting disabled', async () => {
    await settings.setToolEnabled('fs.read', false);
    const d = await engine.evaluate(defTool('fs.read'));
    expect(d.action).toBe('deny');
  });

  it('respects tool setting allow', async () => {
    engine.setDefault('deny');
    await settings.setToolEnabled('fs.read', true);
    const entry = settings.get('tools')['fs.read'] ?? { enabled: true, permission: 'allow' };
    await settings.set('tools', { ...settings.get('tools'), 'fs.read': { ...entry, permission: 'allow' } });
    const d = await engine.evaluate(defTool('fs.read'));
    expect(d.action).toBe('allow');
  });

  it('enforce throws on deny', async () => {
    engine.addRule({ pattern: 'fs.delete', action: 'deny' });
    await expect(engine.enforce(defTool('fs.delete'))).rejects.toBeInstanceOf(PermissionDeniedError);
  });

  it('uses prompt callback when action is prompt', async () => {
    engine.addRule({ pattern: 'fs.read', action: 'prompt' });
    const _prompt = (engine['options'].prompt = (async () => true) as never);
    const d = await engine.evaluate(defTool('fs.read'), {});
    expect(d.action).toBe('allow');
  });

  it('default prompt when default is prompt', async () => {
    engine.setDefault('prompt');
    let called = false;
    const bus = new EventBus();
    const e2 = new PermissionEngine({ settings: new SettingsManager({ io: inMemoryIO(), fileName: 's.json', configDir: '/tmp/x', autoPersist: false }), events: bus, prompt: async () => {
      called = true;
      return false;
    } });
    e2.setDefault('prompt');
    const d = await e2.evaluate(defTool('x'));
    expect(called).toBe(true);
    expect(d.action).toBe('deny');
  });

  it('removeRule removes a rule by pattern', () => {
    engine.addRule({ pattern: 'fs.read', action: 'allow' });
    expect(engine.removeRule('fs.read')).toBe(true);
    expect(engine.getRules()).toHaveLength(0);
  });

  it('setRules replaces the rule list', () => {
    engine.setRules([{ pattern: 'a', action: 'allow' }, { pattern: 'b', action: 'deny' }]);
    expect(engine.getRules()).toHaveLength(2);
  });

  it('clear removes all rules', () => {
    engine.addRule({ pattern: 'a', action: 'allow' });
    engine.clear();
    expect(engine.getRules()).toHaveLength(0);
  });

  it('emits permission.evaluated', async () => {
    const bus = new EventBus();
    const e2 = new PermissionEngine({ settings, events: bus });
    let seen: unknown;
    bus.on('permission.evaluated', (p) => (seen = p));
    await e2.enforce(defTool('fs.read'));
    expect(seen).toBeDefined();
  });
});
