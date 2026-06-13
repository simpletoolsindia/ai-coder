import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ModeController } from '../../src/core/mode-controller.js';
import type { ToolDefinition } from '../../src/core/types.js';

function def(id: string, category: string): ToolDefinition {
  return {
    id,
    name: id,
    description: '',
    category: category as ToolDefinition['category'],
    pluginId: 'core',
    parameters: { type: 'object', properties: {} },
  };
}

describe('ModeController', () => {
  let m: ModeController;
  beforeEach(() => {
    m = new ModeController();
  });

  it('starts in plan mode', () => {
    expect(m.mode).toBe('plan');
    expect(m.isPlan()).toBe(true);
    expect(m.isExecute()).toBe(false);
  });

  it('toggle moves to execute and back', () => {
    expect(m.toggle()).toBe('execute');
    expect(m.mode).toBe('execute');
    expect(m.toggle()).toBe('plan');
  });

  it('setMode emits events', () => {
    const events: unknown[] = [];
    m.onChange((e) => events.push(e));
    m.setMode('execute');
    m.setMode('plan');
    expect(events).toHaveLength(2);
  });

  it('execute mode permits all tools', () => {
    m.setMode('execute');
    const decision = m.evaluate(def('fs.write', 'filesystem'));
    expect(decision.allowed).toBe(true);
  });

  it('plan mode blocks unsafe tools', () => {
    const d = m.evaluate(def('fs.write', 'filesystem'));
    expect(d.allowed).toBe(false);
  });

  it('plan mode permits safe tools', () => {
    const d = m.evaluate(def('fs.read', 'filesystem'));
    expect(d.allowed).toBe(true);
  });

  it('plan mode permits web search', () => {
    const d = m.evaluate(def('web.search', 'web'));
    expect(d.allowed).toBe(true);
  });

  it('plan mode blocks unsafe bash but allows read-only', () => {
    expect(m.evaluate(def('terminal.run', 'terminal'), { command: 'rm -rf /' }).allowed).toBe(false);
    expect(m.evaluate(def('terminal.run', 'terminal'), { command: 'ls -la' }).allowed).toBe(true);
    expect(m.evaluate(def('terminal.run', 'terminal'), { command: 'curl https://example.com' }).allowed).toBe(true);
    expect(m.evaluate(def('terminal.run', 'terminal'), { command: 'echo hello' }).allowed).toBe(true);
  });

  it('plan mode blocks git write operations', () => {
    const d = m.evaluate(def('git.commit', 'git'), { command: 'commit -m x' });
    expect(d.allowed).toBe(false);
  });

  it('plan mode permits read-only git', () => {
    const d = m.evaluate(def('git.status', 'git'));
    expect(d.allowed).toBe(true);
  });

  it('unsubscribe works', () => {
    const fn = vi.fn();
    const off = m.onChange(fn);
    off();
    m.setMode('execute');
    expect(fn).not.toHaveBeenCalled();
  });
});
