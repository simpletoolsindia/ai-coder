/**
 * Interactive in-place status display. Renders a single line at the
 * bottom of the terminal that updates in place as the agent works:
 *
 *   💭 thinking…  ▰▰▰▱▱▱▱  step 2/8
 *   📖 read file  ▰▰▰▰▰▱▱▱  reading index.ts (124 lines)
 *   ✏️  edit file  ▰▰▰▰▰▰▰▱  applying edit
 *   💾 write file  ▰▰▰▰▰▰▰▰  done
 *   🐚 bash        ▰▰▰▰▰▰▱▱  npm test
 *
 * The display is non-TTY safe: in batch mode it falls back to plain
 * line output. The display is also testable via an in-memory transport.
 */
import type { EventBus } from './event-bus.js';

export type AgentActivity =
  | 'thinking'
  | 'reading'
  | 'writing'
  | 'editing'
  | 'deleting'
  | 'listing'
  | 'renaming'
  | 'searching'
  | 'bashing'
  | 'web-searching'
  | 'web-fetching'
  | 'remembering'
  | 'recalling'
  | 'compacting'
  | 'compressing'
  | 'delegating'
  | 'planning'
  | 'verifying'
  | 'retrying'
  | 'idle'
  | 'done';

const EMOJI: Record<AgentActivity, string> = {
  thinking: '💭',
  reading: '📖',
  writing: '✏️',
  editing: '✏️',
  deleting: '🗑️',
  listing: '📂',
  renaming: '🔀',
  searching: '🔎',
  bashing: '🐚',
  'web-searching': '🌐',
  'web-fetching': '🌐',
  remembering: '🧠',
  recalling: '🧠',
  compacting: '🗜️',
  compressing: '🗜️',
  delegating: '🤝',
  planning: '🗺️',
  verifying: '✅',
  retrying: '🔁',
  idle: '⏸️',
  done: '✅',
};

const VERB: Record<AgentActivity, string> = {
  thinking: 'thinking',
  reading: 'reading',
  writing: 'writing',
  editing: 'editing',
  deleting: 'deleting',
  listing: 'listing',
  renaming: 'renaming',
  searching: 'searching',
  bashing: 'running command',
  'web-searching': 'searching the web',
  'web-fetching': 'fetching URL',
  remembering: 'saving to memory',
  recalling: 'recalling from memory',
  compacting: 'compacting context',
  compressing: 'compressing context',
  delegating: 'delegating to sub-agent',
  planning: 'planning',
  verifying: 'verifying',
  retrying: 'retrying',
  idle: 'idle',
  done: 'done',
};

const TOOL_TO_ACTIVITY: Record<string, AgentActivity> = {
  'fs.read': 'reading',
  'fs.write': 'writing',
  'fs.edit': 'editing',
  'fs.delete': 'deleting',
  'fs.list': 'listing',
  'fs.rename': 'renaming',
  'search.glob': 'searching',
  'search.grep': 'searching',
  'terminal.run': 'bashing',
  'terminal.batch': 'bashing',
  'web.search': 'web-searching',
  'web.fetch': 'web-fetching',
  'memory.add': 'remembering',
  'memory.search': 'recalling',
  'memory.list': 'recalling',
  'memory.remove': 'remembering',
  'context.tokens': 'compressing',
  'context.project-map': 'planning',
  'todo.add': 'planning',
  'todo.update': 'planning',
  'todo.remove': 'planning',
  'todo.list': 'planning',
  'mcp.list': 'planning',
  'subagent.run': 'delegating',
  'git.diff': 'verifying',
  'git.status': 'verifying',
  'git.log': 'verifying',
};

export interface StatusFrame {
  activity: AgentActivity;
  detail: string;
  step: number;
  totalSteps: number;
  percent: number;
  message: string;
}

export interface StatusDisplayOptions {
  /** When false, emit lines via onLine instead of redrawing in place. */
  interactive?: boolean;
  /** Total steps used for the progress bar (e.g. maxSteps). */
  totalSteps?: number;
  /** Force plain output regardless of TTY detection. */
  forcePlain?: boolean;
  /** Custom sink for non-TTY output. */
  onLine?: (line: string) => void;
  /** Custom sink for in-place updates. */
  onRender?: (frame: StatusFrame) => void;
}

export class StatusDisplay {
  private options: Required<Omit<StatusDisplayOptions, 'onLine' | 'onRender'>> & {
    onLine?: StatusDisplayOptions['onLine'];
    onRender?: StatusDisplayOptions['onRender'];
  };
  private current: AgentActivity = 'idle';
  private detail = '';
  private step = 0;
  private totalSteps = 0;
  private isTty = false;
  private lastRendered = '';

