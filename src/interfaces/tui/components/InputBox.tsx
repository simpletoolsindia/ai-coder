import React from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';

export interface InputBoxProps {
  prompt: string;
  onSubmit: (value: string) => void | Promise<void>;
  onChange?: (value: string) => void;
  onTab?: () => void;
  onCtrlC?: () => void;
  disabled?: boolean;
  hint?: string;
  width: number;
  value?: string;
}

export function InputBox({ prompt, onSubmit, onChange, onTab, onCtrlC, disabled, hint, width, value: controlled }: InputBoxProps) {
  const [internal, setInternal] = React.useState('');
  const value = controlled ?? internal;
  const setValue = (v: string) => {
    if (controlled === undefined) setInternal(v);
    onChange?.(v);
  };
  useInput(
    (input, key) => {
      if (key.ctrl && input === 'c') {
        onCtrlC?.();
      } else if (key.tab) {
        onTab?.();
      }
    },
    { isActive: !disabled },
  );
  return (
    <Box flexDirection="column" width={width} borderStyle="round" borderColor="cyan" paddingX={1}>
      <Box>
        <Text color="cyan" bold>{prompt} </Text>
        <TextInput value={value} onChange={setValue} onSubmit={(v) => {
          if (v.trim().length === 0) return;
          const submitted = v;
          setValue('');
          void onSubmit(submitted);
        }} placeholder="Ask anything or type a /command…" />
      </Box>
      {hint ? <Text dimColor>{hint}</Text> : null}
    </Box>
  );
}
