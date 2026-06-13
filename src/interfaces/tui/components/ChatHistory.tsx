import React from 'react';
import { Box, Text } from 'ink';
import type { ChatMessage } from '../../../core/types.js';

export interface ChatHistoryProps {
  messages: ChatMessage[];
  width: number;
  height: number;
}

export function ChatHistory({ messages, width, height }: ChatHistoryProps) {
  const visible = messages.slice(-Math.max(1, height));
  return (
    <Box flexDirection="column" width={width} height={height} overflow="hidden">
      {visible.map((m, i) => (
        <MessageBubble key={`${i}-${m.role}`} message={m} width={width} />
      ))}
    </Box>
  );
}

function MessageBubble({ message, width }: { message: ChatMessage; width: number }) {
  const role = message.role;
  const tag = role === 'user' ? 'you' : role === 'assistant' ? 'ai' : role === 'tool' ? 'tool' : 'sys';
  const tagColor = role === 'user' ? 'cyan' : role === 'assistant' ? 'green' : role === 'tool' ? 'yellow' : 'gray';
  const content = (message.content ?? '').slice(-Math.max(0, width - 6));
  return (
    <Box>
      <Text color={tagColor as never} bold>[{tag}]</Text>
      <Text> {wrapText(content, width - 6)}</Text>
    </Box>
  );
}

function wrapText(text: string, width: number): string {
  if (width <= 0) return text;
  if (text.length <= width) return text;
  const out: string[] = [];
  let remaining = text;
  while (remaining.length > width && out.length < 6) {
    out.push(remaining.slice(0, width));
    remaining = remaining.slice(width);
  }
  if (remaining.length > 0) out.push(remaining);
  return out.join('\n');
}
