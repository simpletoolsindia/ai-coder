import { describe, it, expect, beforeEach } from 'vitest';
import { getTodoStore, setTodoStore, TodoStore, todoPlugin } from '../../src/plugins/todo/index.js';
import { inMemoryIO, SettingsManager } from '../../src/core/settings-manager.js';
import { ToolRegistry } from '../../src/core/tool-resolver.js';
import { CommandRegistry } from '../../src/core/command-registry.js';
import { PermissionEngine } from '../../src/core/permission-engine.js';
import { EventBus } from '../../src/core/event-bus.js';

describe('TodoStore', () => {
  let store: TodoStore;
  beforeEach(() => {
    store = new TodoStore();
    setTodoStore(store);
  });

  it('add creates a pending item', () => {
    const t = store.add('write tests');
    expect(t.status).toBe('pending');
  });

  it('list with filter', () => {
    store.add('a');
    const b = store.add('b');
    store.update(b.id, { status: 'in_progress' });
    expect(store.list({ status: 'in_progress' })).toHaveLength(1);
  });

  it('update changes status', () => {
    const t = store.add('a');
    const updated = store.update(t.id, { status: 'completed' });
    expect(updated?.status).toBe('completed');
  });

  it('remove returns true on success', () => {
    const t = store.add('a');
    expect(store.remove(t.id)).toBe(true);
    expect(store.size()).toBe(0);
  });

  it('next returns first pending', () => {
    store.add('a');
    store.add('b');
    expect(store.next()?.content).toBe('a');
  });

  it('clear empties the store', () => {
    store.add('a');
    store.clear();
    expect(store.size()).toBe(0);
  });

  it('getTodoStore returns the singleton', () => {
    const a = getTodoStore();
    const b = getTodoStore();
    expect(a).toBe(b);
  });
});

describe('todo plugin', () => {
  it('setup registers tools', async () => {
    const settings = new SettingsManager({ io: inMemoryIO(), fileName: 's.json', configDir: '/tmp/x', autoPersist: false });
    const tools = new ToolRegistry({ settings });
    await todoPlugin.setup!({
      container: undefined as never,
      events: new EventBus(),
      logger: undefined as never,
      settings,
      providers: undefined as never,
      tools,
      commands: new CommandRegistry(),
      permissions: new PermissionEngine({ settings }),
    });
    expect(tools.has('todo.add')).toBe(true);
    expect(tools.has('todo.list')).toBe(true);
  });
});
