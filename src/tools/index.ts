import type { Plugin } from '../core/types.js';
import { filesystemTools } from './filesystem/index.js';
import { searchTools } from './search/index.js';
import { terminalTools } from './terminal/index.js';

export const coreToolsPlugin: Plugin = {
  manifest: {
    id: 'core-tools',
    version: '1.0.0',
    description: 'Built-in filesystem, search and terminal tools.',
    tools: filesystemTools.map((t) => t.definition.id).concat(searchTools.map((t) => t.definition.id), terminalTools.map((t) => t.definition.id)),
    lazy: true,
    enabled: true,
    triggers: ['file', 'read', 'write', 'edit', 'search', 'find', 'terminal', 'run command'],
    tags: ['core', 'tools'],
  },
  async setup(ctx) {
    ctx.tools.registerMany([...filesystemTools, ...searchTools, ...terminalTools]);
    return { tools: [...filesystemTools, ...searchTools, ...terminalTools] };
  },
  async shutdown(ctx) {
    for (const t of [...filesystemTools, ...searchTools, ...terminalTools]) {
      ctx.tools.unregister(t.definition.id);
    }
  },
};
