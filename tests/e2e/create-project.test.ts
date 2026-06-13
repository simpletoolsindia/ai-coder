import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, promises as fs, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Runtime } from '../../src/core/runtime.js';
import { EventBus } from '../../src/core/event-bus.js';
import { Logger, silentTransport } from '../../src/core/logger.js';
import { PluginManager } from '../../src/core/plugin-manager.js';
import { coreToolsPlugin } from '../../src/tools/index.js';
import { builtInPlugins } from '../../src/plugins/index.js';
import { filesystemTools } from '../../src/tools/filesystem/index.js';
import { searchTools } from '../../src/tools/search/index.js';
import type { ChatResponse, Provider } from '../../src/core/types.js';

/**
 * Simulated provider that walks through a series of tool calls and finally
 * returns the assistant text. The "agent" is scripted but the entire pipeline
 * (planner -> tool resolver -> permissions -> tool execution) is real.
 */
class ScriptedProvider implements Provider {
  id = 'scripted';
  kind = 'openai' as const;
  name = 'scripted';
  private steps: ChatResponse[];
  constructor(steps: ChatResponse[]) {
    this.steps = steps;
  }
  async chat(): Promise<ChatResponse> {
    const next = this.steps.shift();
    if (!next) {
      return { id: '1', model: 'm', choices: [{ index: 0, message: { role: 'assistant', content: '' }, finishReason: 'stop' }] };
    }
    return next;
  }
}

let dir: string;
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'ai-by-e2e-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function makeRuntime(steps: ChatResponse[]): { runtime: Runtime; cleanup: () => void } {
  const bus = new EventBus();
  const logger = new Logger({ level: 'silent', transports: [silentTransport] });
  const r = new Runtime({ logger, events: bus });
  const provider = new ScriptedProvider(steps);
  (r.providers as unknown as { providers: Map<string, Provider> }).providers.set('scripted', provider);
  (r.providers as unknown as { activeId: string }).activeId = 'scripted';
  const pm = new PluginManager({
    settings: r.settings,
    tools: r.tools,
    commands: r.commands,
    permissions: r.permissions,
    events: bus,
    builtins: [coreToolsPlugin, ...builtInPlugins],
  });
  r.plugins = pm;
  r.planner['options'].plugins = pm;
  r.tools.registerMany([...filesystemTools, ...searchTools]);
  return { runtime: r, cleanup: () => undefined };
}

