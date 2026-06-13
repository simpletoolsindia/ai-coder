import React from 'react';
import { Box, Text } from 'ink';
import { LoadingBar } from './LoadingBar.js';
import type { AgentActivity } from '../../../core/status-display.js';

export interface ActivityFeedProps {
  current: { activity: AgentActivity; detail: string } | null;
  step: number;
  totalSteps: number;
  history: { activity: AgentActivity; detail: string; ts: number }[];
  width: number;
}

export function ActivityFeed({ current, step, totalSteps, history, width }: ActivityFeedProps) {
  return (
    <Box flexDirection="column" width={width} borderStyle="single" borderColor="gray" paddingX={1}>
      {current ? (
        <LoadingBar activity={current.activity} detail={current.detail} step={step} totalSteps={totalSteps} width={Math.max(8, width - 4)} />
      ) : (
        <Text dimColor>· idle ·</Text>
      )}
      {history.slice(-3).map((h, i) => (
        <Text key={`h-${i}-${h.ts}`} dimColor>
          {' '}
          {h.detail}
        </Text>
      ))}
    </Box>
  );
}
