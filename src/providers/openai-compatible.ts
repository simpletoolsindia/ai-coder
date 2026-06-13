import type {
  ChatChoice,
  ChatMessage,
  ChatRequest,
  ChatResponse,
  Provider,
  ProviderKind,
  ToolCall,
} from '../core/types.js';

export interface OpenAICompatibleOptions {
  id: string;
  name: string;
  kind: ProviderKind;
  baseUrl?: string;
  apiKey?: string;
  headers?: Record<string, string>;
  organization?: string;
  defaultModel?: string;
  temperature?: number;
  maxTokens?: number;
  streaming?: boolean;
  retry?: number;
  extra?: Record<string, unknown>;
  fetchImpl?: typeof fetch;
}

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: {
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }[];
}

interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: unknown;
  };
}

interface OpenAIChatRequest {
  model: string;
  messages: OpenAIMessage[];
  temperature?: number;
  max_tokens?: number;
  tools?: OpenAITool[];
  stream?: boolean;
}

interface OpenAIChatResponse {
  id: string;
  model: string;
  choices: {
    index: number;
    message: OpenAIMessage;
    finish_reason: string | null;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class OpenAICompatibleProvider implements Provider {
  id: string;
  kind: ProviderKind;
  name: string;
  private opts: OpenAICompatibleOptions;
  private fetchImpl: typeof fetch;

  constructor(opts: OpenAICompatibleOptions) {
    this.id = opts.id;
    this.name = opts.name;
    this.kind = opts.kind;
    this.opts = opts;
    this.fetchImpl = opts.fetchImpl ?? (globalThis.fetch as typeof fetch);
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    if (!this.opts.baseUrl) {
      throw new Error(`Provider "${this.id}" has no baseUrl configured`);
    }
    const body: OpenAIChatRequest = {
      model: req.model ?? this.opts.defaultModel ?? 'gpt-4o-mini',
      messages: req.messages.map((m) => this.toOpenAIMessage(m)),
      temperature: req.temperature ?? this.opts.temperature,
      max_tokens: req.maxTokens ?? this.opts.maxTokens,
      tools: req.tools?.map((t) => ({
        type: 'function',
        function: {
          name: t.id,
          description: t.description,
          parameters: t.parameters,
        },
      })),
      stream: false,
    };
    const url = joinUrl(this.opts.baseUrl, '/chat/completions');
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      ...(this.opts.headers ?? {}),
    };
    if (this.opts.apiKey) {
      headers['authorization'] = `Bearer ${this.opts.apiKey}`;
    }
    if (this.opts.organization) {
      headers['openai-organization'] = this.opts.organization;
    }
    const retries = this.opts.retry ?? 0;
    let lastError: Error | undefined;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await this.fetchImpl(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: req.signal,
        });
        if (!res.ok) {
          const text = await safeText(res);
          throw new Error(`Provider "${this.id}" returned ${res.status}: ${text}`);
        }
        const json = (await res.json()) as OpenAIChatResponse;
        return this.fromOpenAIResponse(json);
      } catch (err) {
        lastError = err as Error;
        if (req.signal?.aborted) throw err;
        if (attempt < retries) {
          await sleep(2 ** attempt * 200);
        }
      }
    }
    throw lastError ?? new Error(`Provider "${this.id}" request failed`);
  }

  async listModels(): Promise<string[]> {
    if (!this.opts.baseUrl) return [];
    const url = joinUrl(this.opts.baseUrl, '/models');
    const headers: Record<string, string> = { ...(this.opts.headers ?? {}) };
    if (this.opts.apiKey) headers['authorization'] = `Bearer ${this.opts.apiKey}`;
    const res = await this.fetchImpl(url, { method: 'GET', headers });
    if (!res.ok) return [];
    const json = (await res.json()) as { data: { id: string }[] };
    return json.data.map((m) => m.id);
  }

  private toOpenAIMessage(m: ChatMessage): OpenAIMessage {
    const out: OpenAIMessage = {
      role: m.role,
      content: m.content,
    };
    if (m.name) out.name = m.name;
    if (m.tool_call_id) out.tool_call_id = m.tool_call_id;
    if (m.tool_calls) {
      out.tool_calls = m.tool_calls.map((tc) => ({
        id: tc.id,
        type: 'function',
        function: { name: tc.function.name, arguments: tc.function.arguments },
      }));
    }
    return out;
  }

  private fromOpenAIResponse(json: OpenAIChatResponse): ChatResponse {
    const choices: ChatChoice[] = json.choices.map((c) => {
      const toolCalls: ToolCall[] | undefined = c.message.tool_calls?.map((tc) => ({
        id: tc.id,
        type: 'function',
        function: { name: tc.function.name, arguments: tc.function.arguments },
      }));
      const message: ChatMessage = {
        role: 'assistant',
        content: c.message.content ?? '',
        tool_calls: toolCalls,
      };
      return {
        index: c.index,
        message,
        finishReason: normalizeFinish(c.finish_reason),
      };
    });
    return {
      id: json.id,
      model: json.model,
      choices,
      usage: json.usage
        ? {
            promptTokens: json.usage.prompt_tokens,
            completionTokens: json.usage.completion_tokens,
            totalTokens: json.usage.total_tokens,
          }
        : undefined,
    };
  }
}

function joinUrl(base: string, path: string): string {
  if (base.endsWith('/') && path.startsWith('/')) return base + path.slice(1);
  if (!base.endsWith('/') && !path.startsWith('/')) return base + path;
  return base + path;
}

function normalizeFinish(reason: string | null): ChatChoice['finishReason'] {
  if (!reason) return null;
  switch (reason) {
    case 'stop':
      return 'stop';
    case 'tool_calls':
      return 'tool_calls';
    case 'length':
      return 'length';
    case 'content_filter':
      return 'content_filter';
    default:
      return 'error';
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export const __providerTesting = { joinUrl, normalizeFinish };
