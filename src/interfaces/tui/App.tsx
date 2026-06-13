import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { Sidebar } from './components/Sidebar.js';
import { ChatHistory } from './components/ChatHistory.js';
import { ActivityFeed } from './components/ActivityFeed.js';
import { InputBox } from './components/InputBox.js';
import { CommandHost } from './components/CommandHost.js';
import type { Runtime } from '../../core/runtime.js';
import type { ChatMessage, ToolDefinition, ProviderConfig } from '../../core/types.js';
import { ModeController, type AgentMode } from '../../core/mode-controller.js';
import { StatusDisplay, type AgentActivity } from '../../core/status-display.js';
import { CommandRegistry, CommandNotFoundError, CommandParseError } from '../../core/command-registry.js';
import type { CommandContext } from '../../core/command-registry.js';
import { builtInCommands } from '../commands.js';
import { builtInPlugins } from '../../plugins/index.js';
import { coreToolsPlugin } from '../../tools/index.js';
import { PluginManager } from '../../core/plugin-manager.js';
import { filesystemTools } from '../../tools/filesystem/index.js';
import { searchTools } from '../../tools/search/index.js';
import { terminalTools } from '../../tools/terminal/index.js';
import { gitTools } from '../../tools/git/index.js';

export interface TuiAppProps {
  runtime: Runtime;
  commands: CommandRegistry;
  mode: ModeController;
  status: StatusDisplay;
  onExit: () => void;
}

interface FeedEntry {
  activity: AgentActivity;
  detail: string;
  ts: number;
}

