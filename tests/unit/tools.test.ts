import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { filesystemReadTool, filesystemWriteTool, filesystemEditTool, filesystemDeleteTool, filesystemRenameTool, filesystemListTool } from '../../src/tools/filesystem/index.js';
import { searchGlobTool, searchGrepTool } from '../../src/tools/search/index.js';
import { terminalRunTool } from '../../src/tools/terminal/index.js';
import type { ToolExecutionContext } from '../../src/core/types.js';

let dir: string;
let ctx: ToolExecutionContext;
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'ai-by-tools-'));
  ctx = {
    cwd: dir,
    caller: 'test',
    sessionId: 's',
    permissions: { action: 'allow' },
    logger: { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined, child: () => ({} as never) } as never,
  };
  await fs.writeFile(join(dir, 'a.txt'), 'hello world', 'utf-8');
  await fs.writeFile(join(dir, 'b.txt'), 'hello again', 'utf-8');
  await fs.mkdir(join(dir, 'sub'));
  await fs.writeFile(join(dir, 'sub', 'c.txt'), 'hello nested', 'utf-8');
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('filesystem tools', () => {
  it('reads a file', async () => {
    const res = await filesystemReadTool.execute({ path: 'a.txt' }, ctx);
    expect(res.ok).toBe(true);
    expect((res.data as { content: string }).content).toBe('hello world');
  });

  it('returns an error for missing file', async () => {
    const res = await filesystemReadTool.execute({ path: 'missing.txt' }, ctx);
    expect(res.ok).toBe(false);
  });

  it('writes a file', async () => {
    const res = await filesystemWriteTool.execute({ path: 'new.txt', content: 'data' }, ctx);
    expect(res.ok).toBe(true);
    const content = await fs.readFile(join(dir, 'new.txt'), 'utf-8');
    expect(content).toBe('data');
  });

  it('creates parent directories when createDirs', async () => {
    const res = await filesystemWriteTool.execute(
      { path: 'deep/nested/file.txt', content: 'x', createDirs: true },
      ctx,
    );
    expect(res.ok).toBe(true);
    expect(await fs.readFile(join(dir, 'deep/nested/file.txt'), 'utf-8')).toBe('x');
  });

  it('edits a file', async () => {
    const res = await filesystemEditTool.execute(
      { path: 'a.txt', oldText: 'hello', newText: 'bye' },
      ctx,
    );
    expect(res.ok).toBe(true);
    expect(await fs.readFile(join(dir, 'a.txt'), 'utf-8')).toBe('bye world');
  });

  it('edit fails when text not found', async () => {
    const res = await filesystemEditTool.execute(
      { path: 'a.txt', oldText: 'nope', newText: 'x' },
      ctx,
    );
    expect(res.ok).toBe(false);
  });

  it('edit with replaceAll', async () => {
    await fs.writeFile(join(dir, 'a.txt'), 'a-a-a', 'utf-8');
    const res = await filesystemEditTool.execute(
      { path: 'a.txt', oldText: 'a', newText: 'b', replaceAll: true },
      ctx,
    );
    expect(res.ok).toBe(true);
    expect(await fs.readFile(join(dir, 'a.txt'), 'utf-8')).toBe('b-b-b');
  });

  it('deletes a file', async () => {
    const res = await filesystemDeleteTool.execute({ path: 'a.txt' }, ctx);
    expect(res.ok).toBe(true);
  });

  it('renames a file', async () => {
    const res = await filesystemRenameTool.execute({ from: 'a.txt', to: 'renamed.txt' }, ctx);
    expect(res.ok).toBe(true);
    expect((await fs.readdir(dir)).sort()).toContain('renamed.txt');
  });

  it('lists a directory', async () => {
    const res = await filesystemListTool.execute({ path: '.' }, ctx);
    expect(res.ok).toBe(true);
    const data = res.data as { entries: { path: string; type: string }[] };
    expect(data.entries.some((e) => e.path === 'a.txt')).toBe(true);
  });

  it('writeTool requires content', async () => {
    const res = await filesystemWriteTool.execute({ path: 'a.txt' }, ctx);
    expect(res.ok).toBe(false);
  });
});

describe('search tools', () => {
  it('glob finds files', async () => {
    const res = await searchGlobTool.execute({ pattern: '**/*.txt' }, ctx);
    expect(res.ok).toBe(true);
    const data = res.data as { matches: string[] };
    expect(data.matches.length).toBeGreaterThanOrEqual(3);
  });

  it('glob supports ignore patterns', async () => {
    const res = await searchGlobTool.execute({ pattern: '**/*', ignore: ['**/sub/**'] }, ctx);
    const data = res.data as { matches: string[] };
    expect(data.matches.every((m) => !m.includes('sub'))).toBe(true);
  });

  it('grep finds matching lines', async () => {
    const res = await searchGrepTool.execute({ pattern: 'hello' }, ctx);
    const data = res.data as { matches: { text: string }[] };
    expect(data.matches.length).toBeGreaterThanOrEqual(2);
  });

  it('grep is case insensitive by default', async () => {
    const res = await searchGrepTool.execute({ pattern: 'HELLO' }, ctx);
    const data = res.data as { matches: unknown[] };
    expect(data.matches.length).toBeGreaterThan(0);
  });
});

describe('terminal tool', () => {
  it('runs a command and captures stdout', async () => {
    const res = await terminalRunTool.execute({ command: 'echo hello' }, ctx);
    expect(res.ok).toBe(true);
    expect((res.data as { stdout: string }).stdout.trim()).toBe('hello');
  });

  it('reports non-zero exit codes', async () => {
    const res = await terminalRunTool.execute({ command: 'exit 7' }, ctx);
    expect(res.ok).toBe(false);
  });

  it('refuses blocked commands', async () => {
    const res = await terminalRunTool.execute({ command: 'rm -rf /' }, ctx);
    expect(res.ok).toBe(false);
  });
});
