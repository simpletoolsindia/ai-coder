#!/usr/bin/env node
import { CLI } from './interfaces/cli.js';
import { Logger, createLogger, silentTransport } from './core/logger.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const batch = args.includes('--batch') || args.includes('-b');
  const verbose = args.includes('--verbose') || args.includes('-v');
  const noPrompt = args.includes('--no-prompt');
  const tui = !args.includes('--no-tui') && !batch && process.stdin.isTTY === true;
  const logger: Logger = createLogger({
    level: verbose ? 'debug' : 'info',
    transports: process.env.AI_BY_SILENT === '1' ? [silentTransport] : undefined,
  });

  if (tui) {
    const { launchTui } = await import('./interfaces/tui/App.js');
    const { Runtime } = await import('./core/runtime.js');
    const runtime = new Runtime({ logger });
    await launchTui({ runtime, onExit: () => process.exit(0) });
    return;
  }

  const cli = new CLI({ batch, noPrompt, logger, prompt: 'ai-coder> ' });
  await cli.initialize();
  const isInteractive = !batch && !noPrompt && process.stdin.isTTY;
  if (!isInteractive) {
    let buffer = '';
    process.stdin.setEncoding('utf-8');
    for await (const chunk of process.stdin) {
      buffer += chunk;
      let idx;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        if (line.length > 0) await cli.handle(line, cli['runtime'].commands);
      }
    }
    if (buffer.trim().length > 0) await cli.handle(buffer, cli['runtime'].commands);
    return;
  }
  await cli.run();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
