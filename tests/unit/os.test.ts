import { describe, it, expect, beforeEach } from 'vitest';
import { getOsInfo, execShell, which, resetOsCache } from '../../src/core/os.js';

describe('OS detection and shell exec', () => {
  beforeEach(resetOsCache);

  it('detects a known platform', () => {
    const os = getOsInfo();
    expect(['windows', 'macos', 'linux', 'unknown']).toContain(os.platform);
  });

  it('returns an install command per platform', () => {
    const os = getOsInfo();
    const cmd = os.installCommand('ffmpeg');
    expect(cmd.length).toBeGreaterThan(0);
  });

  it('execShell runs a command and returns output', async () => {
    const isWin = getOsInfo().isWindows;
    const cmd = isWin ? 'echo hello' : 'echo hello';
    const { code, stdout } = await execShell(cmd, { timeoutMs: 5_000 });
    expect(code).toBe(0);
    expect(stdout.trim()).toBe('hello');
  });

  it('which locates a real binary', async () => {
    const isWin = getOsInfo().isWindows;
    const result = await which(isWin ? 'cmd.exe' : 'sh');
    expect(result).toBeDefined();
  });

  it('which returns undefined for missing tools', async () => {
    const result = await which('definitely-not-a-real-binary-xyz123');
    expect(result).toBeUndefined();
  });
});
