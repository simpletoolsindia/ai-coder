import { H1, P, Code, Pill, Card } from '../components/ui';

const versions = [
  {
    v: '0.2.3',
    date: '2026-06-13',
    highlights: [
      'Binary exposed as `ai-coder` only.',
      'CLI prompt updated to `ai-coder>`.',
      'Install scripts and docs reference `ai-coder`.',
    ],
  },
  {
    v: '0.2.2',
    date: '2026-06-13',
    highlights: [
      'Expose `ai-coder` as a second binary alias (kept `ai-by` as well).',
      'Install scripts surface both commands.',
    ],
  },
  {
    v: '0.2.1',
    date: '2026-06-13',
    highlights: [
      'Added `homepage`, `repository`, `bugs` metadata to npm package.',
      'Promoted to the latest tag on npm.',
    ],
  },
  {
    v: '0.2.0',
    date: '2026-06-13',
    highlights: [
      'New core: ModeController (PLAN/EXECUTE), LoopGuard, ResilientInvoke, ToolRag, LearningStore, StatusDisplay, OSInfo.',
      'New tools: terminal.batch, git.diff, git.status, git.log.',
      'New commands: /mode, /compact, /doctor.',
      'Last-used (provider, model) persisted and auto-restored on next launch.',
      'GitHub Actions for CI, npm publish, and GitHub Pages deploy.',
      'Single-line install.sh / install.ps1 with auto OS detection and dependency install.',
    ],
  },
  {
    v: '0.1.0',
    date: '2026-06-13',
    highlights: [
      'Initial release.',
      'Plugin-first core: EventBus, DI, Settings, CommandRegistry, ToolRegistry, PermissionEngine, PluginManager, ProviderManager, Planner, PromptBuilder, ContextCompressor, Runtime.',
      'Built-in tools: filesystem, search, terminal.',
      'Plugins: memory, context, todo, web-search, mcp, subagents.',
      'CLI: /help, /login, /providers, /use, /settings, /extensions, /tools, /clear, /exit.',
      'OpenAI-compatible provider with retries, streaming, env-var fallback.',
      '334 tests, 86%+ line coverage.',
    ],
  },
];

export function Changelog() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <Pill>Changelog</Pill>
      <H1>What's new</H1>
      <P>Every release of <code>ai-by</code>, in order. The npm package follows semver.</P>

      <div className="mt-6 space-y-4">
        {versions.map((v) => (
          <Card key={v.v}>
            <div className="flex items-center justify-between mb-2">
              <div className="font-mono text-sm font-semibold text-brand-700 dark:text-brand-300">v{v.v}</div>
              <div className="text-xs text-ink-500 dark:text-ink-400">{v.date}</div>
            </div>
            <ul className="list-disc pl-5 space-y-1 text-sm text-ink-700 dark:text-ink-300">
              {v.highlights.map((h, i) => (
                <li key={i}>{h}</li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
}
