import { describe, it, expect } from 'vitest';
import { ToolRag } from '../../src/core/tool-rag.js';
import type { Tool } from '../../src/core/types.js';

function make(id: string, desc: string, keywords: string[]): Tool {
  return {
    definition: {
      id,
      name: id,
      description: desc,
      category: 'filesystem',
      pluginId: 'core',
      parameters: { type: 'object', properties: {} },
      keywords,
    },
    execute: async () => ({ ok: true }),
  };
}

describe('ToolRag', () => {
  it('builds and selects top tools for a request', () => {
    const rag = new ToolRag({ maxTools: 3 });
    rag.build([
      make('fs.read', 'Read a file', ['read', 'file', 'cat']),
      make('fs.write', 'Write a file', ['write', 'save']),
      make('web.search', 'Search the web', ['web', 'search', 'internet']),
      make('terminal.run', 'Run a command', ['bash', 'shell']),
    ]);
    const selected = rag.select('read a file from disk');
    expect(selected.length).toBeGreaterThan(0);
    expect(selected[0]?.id).toBe('fs.read');
  });

  it('respects alwaysInclude', () => {
    const rag = new ToolRag({ maxTools: 2, alwaysInclude: ['terminal.run'] });
    rag.build([
      make('fs.read', 'Read a file', ['read']),
      make('terminal.run', 'Run a command', ['bash']),
    ]);
    const selected = rag.select('search the web');
    expect(selected.find((s) => s.id === 'terminal.run')).toBeDefined();
  });

  it('returns zero tools when nothing matches', () => {
    const rag = new ToolRag({ maxTools: 5 });
    rag.build([make('a', 'foo', ['foo'])]);
    const selected = rag.select('zzzz');
    expect(selected.length).toBe(0);
  });
});
