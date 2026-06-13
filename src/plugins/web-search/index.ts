import type { Json, Plugin, Tool, ToolExecutionContext, ToolResult } from '../../core/types.js';

export interface SearchProvider {
  search(query: SearchQuery): Promise<SearchResult[]>;
}

export interface SearchQuery {
  query: string;
  language?: string;
  safeSearch?: 'strict' | 'moderate' | 'none';
  limit?: number;
  timeoutMs?: number;
  retry?: number;
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  engine?: string;
}

export interface SearXNGProviderOptions {
  baseUrl: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
  defaultLanguage?: string;
}

export class SearXNGProvider implements SearchProvider {
  private opts: SearXNGProviderOptions;

  constructor(opts: SearXNGProviderOptions) {
    this.opts = opts;
  }

  async search(q: SearchQuery): Promise<SearchResult[]> {
    if (!this.opts.baseUrl) {
      throw new Error('SearXNG baseUrl is required');
    }
    const url = new URL('/search', this.opts.baseUrl);
    url.searchParams.set('q', q.query);
    url.searchParams.set('format', 'json');
    if (q.language || this.opts.defaultLanguage) url.searchParams.set('language', q.language ?? this.opts.defaultLanguage ?? 'en');
    if (q.safeSearch) {
      const map = { strict: '2', moderate: '1', none: '0' };
      url.searchParams.set('safesearch', map[q.safeSearch]);
    }
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (this.opts.apiKey) headers['X-API-Key'] = this.opts.apiKey;
    const fetchImpl = this.opts.fetchImpl ?? (globalThis.fetch as typeof fetch);
    const retries = q.retry ?? 0;
    let lastErr: Error | undefined;
    for (let i = 0; i <= retries; i++) {
      try {
        const res = await fetchImpl(url.toString(), {
          method: 'GET',
          headers,
          signal: q.timeoutMs ? AbortSignal.timeout(q.timeoutMs) : undefined,
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`SearXNG returned ${res.status}: ${text}`);
        }
        const json = (await res.json()) as { results: { title: string; url: string; content: string; engine?: string }[] };
        return (json.results ?? [])
          .slice(0, q.limit ?? 10)
          .map((r) => ({ title: r.title, url: r.url, snippet: r.content, engine: r.engine }));
      } catch (err) {
        lastErr = err as Error;
        if (i < retries) await new Promise((r) => setTimeout(r, 2 ** i * 250));
      }
    }
    throw lastErr ?? new Error('SearXNG search failed');
  }
}

let globalProvider: SearchProvider | undefined;

export function getSearchProvider(): SearchProvider {
  if (!globalProvider) {
    globalProvider = new SearXNGProvider({
      baseUrl: process.env.SEARXNG_URL ?? 'https://searx.be',
    });
  }
  return globalProvider;
}

export function setSearchProvider(p: SearchProvider): void {
  globalProvider = p;
}

const webSearchTool: Tool = {
  definition: {
    id: 'web.search',
    name: 'Web Search',
    description: 'Search the public web using a SearXNG instance.',
    category: 'web',
    pluginId: 'web-search',
    network: true,
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        limit: { type: 'integer', default: 10 },
        language: { type: 'string' },
        safeSearch: { type: 'string', enum: ['strict', 'moderate', 'none'] },
      },
      required: ['query'],
    },
    keywords: ['search', 'web', 'internet', 'lookup', 'find', 'docs', 'documentation', 'react', 'latest', 'news'],
  },
  async execute(args: Json, _ctx: ToolExecutionContext): Promise<ToolResult> {
    const a = args as { query?: string; limit?: number; language?: string; safeSearch?: 'strict' | 'moderate' | 'none' };
    if (!a.query) return { ok: false, error: 'query is required' };
    const provider = getSearchProvider();
    try {
      const results = await provider.search({
        query: a.query,
        language: a.language,
        limit: a.limit ?? 10,
        safeSearch: a.safeSearch,
      });
      return { ok: true, data: { query: a.query, count: results.length, results } };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  },
};

const webFetchTool: Tool = {
  definition: {
    id: 'web.fetch',
    name: 'Fetch URL',
    description: 'Fetch a URL and return its text content (stripped of HTML tags).',
    category: 'web',
    pluginId: 'web-search',
    network: true,
    parameters: {
      type: 'object',
      properties: { url: { type: 'string' }, maxBytes: { type: 'integer', default: 200000 } },
      required: ['url'],
    },
    keywords: ['fetch', 'http', 'url', 'web', 'curl', 'download'],
  },
  async execute(args: Json): Promise<ToolResult> {
    const a = args as { url?: string; maxBytes?: number };
    if (!a.url) return { ok: false, error: 'url is required' };
    const fetchImpl = globalThis.fetch;
    const res = await fetchImpl(a.url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const text = await res.text();
    const trimmed = text.length > (a.maxBytes ?? 200_000) ? text.slice(0, a.maxBytes) : text;
    const stripped = trimmed.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return { ok: true, data: { url: a.url, content: stripped, length: stripped.length } };
  },
};

export const webSearchPlugin: Plugin = {
  manifest: {
    id: 'web-search',
    version: '1.0.0',
    description: 'Public web search via SearXNG and direct URL fetching.',
    tools: ['web.search', 'web.fetch'],
    lazy: true,
    enabled: true,
    triggers: ['search', 'web', 'internet', 'documentation', 'docs', 'latest', 'react', 'news'],
    tags: ['web', 'search', 'network'],
  },
  async setup(ctx) {
    const settings = ctx.settings.get('search');
    const provider = new SearXNGProvider({
      baseUrl: settings.searxngUrl ?? 'https://searx.be',
      apiKey: settings.apiKey,
      defaultLanguage: settings.language,
    });
    setSearchProvider(provider);
    const tools = [webSearchTool, webFetchTool];
    for (const t of tools) {
      if (!ctx.tools.has(t.definition.id)) ctx.tools.register(t);
    }
    return { tools };
  },
  async shutdown() {
    /* no-op */
  },
};

export const __webSearchTesting = { SearXNGProvider };
