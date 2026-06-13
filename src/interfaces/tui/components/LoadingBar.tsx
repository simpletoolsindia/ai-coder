import React from 'react';
import { Text, Box } from 'ink';
import {
  type AgentActivity,
  TOOL_TO_ACTIVITY_PUBLIC as TOOL_TO_ACTIVITY,
  EMOJI_PUBLIC as EMOJI,
  VERB_PUBLIC as VERB,
} from '../../../core/status-display.js';

export interface LoadingBarProps {
  activity: AgentActivity;
  detail: string;
  step: number;
  totalSteps: number;
  width?: number;
  message?: string;
}

export function LoadingBar({ activity, detail, step, totalSteps, width = 20, message }: LoadingBarProps) {
  const filled = Math.max(0, Math.min(width, Math.round((step / Math.max(1, totalSteps)) * width)));
  const bar = '▰'.repeat(filled) + '▱'.repeat(width - filled);
  const emoji = EMOJI[activity] ?? '·';
  const verb = VERB[activity] ?? 'working';
  const stepText = totalSteps > 0 ? `step ${step}/${totalSteps}` : '';
  return (
    <Box>
      <Text color="cyan">{emoji} </Text>
      <Text bold>{verb.padEnd(18, ' ')}</Text>
      <Text color="green">{bar}</Text>
      {stepText ? <Text dimColor> {stepText}</Text> : null}
      {detail ? <Text color="yellow">  {detail}</Text> : null}
      {message ? <Text color="gray">  {message}</Text> : null}
    </Box>
  );
}

export function toolActivityFromId(toolId: string): AgentActivity {
  return (TOOL_TO_ACTIVITY[toolId] ?? 'thinking') as AgentActivity;
}
