import type { Plugin } from '../core/types.js';
import { filesystemTools } from './filesystem/index.js';
import { searchTools } from './search/index.js';
import { terminalTools } from './terminal/index.js';
import { gitTools } from './git/index.js';

export const coreToolsPlugin: Plugin = {
  manifest: {
    id: 'core-tools',
    version: '1.0.0',
    description: 'Built-in filesystem, search, terminal and git tools.',
    tools: [
      ...filesystemTools.map((t) => t.definition.id),
      ...searchTools.map((t) => t.definition.id),
      ...terminalTools.map((t) => t.definition.id),
      ...gitTools.map((t) => t.definition.id),
    ],
    lazy: true,
    enabled: true,
    triggers: ['file', 'read', 'write', 'edit', 'search', 'find', 'terminal', 'run command', 'git', 'diff'],
    tags: ['core', 'tools'],
  },
  async setup(ctx) {
    const all = [...filesystemTools, ...searchTools, ...terminalTools, ...gitTools];
    ctx.tools.registerMany(all);
    return { tools: all };
  },
  async shutdown(ctx) {
    for (const t of [...filesystemTools, ...searchTools, ...terminalTools, ...gitTools]) {
      ctx.tools.unregister(t.definition.id);
    }
  },
};
