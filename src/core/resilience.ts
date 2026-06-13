/**
 * Resilient tool invocation. Wraps a tool execute function with:
 *  - structured argument validation
 *  - bounded retries on transient failures
 *  - idempotency keys so duplicate calls collapse
 *  - tool result validation (must conform to ToolResult)
 */
import type { Json, Tool, ToolDefinition, ToolExecutionContext, ToolResult } from './types.js';

export interface RetryPolicy {
  maxAttempts: number;
  backoffMs: (attempt: number) => number;
  retryOn?: (err: unknown) => boolean;
}

export const defaultRetry: RetryPolicy = {
  maxAttempts: 3,
  backoffMs: (n) => Math.min(50 * 2 ** n, 2000),
  retryOn: (err) => {
    const msg = (err as Error)?.message ?? '';
    return /ECONN|ETIMEDOUT|ENOTFOUND|aborted|timeout|fetch failed/i.test(msg);
  },
};

export interface ResilienceOptions {
  retry?: RetryPolicy;
  idempotencyTtlMs?: number;
  validateArgs?: (args: Json, def: ToolDefinition) => string | null;
}

const cache = new Map<string, { result: ToolResult; ts: number }>();

export async function resilientInvoke(
  tool: Tool,
  args: Json,
  ctx: ToolExecutionContext,
  opts: ResilienceOptions = {},
): Promise<ToolResult> {
  const retry = opts.retry ?? defaultRetry;
  const validate = opts.validateArgs ?? validateArgsAgainstSchema;

  // Validate arguments structurally
  const validationError = validate(args, tool.definition);
  if (validationError) {
    return { ok: false, error: `Invalid arguments: ${validationError}` };
  }

  // Idempotency: same tool + same args in TTL => return cached result
  if (opts.idempotencyTtlMs && opts.idempotencyTtlMs > 0) {
    const key = `${tool.definition.id}:${JSON.stringify(args)}`;
    const cached = cache.get(key);
    if (cached && Date.now() - cached.ts < opts.idempotencyTtlMs) {
      return { ...cached.result, partial: false };
    }

    let lastError: Error | undefined;
    for (let attempt = 0; attempt < retry.maxAttempts; attempt++) {
      try {
        const result = await tool.execute(args, ctx);
        // Validate result shape
        if (typeof result?.ok !== 'boolean') {
          throw new Error('Tool returned a malformed result');
        }
        if (result.ok) {
          cache.set(key, { result, ts: Date.now() });
        }
        return result;
      } catch (err) {
        lastError = err as Error;
        if (attempt < retry.maxAttempts - 1 && retry.retryOn?.(err)) {
          await sleep(retry.backoffMs(attempt));
          continue;
        }
        break;
      }
    }
    return { ok: false, error: lastError?.message ?? 'Tool failed' };
  }

  let lastError: Error | undefined;
  for (let attempt = 0; attempt < retry.maxAttempts; attempt++) {
    try {
      const result = await tool.execute(args, ctx);
      if (typeof result?.ok !== 'boolean') {
        throw new Error('Tool returned a malformed result');
      }
      return result;
    } catch (err) {
      lastError = err as Error;
      if (attempt < retry.maxAttempts - 1 && retry.retryOn?.(err)) {
        await sleep(retry.backoffMs(attempt));
        continue;
      }
      break;
    }
  }
  return { ok: false, error: lastError?.message ?? 'Tool failed' };
}

export function clearIdempotencyCache(): void {
  cache.clear();
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function validateArgsAgainstSchema(args: Json, def: ToolDefinition): string | null {
  if (!def.parameters || def.parameters.type !== 'object') return null;
  if (typeof args !== 'object' || args === null || Array.isArray(args)) {
    return 'expected an object';
  }
  const a = args as Record<string, unknown>;
  for (const required of def.parameters.required ?? []) {
    if (!(required in a)) {
      return `missing required property "${required}"`;
    }
  }
  for (const [key, propSchema] of Object.entries(def.parameters.properties)) {
    if (!(key in a)) continue;
    const v = a[key];
    const expected = propSchema.type;
    if (expected === 'string' && typeof v !== 'string') {
      return `"${key}" must be a string`;
    }
    if (expected === 'number' && typeof v !== 'number') {
      return `"${key}" must be a number`;
    }
    if (expected === 'integer' && (typeof v !== 'number' || !Number.isInteger(v))) {
      return `"${key}" must be an integer`;
    }
    if (expected === 'boolean' && typeof v !== 'boolean') {
      return `"${key}" must be a boolean`;
    }
    if (expected === 'array' && !Array.isArray(v)) {
      return `"${key}" must be an array`;
    }
    if (expected === 'object' && (typeof v !== 'object' || v === null || Array.isArray(v))) {
      return `"${key}" must be an object`;
    }
  }
  return null;
}

export const __resilienceTesting = { resilientInvoke, validateArgsAgainstSchema };