export function TuiApp({ runtime, commands, mode, status, onExit }: TuiAppProps) {
  const { exit } = useApp();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [bus] = useState(runtime['events' as never] as import('../../core/event-bus.js').EventBus);
  const [activity, setActivity] = useState<{ activity: AgentActivity; detail: string } | null>(null);
  const [step, setStep] = useState(0);
  const [feed, setFeed] = useState<FeedEntry[]>([]);
  const [providers, setProviders] = useState<{ id: string; active: boolean; model?: string }[]>([]);
  const [tools, setTools] = useState<{ id: string; category: string; enabled: boolean; calls?: number }[]>([]);
  const [pluginList, setPluginList] = useState<{ id: string; loaded: boolean; enabled: boolean }[]>([]);
  const [currentMode, setCurrentMode] = useState<AgentMode>(mode.mode);
  const [statusMsg, setStatusMsg] = useState<string>('');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteFilter, setPaletteFilter] = useState('');

  const allCommands = useMemo(() => commands.list({ includeHidden: true }), [commands]);

  useEffect(() => {
    refresh();
    refreshLists();
    const offAct = bus.on('tool.executed', (p) => {
      const payload = p as { id: string };
      status.forTool(payload.id, payload.id);
      setActivity({ activity: status['current' as never] as AgentActivity, detail: payload.id });
      setStep((s) => s + 1);
      setFeed((f) => [...f, { activity: 'reading', detail: `→ ${payload.id}`, ts: Date.now() }]);
    });
    const offFail = bus.on('tool.failed', (p) => {
      const payload = p as { id: string; error: string };
      setStatusMsg(`✗ ${payload.id}: ${payload.error}`);
    });
    const offDone = bus.on('agent.step', () => setStep((s) => s + 1));
    const offMode = mode.onChange((e) => setCurrentMode(e.to));
    return () => {
      offAct();
      offFail();
      offDone();
      offMode();
    };
  }, [bus, status, mode]);

  function refresh() {
    setMessages((m) => [...m]);
  }
  function refreshLists() {
    setProviders(
      runtime.providers.list().map((p: ProviderConfig) => ({
        id: p.id,
        active: runtime.providers.activeIdOrUndefined() === p.id,
        model: undefined,
      })),
    );
    setTools(
      runtime.tools.list().map((t: ToolDefinition) => ({
        id: t.id,
        category: t.category,
        enabled: runtime.settings.isToolEnabled(t.id),
        calls: runtime.tools.usage().find((u) => u.id === t.id)?.count,
      })),
    );
    setPluginList(
      (runtime.plugins?.list() ?? []).map((p) => ({
        id: p.id,
        loaded: runtime.plugins?.isLoaded(p.id) ?? false,
        enabled: runtime.plugins?.isEnabled(p.id) ?? true,
      })),
    );
  }

  async function handleSubmit(input: string) {
    const trimmed = input.trim();
    if (!trimmed) return;
    if (trimmed === '/exit' || trimmed === '/quit') {
      onExit();
      exit();
      return;
    }
    if (trimmed === '/clear') {
      setMessages([]);
      return;
    }
    setMessages((m) => [...m, { role: 'user', content: trimmed }]);
    setStatusMsg('');
    setActivity({ activity: currentMode === 'plan' ? 'planning' : 'thinking', detail: trimmed.slice(0, 60) });
    setStep(0);
    if (trimmed.startsWith('/')) {
      try {
        await commands.run(trimmed, {
          commands,
          settings: runtime.settings,
          providers: runtime.providers,
          tools: runtime.tools,
          plugins: runtime.plugins,
          events: bus,
          logger: runtime['logger' as never],
          print: (line: string) => {
            setMessages((m) => [...m, { role: 'system', content: line }]);
          },
          mode,
          status,
        });
        setActivity({ activity: 'done', detail: 'command complete' });
      } catch (err) {
        if (err instanceof CommandNotFoundError) {
          setStatusMsg(`Unknown command: ${err.message}`);
        } else if (err instanceof CommandParseError) {
          setStatusMsg(`Parse error: ${err.message}`);
        } else {
          setStatusMsg(`Error: ${(err as Error).message}`);
        }
      }
      refreshLists();
      return;
    }
    try {
      setActivity({ activity: 'thinking', detail: 'calling LLM…' });
      const res = await runtime.run(trimmed, { context: { cwd: process.cwd() } });
      setMessages((m) => [...m, { role: 'assistant', content: res.text || '(no response)' }]);
      setActivity({ activity: 'done', detail: `done in ${res.steps.length} step(s)` });
    } catch (err) {
      setStatusMsg(`Error: ${(err as Error).message}`);
      setActivity({ activity: 'idle', detail: 'failed' });
    }
    refreshLists();
  }

  // Detect when the user typed `/` so the palette can show.
  function onInputChange(v: string) {
    setPaletteFilter(v);
    if (v.trim().startsWith('/')) {
      setPaletteOpen(true);
    } else {
      setPaletteOpen(false);
    }
  }

  useInput((input, key) => {
    if (key.tab) {
      const next = mode.toggle();
      setCurrentMode(next);
    }
  });

  const tuiCtx: CommandContext = useMemo(
    () => ({
      commands,
      settings: runtime.settings,
      providers: runtime.providers,
      tools: runtime.tools,
      plugins: runtime.plugins,
      events: bus,
      logger: runtime['logger' as never],
      print: (line: string) => {
        setMessages((m) => [...m, { role: 'system', content: line }]);
      },
      mode,
      status,
    }),
    [commands, runtime, bus, mode, status],
  );

  // Inline rendering helper for the command palette above the input.
  const renderPalette = () => (
    <CommandHost
      commands={allCommands}
      registry={commands}
      width={80}
      ctx={tuiCtx}
      onAfterRun={() => {
        refreshLists();
        setPaletteFilter('');
        setPaletteOpen(false);
      }}
    />
  );

  return (
    <Box flexDirection="row" width="100%" height="100%">
      <Box width={26} flexDirection="column" borderStyle="single" borderColor="gray">
        <Sidebar
          providers={providers}
          tools={tools}
          plugins={pluginList}
          mode={currentMode}
          cwd={process.cwd()}
          width={24}
        />
      </Box>
      <Box flexDirection="column" flexGrow={1} paddingX={1}>
        <Box flexDirection="row" justifyContent="space-between">
          <Text color="cyan" bold>AI By</Text>
          <Text dimColor>{currentMode === 'plan' ? '📋 PLAN' : '⚡ EXECUTE'} · {statusMsg || 'ready'}</Text>
        </Box>
        <Box flexDirection="column" flexGrow={1} borderStyle="single" borderColor="gray" paddingX={1}>
          <ChatHistory messages={messages} width={80} height={20} />
        </Box>
        <ActivityFeed current={activity} step={step} totalSteps={8} history={feed} width={80} />
        {paletteOpen ? renderPalette() : null}
        <InputBox
          prompt={paletteOpen ? '› filter' : 'ai-coder>'}
          value={paletteFilter}
          onChange={onInputChange}
          onSubmit={handleSubmit}
          onTab={() => mode.toggle()}
          onCtrlC={() => {
            onExit();
            exit();
          }}
          hint="Enter to send · Tab toggles PLAN/EXECUTE · / for command palette · Ctrl+C to quit"
          width={80}
        />
      </Box>
    </Box>
  );
}

export async function launchTui(opts: { runtime: Runtime; onExit: () => void }): Promise<void> {
  const { render } = await import('ink');
  const { stdin, stdout } = await import('node:process');
  const { resolveProviderConfigPath } = await import('../../core/provider-manager.js');
  const commands = new CommandRegistry();
  commands.registerMany(builtInCommands);
  const mode = new ModeController();
  const status = new StatusDisplay({ forcePlain: true, onLine: () => undefined });
  if (!opts.runtime.plugins) {
    const plugins = new PluginManager({
      logger: opts.runtime['logger' as never],
      events: opts.runtime['events' as never],
      settings: opts.runtime.settings,
      tools: opts.runtime.tools,
      commands,
      permissions: opts.runtime.permissions,
      builtins: [coreToolsPlugin, ...builtInPlugins],
    });
    opts.runtime.plugins = plugins;
  }
  await opts.runtime.initialize();
  await opts.runtime.providers.loadFromFile(resolveProviderConfigPath(process.cwd())).catch(() => undefined);
  opts.runtime.tools.registerMany([...filesystemTools, ...searchTools, ...terminalTools, ...gitTools]);
  const { waitUntilExit } = render(
    <TuiApp runtime={opts.runtime} commands={commands} mode={mode} status={status} onExit={opts.onExit} />,
    { stdin, stdout, exitOnCtrlC: false, patchConsole: false },
  );
  await waitUntilExit();
}
