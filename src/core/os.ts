/**
 * OS detection and shell abstractions so the agent works on Windows,
 * macOS and Linux without changes.
 */
import { spawn, type SpawnOptions } from 'node:child_process';
import { sep } from 'node:path';

export type Platform = 'windows' | 'macos' | 'linux' | 'unknown';

export interface OsInfo {
  platform: Platform;
  arch: string;
  shell: string;
  shellArgs: string[];
  home: string;
  isWindows: boolean;
  isUnix: boolean;
  pathSep: string;
  nullDevice: string;
  installCommand: (pkg: string, manager?: string) => string;
}

let cached: OsInfo | undefined;

export function getOsInfo(env: Record<string, string | undefined> = process.env as Record<string, string | undefined>): OsInfo {
  if (cached) return cached;
  const raw = process.platform;
  const platform: Platform =
    raw === 'win32' ? 'windows' : raw === 'darwin' ? 'macos' : raw === 'linux' ? 'linux' : 'unknown';
  const home = env.HOME || env.USERPROFILE || (platform === 'windows' ? 'C:\\Users\\Default' : '/root');
  const isWindows = platform === 'windows';
  const isUnix = !isWindows;
  const shell = isWindows ? (env.COMSPEC || 'cmd.exe') : (env.SHELL || '/bin/sh');
  const shellArgs = isWindows ? ['/d', '/s', '/c'] : ['-c'];
  const pathSep = sep;
  const nullDevice = isWindows ? 'NUL' : '/dev/null';
  const installCommand = (pkg: string, manager?: string) => {
    if (manager) {
      if (manager === 'brew') return `brew install ${pkg}`;
      if (manager === 'apt') return `sudo apt-get install -y ${pkg}`;
      if (manager === 'choco' || manager === 'chocolatey') return `choco install -y ${pkg}`;
      if (manager === 'winget') return `winget install -e --id ${pkg}`;
      if (manager === 'scoop') return `scoop install ${pkg}`;
      if (manager === 'dnf') return `sudo dnf install -y ${pkg}`;
      if (manager === 'pacman') return `sudo pacman -S --noconfirm ${pkg}`;
    }
    if (isWindows) return `winget install -e --id ${pkg} || choco install -y ${pkg}`;
    if (platform === 'macos') return `brew install ${pkg}`;
    if (platform === 'linux') return `sudo apt-get install -y ${pkg} || sudo dnf install -y ${pkg}`;
    return `install ${pkg}`;
  };
  cached = { platform, arch: process.arch, shell, shellArgs, home, isWindows, isUnix, pathSep, nullDevice, installCommand };
  return cached;
}

export function resetOsCache(): void {
  cached = undefined;
}

/**
 * Cross-platform shell exec. Uses the platform's default shell so the
 * same command string works on Windows, macOS and Linux.
 */
export function execShell(
  command: string,
  options: { cwd?: string; env?: Record<string, string>; timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<{ code: number; stdout: string; stderr: string }> {
  const os = getOsInfo();
  return new Promise((resolve) => {
    const spawnOptions: SpawnOptions = {
      cwd: options.cwd,
      env: { ...process.env, ...(options.env ?? {}) } as NodeJS.ProcessEnv,
    };
    const child = spawn(command, { ...spawnOptions, shell: os.shell });
    let stdout = '';
    let stderr = '';
    const max = 5_000_000;
    child.stdout?.on('data', (c: Buffer) => {
      if (stdout.length < max) stdout += c.toString('utf-8');
    });
    child.stderr?.on('data', (c: Buffer) => {
      if (stderr.length < max) stderr += c.toString('utf-8');
    });
    let killed = false;
    const timer = options.timeoutMs
      ? setTimeout(() => {
          killed = true;
          child.kill(os.isWindows ? 'SIGTERM' : 'SIGTERM');
        }, options.timeoutMs)
      : null;
    const onAbort = () => {
      killed = true;
      child.kill('SIGTERM');
    };
    if (options.signal) {
      if (options.signal.aborted) onAbort();
      else options.signal.addEventListener('abort', onAbort, { once: true });
    }
    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      if (options.signal) options.signal.removeEventListener('abort', onAbort);
      resolve({
        code: killed ? -1 : (code ?? -1),
        stdout,
        stderr,
      });
    });
    child.on('error', (err) => {
      if (timer) clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: stderr + (stderr ? '\n' : '') + err.message });
    });
  });
}

/**
 * Check whether a CLI tool is available on PATH.
 */
export async function which(tool: string, cwd?: string): Promise<string | undefined> {
  const os = getOsInfo();
  const cmd = os.isWindows ? `where ${tool}` : `command -v ${tool}`;
  const { code, stdout } = await execShell(cmd, { cwd, timeoutMs: 5_000 });
  if (code !== 0) return undefined;
  const first = stdout.split(/\r?\n/)[0]?.trim();
  return first || undefined;
}

export const __osTesting = { getOsInfo, execShell, which };