describe('E2E: create project workflow', () => {
  it('creates a project skeleton via tool calls', async () => {
    const { runtime } = makeRuntime([
      // Step 1: create directory structure
      {
        id: '1',
        model: 'm',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: '',
              tool_calls: [
                { id: 'c1', type: 'function', function: { name: 'fs.write', arguments: JSON.stringify({ path: 'package.json', content: '{"name":"demo"}' }) } },
              ],
            },
            finishReason: 'tool_calls',
          },
        ],
      },
      // Step 2: write index.ts
      {
        id: '2',
        model: 'm',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: '',
              tool_calls: [
                { id: 'c2', type: 'function', function: { name: 'fs.write', arguments: JSON.stringify({ path: 'src/index.ts', content: 'export const x = 1;', createDirs: true }) } },
              ],
            },
            finishReason: 'tool_calls',
          },
        ],
      },
      // Step 3: write README
      {
        id: '3',
        model: 'm',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: '',
              tool_calls: [
                { id: 'c3', type: 'function', function: { name: 'fs.write', arguments: JSON.stringify({ path: 'README.md', content: '# Demo' }) } },
              ],
            },
            finishReason: 'tool_calls',
          },
        ],
      },
      // Step 4: done
      {
        id: '4',
        model: 'm',
        choices: [{ index: 0, message: { role: 'assistant', content: 'Project created successfully.' }, finishReason: 'stop' }],
      },
    ]);

    const res = await runtime.run('create a new demo project', { context: { cwd: dir } });
    expect(res.ok).toBe(true);
    expect(res.text).toBe('Project created successfully.');

    expect(existsSync(join(dir, 'package.json'))).toBe(true);
    expect(existsSync(join(dir, 'src/index.ts'))).toBe(true);
    expect(existsSync(join(dir, 'README.md'))).toBe(true);

    const pkg = await fs.readFile(join(dir, 'package.json'), 'utf-8');
    expect(pkg).toContain('demo');
  });

  it('searches and edits an existing file', async () => {
    await fs.writeFile(join(dir, 'index.ts'), 'export const a = 1;\nexport const b = 2;\n', 'utf-8');
    const { runtime } = makeRuntime([
      {
        id: '1',
        model: 'm',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: '',
              tool_calls: [
                { id: 'c1', type: 'function', function: { name: 'search.grep', arguments: JSON.stringify({ pattern: 'export const a' }) } },
              ],
            },
            finishReason: 'tool_calls',
          },
        ],
      },
      {
        id: '2',
        model: 'm',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: '',
              tool_calls: [
                { id: 'c2', type: 'function', function: { name: 'fs.edit', arguments: JSON.stringify({ path: 'index.ts', oldText: 'export const a = 1;', newText: 'export const a = 42;' }) } },
              ],
            },
            finishReason: 'tool_calls',
          },
        ],
      },
      {
        id: '3',
        model: 'm',
        choices: [{ index: 0, message: { role: 'assistant', content: 'Edited.' }, finishReason: 'stop' }],
      },
    ]);
    const res = await runtime.run('find and update a', { context: { cwd: dir } });
    expect(res.ok).toBe(true);
    const content = await fs.readFile(join(dir, 'index.ts'), 'utf-8');
    expect(content).toContain('export const a = 42;');
  });

  it('respects disabled tools', async () => {
    await runtime_settings();
    const { runtime } = makeRuntime([
      {
        id: '1',
        model: 'm',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: '',
              tool_calls: [
                { id: 'c1', type: 'function', function: { name: 'fs.delete', arguments: JSON.stringify({ path: 'whatever' }) } },
              ],
            },
            finishReason: 'tool_calls',
          },
        ],
      },
      {
        id: '2',
        model: 'm',
        choices: [{ index: 0, message: { role: 'assistant', content: 'Tried, but denied.' }, finishReason: 'stop' }],
      },
    ]);
    await runtime.settings.setToolEnabled('fs.delete', false);
    const res = await runtime.run('delete a file', { context: { cwd: dir } });
    expect(res.ok).toBe(true);
    expect(res.text).toBe('Tried, but denied.');
    const steps = res.steps;
    const toolStep = steps[0];
    expect(toolStep?.toolResults[0]?.ok).toBe(false);
  });
});

async function runtime_settings(): Promise<void> {
  // placeholder to avoid unused warnings in describe body
  await Promise.resolve();
}

describe('E2E: switching providers mid-session', () => {
  it('creates with first provider, switches to second, continues', async () => {
    const { runtime } = makeRuntime([
      {
        id: '1',
        model: 'm',
        choices: [{ index: 0, message: { role: 'assistant', content: 'first' }, finishReason: 'stop' }],
      },
    ]);
    expect((await runtime.run('hi')).text).toBe('first');
    // Replace provider
    const newProvider: Provider = {
      id: 'second',
      kind: 'openai',
      name: 'second',
      chat: async () => ({
        id: '1',
        model: 'm',
        choices: [{ index: 0, message: { role: 'assistant', content: 'second' }, finishReason: 'stop' }],
      }),
    };
    runtime.providers.register({ id: 'second', kind: 'openai-compatible', name: 'second' });
    (runtime.providers as unknown as { providers: Map<string, Provider> }).providers.set('second', newProvider);
    runtime.providers.setActive('second');
    expect((await runtime.run('hi')).text).toBe('second');
  });
});
