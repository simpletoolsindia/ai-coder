import { describe, it, expect } from 'vitest';
import { LoopGuard } from '../../src/core/loop-guard.js';
import type { AgentResult, AgentStep } from '../../src/core/types.js';

function step(toolName?: string, content = ''): AgentStep {
  return {
    index: 0,
    choice: {
      index: 0,
      message: {
        role: 'assistant',
        content,
        tool_calls: toolName
          ? [
              {
                id: 'c1',
                type: 'function',
                function: { name: toolName, arguments: '{}' },
              },
            ]
          : undefined,
      },
      finishReason: 'tool_calls',
    },
    toolResults: [],
    startedAt: 0,
    durationMs: 0,
  };
}

describe('LoopGuard', () => {
  it('does not flag empty or single steps', () => {
    const g = new LoopGuard();
    expect(g.inspect([]).detected).toBe(false);
    expect(g.inspect([step('fs.read')]).detected).toBe(false);
  });

  it('detects repeated identical tool calls', () => {
    const g = new LoopGuard({ maxRepeatedCalls: 3 });
    const steps: AgentStep[] = [
      step('fs.read', 'first'),
      step('fs.read', 'first'),
      step('fs.read', 'first'),
    ];
    const d = g.inspect(steps);
    expect(d.detected).toBe(true);
    expect(d.reason).toBe('repeated-tool');
  });

  it('detects oscillation', () => {
    const g = new LoopGuard();
    const steps: AgentStep[] = [
      step('fs.read', 'a'),
      step('fs.list', 'b'),
      step('fs.read', 'a'),
      step('fs.list', 'b'),
    ];
    const d = g.inspect(steps);
    expect(d.detected).toBe(true);
    expect(d.reason).toBe('oscillation');
  });

  it('detects no-progress text repetition', () => {
    const g = new LoopGuard();
    const steps: AgentStep[] = [step(undefined, 'hello'), step(undefined, 'hello')];
    const d = g.inspect(steps);
    expect(d.detected).toBe(true);
    expect(d.reason).toBe('no-progress');
  });

  it('off mode disables detection', () => {
    const g = new LoopGuard({ mode: 'off' });
    const steps: AgentStep[] = [step('a', 'x'), step('a', 'x'), step('a', 'x')];
    expect(g.inspect(steps).detected).toBe(false);
  });

  it('shouldForceExit strict mode', () => {
    const g = new LoopGuard({ mode: 'strict' });
    expect(g.shouldForceExit({ detected: true, reason: 'repeated-tool' }, 1)).toBe(true);
  });

  it('shouldForceExit lenient mode waits for maxRepeated', () => {
    const g = new LoopGuard({ mode: 'lenient', maxRepeatedCalls: 3 });
    expect(g.shouldForceExit({ detected: true, reason: 'repeated-tool' }, 1)).toBe(false);
    expect(g.shouldForceExit({ detected: true, reason: 'repeated-tool' }, 3)).toBe(true);
  });

  it('completionCheck passes good results', () => {
    const g = new LoopGuard();
    const result: AgentResult = { ok: true, text: 'done', steps: [], usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } };
    expect(g.completionCheck(result, []).complete).toBe(false);
    result.steps = [step('fs.read')];
    expect(g.completionCheck(result, result.steps).complete).toBe(true);
  });

  it('completionCheck fails when last tool failed and no follow-up', () => {
    const g = new LoopGuard();
    const s = step('fs.read');
    s.toolResults = [{ ok: false, error: 'oops' }];
    const result: AgentResult = { ok: true, text: '', steps: [s], usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } };
    const c = g.completionCheck(result, result.steps);
    expect(c.complete).toBe(false);
    expect(c.retry).toBe(true);
  });
});
