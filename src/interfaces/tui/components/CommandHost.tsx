import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import { CommandPalette } from './CommandPalette.js';
import type { CommandContext, CommandRegistry } from '../../../core/command-registry.js';
import type { CommandDefinition } from '../../../core/types.js';

export interface CommandHostProps {
  commands: CommandDefinition[];
  registry: CommandRegistry;
  width: number;
  ctx: CommandContext;
  onAfterRun: () => void;
}

type Stage =
  | { kind: 'palette' }
  | { kind: 'collect'; cmd: CommandDefinition; prompt: string; value: string }
  | { kind: 'result'; cmd: CommandDefinition; lines: string[] };

/**
 * Renders the command palette, drives the per-command TUI dialogs, and
 * dispatches the command when the user has filled in the required args.
 */
export function CommandHost({ commands, registry, width, ctx, onAfterRun }: CommandHostProps) {
  const [stage, setStage] = useState<Stage>({ kind: 'palette' });
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const [out, setOut] = useState<string[]>([]);
  const [autoCommand, setAutoCommand] = useState<CommandDefinition | null>(null);

  useEffect(() => {
    // If the user's input exactly matches a command and it requires no
    // args, auto-run it. Otherwise drop to the result view after a run.
    if (stage.kind === 'result' && autoCommand) {
      setAutoCommand(null);
    }
  }, [stage, autoCommand]);

  function filteredCommands(): CommandDefinition[] {
    const ql = query.toLowerCase();
    return commands
      .filter((c) => {
        if (!ql) return true;
        return c.name.toLowerCase().includes(ql) || (c.description ?? '').toLowerCase().includes(ql);
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async function runCommand(cmd: CommandDefinition, args: string) {
    setOut([]);
    const lines: string[] = [];
    const captureCtx: CommandContext = {
      ...ctx,
      print: (line: string) => {
        lines.push(line);
        setOut((prev) => [...prev, line]);
      },
    };
    try {
      await registry.run(`${cmd.name}${args ? ' ' + args : ''}`, captureCtx);
    } catch (err) {
      const msg = (err as Error).message;
      lines.push(`Error: ${msg}`);
      setOut((prev) => [...prev, `Error: ${msg}`]);
    }
    onAfterRun();
    setStage({ kind: 'result', cmd, lines });
  }

  // Sub-components
  if (stage.kind === 'palette') {
    const filtered = filteredCommands();
    return (
      <Box flexDirection="column">
        <Box flexDirection="row" borderStyle="round" borderColor="magenta" paddingX={1} width={width}>
          <Text color="magenta" bold>{'/'}</Text>
          <TextInput
            value={query}
            onChange={(v) => {
              setQuery(v);
              setSelected(0);
            }}
            placeholder="filter slash commands…"
          />
        </Box>
        <CommandPalette commands={filtered} query="" selected={Math.min(selected, Math.max(0, filtered.length - 1))} width={width} />
      </Box>
    );
  }

  if (stage.kind === 'collect') {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1} width={width}>
        <Text color="cyan" bold>{stage.cmd.name} — {stage.prompt}</Text>
        <Box>
          <Text color="cyan">{'› '}</Text>
          <TextInput
            value={stage.value}
            onChange={(v) => setStage({ ...stage, value: v })}
            onSubmit={(v) => void runCommand(stage.cmd, v)}
            placeholder="press Enter to submit"
          />
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="green" paddingX={1} width={width}>
      <Text color="green" bold>{stage.cmd.name} — result</Text>
      {out.length === 0 ? <Text dimColor>(no output)</Text> : null}
      {out.slice(-15).map((l, i) => (
        <Text key={i}>{l}</Text>
      ))}
    </Box>
  );
}

