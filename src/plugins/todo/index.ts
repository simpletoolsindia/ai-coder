import type { Json, Plugin, Tool, ToolResult } from '../../core/types.js';

export interface TodoItem {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  createdAt: number;
  updatedAt: number;
}

class TodoStore {
  items: TodoItem[] = [];

  size(): number {
    return this.items.length;
  }

  list(filter?: { status?: TodoItem['status'] }): TodoItem[] {
    return filter?.status ? this.items.filter((i) => i.status === filter.status) : [...this.items];
  }

  add(content: string): TodoItem {
    const now = Date.now();
    const item: TodoItem = {
      id: `todo_${now.toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      content,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };
    this.items.push(item);
    return item;
  }

  update(id: string, patch: Partial<TodoItem>): TodoItem | undefined {
    const item = this.items.find((i) => i.id === id);
    if (!item) return undefined;
    Object.assign(item, patch, { updatedAt: Date.now() });
    return item;
  }

  remove(id: string): boolean {
    const before = this.items.length;
    this.items = this.items.filter((i) => i.id !== id);
    return this.items.length < before;
  }

  clear(): void {
    this.items = [];
  }

  next(): TodoItem | undefined {
    return this.items.find((i) => i.status === 'pending' || i.status === 'in_progress');
  }
}

export { TodoStore };

let globalStore: TodoStore | undefined;

function store(): TodoStore {
  if (!globalStore) globalStore = new TodoStore();
  return globalStore;
}

export function getTodoStore(): TodoStore {
  return store();
}

export function setTodoStore(s: TodoStore): void {
  globalStore = s;
}

const todoAddTool: Tool = {
  definition: {
    id: 'todo.add',
    name: 'Add Todo',
    description: 'Add a todo item.',
    category: 'todo',
    pluginId: 'todo',
    parameters: {
      type: 'object',
      properties: { content: { type: 'string' } },
      required: ['content'],
    },
    keywords: ['todo', 'task', 'add'],
  },
  async execute(args: Json): Promise<ToolResult> {
    const a = args as { content?: string };
    if (!a.content) return { ok: false, error: 'content is required' };
    return { ok: true, data: store().add(a.content) };
  },
};

const todoListTool: Tool = {
  definition: {
    id: 'todo.list',
    name: 'List Todos',
    description: 'List todo items, optionally filtered by status.',
    category: 'todo',
    pluginId: 'todo',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'cancelled'] },
      },
    },
    keywords: ['todo', 'list', 'show', 'tasks'],
  },
  async execute(args: Json): Promise<ToolResult> {
    const a = args as { status?: TodoItem['status'] };
    return { ok: true, data: { items: store().list(a.status ? { status: a.status } : undefined) } };
  },
};

const todoUpdateTool: Tool = {
  definition: {
    id: 'todo.update',
    name: 'Update Todo',
    description: 'Update a todo status.',
    category: 'todo',
    pluginId: 'todo',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'cancelled'] },
        content: { type: 'string' },
      },
      required: ['id'],
    },
    keywords: ['todo', 'update', 'mark', 'complete'],
  },
  async execute(args: Json): Promise<ToolResult> {
    const a = args as { id?: string; status?: TodoItem['status']; content?: string };
    if (!a.id) return { ok: false, error: 'id is required' };
    const patch: Partial<TodoItem> = {};
    if (a.status) patch.status = a.status;
    if (a.content) patch.content = a.content;
    const updated = store().update(a.id, patch);
    if (!updated) return { ok: false, error: `Todo "${a.id}" not found` };
    return { ok: true, data: updated };
  },
};

const todoRemoveTool: Tool = {
  definition: {
    id: 'todo.remove',
    name: 'Remove Todo',
    description: 'Remove a todo item.',
    category: 'todo',
    pluginId: 'todo',
    dangerous: true,
    parameters: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
    keywords: ['todo', 'remove', 'delete'],
  },
  async execute(args: Json): Promise<ToolResult> {
    const a = args as { id?: string };
    if (!a.id) return { ok: false, error: 'id is required' };
    return { ok: store().remove(a.id), data: { id: a.id } };
  },
};

export const todoPlugin: Plugin = {
  manifest: {
    id: 'todo',
    version: '1.0.0',
    description: 'Lightweight todo list for the agent to track work.',
    tools: ['todo.add', 'todo.list', 'todo.update', 'todo.remove'],
    lazy: true,
    enabled: true,
    triggers: ['todo', 'task', 'plan', 'checklist', 'steps'],
    tags: ['productivity'],
  },
  async setup(ctx) {
    const tools = [todoAddTool, todoListTool, todoUpdateTool, todoRemoveTool];
    for (const t of tools) {
      if (!ctx.tools.has(t.definition.id)) ctx.tools.register(t);
    }
    return { tools };
  },
  async shutdown() {
    store().clear();
  },
};

export const __todoTesting = { TodoStore };
