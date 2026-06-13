import { describe, it, expect, beforeEach } from 'vitest';
import { SettingsManager, inMemoryIO, SettingsValidationError } from '../../src/core/settings-manager.js';
import { EventBus } from '../../src/core/event-bus.js';

describe('SettingsManager', () => {
  let io: ReturnType<typeof inMemoryIO>;
  let settings: SettingsManager;

  beforeEach(() => {
    io = inMemoryIO();
    settings = new SettingsManager({ io, fileName: 'settings.json', configDir: '/tmp/x', autoPersist: false });
  });

  it('returns defaults when no file exists', async () => {
    const s = await settings.load();
    expect(s.general.theme).toBe('auto');
    expect(s.permissions.default).toBe('ask');
  });

  it('persists and reads back', async () => {
    await settings.set('general', { ...settings.get('general'), theme: 'dark', verbose: true, maxIterations: 10 });
    await settings.save();
    const newSettings = new SettingsManager({ io, fileName: 'settings.json', configDir: '/tmp/x', autoPersist: false });
    await newSettings.load();
    expect(newSettings.get('general').theme).toBe('dark');
  });

  it('rejects invalid data on load', async () => {
    io.write('/tmp/x/settings.json', JSON.stringify({ general: { maxIterations: -1 } }));
    const s2 = new SettingsManager({ io, fileName: 'settings.json', configDir: '/tmp/x' });
    await expect(s2.load()).rejects.toBeInstanceOf(SettingsValidationError);
  });

  it('rejects invalid data on set', async () => {
    await expect(settings.set('general', { theme: 'invalid' as never, verbose: false, maxIterations: 1 })).rejects.toBeInstanceOf(
      SettingsValidationError,
    );
  });

  it('update merges via callback', async () => {
    await settings.update('general', (cur) => ({ ...cur, theme: 'light' }));
    expect(settings.get('general').theme).toBe('light');
  });

  it('plugin enable / disable toggles', async () => {
    expect(settings.isPluginEnabled('memory')).toBe(true);
    await settings.setPluginEnabled('memory', false);
    expect(settings.isPluginEnabled('memory')).toBe(false);
  });

  it('plugin config can be set and retrieved', async () => {
    await settings.setPluginConfig('web-search', { provider: 'duckduckgo' });
    expect(settings.getPluginConfig('web-search')).toEqual({ provider: 'duckduckgo' });
  });

  it('tool enable / disable works', async () => {
    expect(settings.isToolEnabled('fs.write')).toBe(true);
    await settings.setToolEnabled('fs.write', false);
    expect(settings.isToolEnabled('fs.write')).toBe(false);
  });

  it('notifies listeners on change', async () => {
    const bus = new EventBus();
    const s2 = new SettingsManager({ io, fileName: 'settings.json', configDir: '/tmp/x', events: bus, autoPersist: false });
    let received: unknown = undefined;
    s2.onChange((s) => (received = s));
    await s2.set('general', { ...s2.get('general'), theme: 'light' });
    expect(received).toBeDefined();
  });

  it('emits settings.changed on the event bus', async () => {
    const bus = new EventBus();
    const s2 = new SettingsManager({ io, fileName: 'settings.json', configDir: '/tmp/x', events: bus, autoPersist: false });
    let emitted = false;
    bus.on('settings.changed', () => (emitted = true));
    await s2.set('general', { ...s2.get('general'), theme: 'light' });
    expect(emitted).toBe(true);
  });

  it('throws on bad JSON in file', async () => {
    io.write('/tmp/x/settings.json', '{ bad');
    const s2 = new SettingsManager({ io, fileName: 'settings.json', configDir: '/tmp/x' });
    await expect(s2.load()).rejects.toThrow(/Failed to parse settings/);
  });
});
