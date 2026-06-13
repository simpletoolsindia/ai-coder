import React from 'react';
import { Box, Text } from 'ink';

export interface SidebarProps {
  providers: { id: string; active: boolean; model?: string }[];
  tools: { id: string; category: string; enabled: boolean; calls?: number }[];
  plugins: { id: string; loaded: boolean; enabled: boolean }[];
  mode: 'plan' | 'execute';
  cwd: string;
  width: number;
}

export function Sidebar({ providers, tools, plugins, mode, cwd, width }: SidebarProps) {
  const activeProvider = providers.find((p) => p.active);
  const lines: React.ReactNode[] = [];
  lines.push(<Text key="hdr" bold color="cyan">╭─ AI By ────────╮</Text>);
  lines.push(<Text key="mode" color={mode === 'plan' ? 'yellow' : 'red'}>│ mode: {mode.toUpperCase()}</Text>);
  lines.push(<Text key="prov" dimColor>│ provider: {activeProvider?.id ?? 'none'}</Text>);
  if (activeProvider?.model) {
    lines.push(<Text key="model" dimColor>│ model: {activeProvider.model}</Text>);
  }
  lines.push(<Text key="cwd" dimColor>│ cwd: {truncate(cwd, width - 9)}</Text>);
  lines.push(<Text key="sep">├─ tools ({tools.length}) ─</Text>);
  for (const t of tools.slice(0, 12)) {
    const mark = t.enabled ? '✓' : '✗';
    const color = t.enabled ? 'green' : 'gray';
    lines.push(<Text key={`t-${t.id}`} color={color as never}>│  {mark} {truncate(t.id, width - 5)}</Text>);
  }
  if (tools.length > 12) lines.push(<Text key="tmore" dimColor>│  …+{tools.length - 12} more</Text>);
  lines.push(<Text key="psep">├─ plugins ─</Text>);
  for (const p of plugins.slice(0, 8)) {
    const mark = p.loaded ? '●' : p.enabled ? '○' : '·';
    const color = p.loaded ? 'green' : p.enabled ? 'yellow' : 'gray';
    lines.push(<Text key={`p-${p.id}`} color={color as never}>│  {mark} {p.id}</Text>);
  }
  if (plugins.length > 8) lines.push(<Text key="pmore" dimColor>│  …+{plugins.length - 8} more</Text>);
  lines.push(<Text key="ftr" dimColor>╰─</Text>);
  return <Box flexDirection="column">{lines}</Box>;
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  if (n <= 1) return s.slice(0, n);
  return s.slice(0, n - 1) + '…';
}
