/**
 * Loop guard: detect when the agent is repeating itself and force a
 * graceful exit (or retry) when the work isn't actually complete.
 *
 * Modes:
 *  - "strict": exit on the first detected loop
 *  - "lenient": warn and continue up to N times, then exit
 *  - "off":    disabled
 *
 * The guard also runs a "completion check" at the end: if the agent
 * declared success but the last tool call failed or no progress was made,
 * it forces a retry before exiting.
 */
import type { AgentResult, AgentStep } from './types.js';

export interface LoopGuardOptions {
  mode?: 'strict' | 'lenient' | 'off';
  maxRepeatedCalls?: number;
  warnAfter?: number;
}

export interface LoopDetection {
  detected: boolean;
  reason?: 'repeated-tool' | 'no-progress' | 'oscillation' | 'completion-mismatch';
  detail?: string;
}

export interface CompletionCheckResult {
  complete: boolean;
  reason: string;
  retry: boolean;
}

export class LoopGuard {
  private mode: 'strict' | 'lenient' | 'off';
  private maxRepeated: number;
  private warnAfter: number;

  constructor(opts: LoopGuardOptions = {}) {
    this.mode = opts.mode ?? 'lenient';
    this.maxRepeated = opts.maxRepeatedCalls ?? 3;
    this.warnAfter = opts.warnAfter ?? 2;
  }

  setMode(mode: 'strict' | 'lenient' | 'off'): void {
    this.mode = mode;
  }

  /**
   * Inspect the steps so far and return whether a loop is detected.
   */
  inspect(steps: AgentStep[]): LoopDetection {
    if (this.mode === 'off' || steps.length < 2) return { detected: false };
    const last = steps[steps.length - 1];
    if (!last) return { detected: false };

    // Repeated identical tool calls (use a separate, longer window for oscillation)
    const recent = steps.slice(-this.maxRepeated);
    const toolSignatures = recent
      .flatMap((s) => (s.choice.message.tool_calls ?? []).map((tc) => `${tc.function.name}:${tc.function.arguments}`))
      .filter(Boolean);
    const counts = new Map<string, number>();
    for (const sig of toolSignatures) counts.set(sig, (counts.get(sig) ?? 0) + 1);
    for (const [sig, count] of counts) {
      if (count >= this.maxRepeated) {
        return {
          detected: true,
          reason: 'repeated-tool',
          detail: `Tool call "${sig}" repeated ${count} times`,
        };
      }
    }

    // Oscillation: alternating between two tool calls in the last 4 steps
    if (steps.length >= 4) {
      const lastFour = steps.slice(-4);
      const names = lastFour.map((s) => s.choice.message.tool_calls?.[0]?.function.name);
      const [a, b, c, d] = names;
      if (a && b && c && d && a === c && b === d && a !== b) {
        return {
          detected: true,
          reason: 'oscillation',
          detail: `Alternating between "${a}" and "${b}"`,
        };
      }
    }

    // No progress: same content without tool calls and identical
    if (!last.choice.message.tool_calls || last.choice.message.tool_calls.length === 0) {
      const prevText = steps[steps.length - 2]?.choice.message.content ?? '';
      if (prevText === last.choice.message.content && prevText.length > 0) {
        return {
          detected: true,
          reason: 'no-progress',
          detail: 'Assistant produced identical text twice without making progress',
        };
      }
    }
    return { detected: false };
  }

  /**
   * Verify the agent actually completed the user's request. If the agent
   * claimed success but the last action failed or no real work was done,
   * ask the planner to retry.
   */
  completionCheck(result: AgentResult, steps: AgentStep[]): CompletionCheckResult {
    if (!result.ok) {
      return { complete: false, reason: result.error ?? 'agent failed', retry: false };
    }
    if (steps.length === 0) {
      return { complete: false, reason: 'no steps taken', retry: true };
    }
    const lastStep = steps[steps.length - 1];
    if (!lastStep) {
      return { complete: false, reason: 'no last step', retry: true };
    }
    const hasFailedTool = lastStep.toolResults.some((r) => !r.ok);
    if (hasFailedTool && (lastStep.choice.message.content?.length ?? 0) < 20) {
      return {
        complete: false,
        reason: 'agent declared success but last tool call failed',
        retry: true,
      };
    }
    const noToolsRan = steps.every((s) => s.toolResults.length === 0);
    if (noToolsRan && (result.text?.trim().length ?? 0) === 0) {
      return { complete: false, reason: 'no tools ran and response is empty', retry: true };
    }
    return { complete: true, reason: 'looks good', retry: false };
  }

  shouldForceExit(detection: LoopDetection, occurrence: number): boolean {
    if (this.mode === 'off' || !detection.detected) return false;
    if (this.mode === 'strict') return true;
    return occurrence >= this.maxRepeated;
  }
}

export const __loopGuardTesting = { LoopGuard };
