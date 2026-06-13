import React from 'react';
import { Box, Text } from 'ink';
import type { CommandDefinition } from '../../../core/types.js';

export interface CommandPaletteProps {
  commands: CommandDefinition[];
  query: string;
  selected: number;
  width: number;
}

interface Entry {
  cmd: CommandDefinition;
  score: number;
  highlight: { prefix: string; match: string; suffix: string };
}

function score(cmd: CommandDefinition, q: string): Entry | null {
  const name = cmd.name.toLowerCase();
  const ql = q.toLowerCase();
  if (ql === '') return { cmd, score: 0, highlight: { prefix: '', match: cmd.name, suffix: '' } };
  if (name === ql) return { cmd, score: 100, highlight: { prefix: '', match: cmd.name, suffix: '' } };
  if (name.startsWith(ql)) {
    return { cmd, score: 80, highlight: { prefix: cmd.name.slice(0, ql.length), match: cmd.name.slice(ql.length), suffix: '' } };
  }
  const idx = name.indexOf(ql);
  if (idx >= 0) {
    return { cmd, score: 40 - idx, highlight: { prefix: cmd.name.slice(0, idx), match: cmd.name.slice(idx, idx + ql.length), suffix: cmd.name.slice(idx + ql.length) } };
  }
  const desc = (cmd.description ?? '').toLowerCase();
  const dIdx = desc.indexOf(ql);
  if (dIdx >= 0) return { cmd, score: 10, highlight: { prefix: cmd.name, match: '', suffix: '' } };
  return null;
}

export function CommandPalette({ commands, query, selected, width }: CommandPaletteProps) {
  const filtered: Entry[] = [];
  for (const cmd of commands) {
    const e = score(cmd, query);
    if (e) filtered.push(e);
  }
  filtered.sort((a, b) => b.score - a.score);
  const visible = filtered.slice(0, 8);
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="magenta" paddingX={1} width={width}>
      <Text color="magenta" bold>
        {filtered.length === 0 ? 'No matches' : `${filtered.length} command${filtered.length === 1 ? '' : 's'}`}
        {query ? `  (filter: /${query})` : '  (type / to filter)'}
      </Text>
      {visible.length > 0 ? <Text> </Text> : null}
      {visible.map((e, i) => {
        const isSelected = i === selected;
        const marker = isSelected ? '❯' : ' ';
        return (
          <Box key={e.cmd.id} flexDirection="row">
            <Text color={isSelected ? 'magenta' : undefined} bold={isSelected}>
              {marker}{' '}
            </Text>
            <Text color={isSelected ? 'magenta' : 'cyan'} bold>
              {e.highlight.prefix}
              <Text color="white" backgroundColor={isSelected ? 'magenta' : undefined}>
                {e.highlight.match}
              </Text>
              {e.highlight.suffix}
            </Text>
            <Text>  </Text>
            <Text dimColor>{(e.cmd.description ?? '').slice(0, Math.max(0, width - 40))}</Text>
          </Box>
        );
      })}
      {visible.length === 0 ? (
        <Text dimColor>  Try /help, /login, /providers, /mode, /doctor, /extensions, /tools</Text>
      ) : null}
    </Box>
  );
}
