import { describe, it, expect } from 'vitest';
import { PromptBuilder, DEFAULT_IDENTITY } from '../../src/core/prompt-builder.js';
import { filesystemReadTool, filesystemWriteTool } from '../../src/tools/filesystem/index.js';

describe('PromptBuilder', () => {
  it('builds a system prompt with identity', () => {
    const p = new PromptBuilder();
    const out = p.build();
    expect(out).toContain(DEFAULT_IDENTITY.split('.')[0] ?? '');
  });

  it('includes environment block', () => {
    const p = new PromptBuilder({ cwd: '/x', platform: 'darwin' });
    const out = p.build();
    expect(out).toContain('Working directory: /x');
    expect(out).toContain('Platform: darwin');
  });

  it('includes capabilities', () => {
    const p = new PromptBuilder({ capabilities: ['read files', 'run shell'] });
    const out = p.build();
    expect(out).toContain('read files');
    expect(out).toContain('run shell');
  });

  it('lists tools in the prompt', () => {
    const p = new PromptBuilder();
    const out = p.build([filesystemReadTool, filesystemWriteTool]);
    expect(out).toContain('fs.read');
    expect(out).toContain('fs.write');
  });

  it('extras are appended in order', () => {
    const p = new PromptBuilder({ extras: ['A', 'B'] });
    const out = p.build();
    const idxA = out.indexOf('A');
    const idxB = out.indexOf('B');
    expect(idxA).toBeGreaterThan(-1);
    expect(idxB).toBeGreaterThan(idxA);
  });

  it('with returns a new builder', () => {
    const p = new PromptBuilder();
    const p2 = p.with({ cwd: '/x' });
    expect(p2).not.toBe(p);
    expect(p2.build()).toContain('Working directory: /x');
  });

  it('uses custom identity', () => {
    const p = new PromptBuilder({ identity: 'CUSTOM_IDENTITY' });
    expect(p.build()).toContain('CUSTOM_IDENTITY');
  });
});