  constructor(options: StatusDisplayOptions = {}) {
    const isTty = !!process.stdout.isTTY && !options.forcePlain;
    this.options = {
      interactive: options.interactive ?? isTty,
      totalSteps: options.totalSteps ?? 8,
      forcePlain: options.forcePlain ?? false,
      onLine: options.onLine,
      onRender: options.onRender,
    };
    this.isTty = isTty && this.options.interactive;
  }

  reset(totalSteps?: number): void {
    this.current = 'idle';
    this.detail = '';
    this.step = 0;
    this.totalSteps = totalSteps ?? this.options.totalSteps;
    this.render();
  }

  setActivity(activity: AgentActivity, detail = ''): void {
    this.current = activity;
    this.detail = detail;
    this.render();
  }

  setStep(step: number): void {
    this.step = step;
    this.render();
  }

  setDetail(detail: string): void {
    this.detail = detail;
    this.render();
  }

  done(message = 'done'): void {
    this.current = 'done';
    this.detail = message;
    this.render();
    this.writeLine(this.format({ activity: 'done', detail: message, step: this.step, totalSteps: this.totalSteps, percent: 1, message }));
  }

  fail(message: string): void {
    this.writeLine(`❌ ${message}`);
  }

  /** Map a tool id to an activity and update the display. */
  forTool(toolId: string, detail = ''): void {
    const activity = TOOL_TO_ACTIVITY[toolId] ?? 'thinking';
    this.setActivity(activity, detail || toolId);
  }

  /** Wire display to a bus so it reacts to tool/agent events automatically. */
  bind(bus: EventBus): () => void {
    const offs: Array<() => void> = [];
    offs.push(
      bus.on('tool.executed', (p) => {
        const payload = p as { id: string };
        this.setActivity(TOOL_TO_ACTIVITY[payload.id] ?? 'verifying', payload.id);
      }),
      bus.on('tool.failed', (p) => {
        const payload = p as { id: string; error: string };
        this.fail(`${payload.id}: ${payload.error}`);
      }),
      bus.on('agent.loopDetected', (p) => {
        const payload = p as { reason?: string };
        this.setActivity('retrying', `loop detected (${payload.reason ?? 'unknown'})`);
      }),
      bus.on('plugin.loaded', (p) => {
        const payload = p as { id: string };
        this.setActivity('thinking', `loaded plugin ${payload.id}`);
      }),
      bus.on('plugin.error', (p) => {
        const payload = p as { id: string; error: string };
        this.fail(`plugin ${payload.id}: ${payload.error}`);
      }),
    );
    return () => offs.forEach((o) => o());
  }

  private render(): void {
    const percent = this.totalSteps > 0 ? this.step / this.totalSteps : 0;
    const message = this.composeMessage();
    const frame: StatusFrame = {
      activity: this.current,
      detail: this.detail,
      step: this.step,
      totalSteps: this.totalSteps,
      percent,
      message,
    };
    this.options.onRender?.(frame);
    if (this.isTty) {
      const line = `\r${message}`;
      if (line !== this.lastRendered) {
        process.stdout.write(line);
        this.lastRendered = line;
      }
    } else {
      // In non-interactive mode we only emit on transitions
      const m = `${EMOJI[this.current]} ${VERB[this.current]}${this.detail ? ` — ${this.detail}` : ''}`;
      if (m !== this.lastRendered) {
        this.options.onLine?.(m);
        this.lastRendered = m;
      }
    }
  }

  private composeMessage(): string {
    const emoji = EMOJI[this.current] ?? '·';
    const verb = VERB[this.current] ?? 'working';
    const width = 12;
    const filled = Math.round((this.step / Math.max(1, this.totalSteps)) * width);
    const bar = '▰'.repeat(filled) + '▱'.repeat(Math.max(0, width - filled));
    const stepText = this.totalSteps > 0 ? `  step ${this.step}/${this.totalSteps}` : '';
    const detail = this.detail ? `  ${this.detail}` : '';
    return `${emoji} ${verb.padEnd(20, ' ')} ${bar}${stepText}${detail}`;
  }

  private writeLine(line: string): void {
    if (this.isTty) {
      process.stdout.write(`\r${line}\n`);
    } else {
      this.options.onLine?.(line);
    }
  }

  private format(frame: StatusFrame): string {
    return frame.message;
  }
}

export const __statusDisplayTesting = { EMOJI, VERB, TOOL_TO_ACTIVITY };
export const EMOJI_PUBLIC: Record<AgentActivity, string> = EMOJI;
export const VERB_PUBLIC: Record<AgentActivity, string> = VERB;
export const TOOL_TO_ACTIVITY_PUBLIC: Record<string, AgentActivity> = TOOL_TO_ACTIVITY;
