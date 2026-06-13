import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { LearningStore } from '../../src/core/learning.js';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ai-by-learn-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('LearningStore', () => {
  it('loads with empty data when file missing', async () => {
    const s = new LearningStore({ filePath: join(dir, 'AGENT.md') });
    await s.load();
    expect(s.summary()).toEqual({ samples: 0, patterns: 0, hints: 0 });
  });

  it('records samples and tracks patterns', async () => {
    const s = new LearningStore({ filePath: join(dir, 'AGENT.md') });
    await s.load();
    s.record({ timestamp: 1, prompt: 'fix the bug', toolsUsed: ['fs.read'], durationMs: 100, ok: true });
    s.record({ timestamp: 2, prompt: 'fix another', toolsUsed: ['fs.edit'], durationMs: 200, ok: true });
    s.record({ timestamp: 3, prompt: 'find files', toolsUsed: ['search.glob'], durationMs: 50, ok: true });
    expect(s.summary().samples).toBe(3);
    expect(s.topPatterns().length).toBeGreaterThan(0);
  });

  it('flushes AGENT.md and samples file', async () => {
    const file = join(dir, 'AGENT.md');
    const s = new LearningStore({ filePath: file });
    await s.load();
    s.addHint('User prefers TypeScript');
    s.record({ timestamp: 1, prompt: 'fix bug', toolsUsed: ['fs.edit'], durationMs: 100, ok: true });
    await s.flush();
    expect(existsSync(file)).toBe(true);
  });

  it('skips duplicate hints', () => {
    const s = new LearningStore({ filePath: join(dir, 'AGENT.md') });
    s.addHint('hint');
    s.addHint('hint');
    expect(s.summary().hints).toBe(1);
  });
});
