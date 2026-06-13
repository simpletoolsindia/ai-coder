import { describe, it, expect } from 'vitest';
import { StatusDisplay } from '../../src/core/status-display.js';
import { EventBus } from '../../src/core/event-bus.js';

describe('StatusDisplay', () => {
  it('renders plain text in non-TTY mode', () => {
    const lines: string[] = [];
    const d = new StatusDisplay({ forcePlain: true, onLine: (l) => lines.push(l) });
    d.setActivity('reading', 'index.ts');
    d.done('done');
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.join(' ')).toContain('reading');
  });

  it('emits frames via onRender', () => {
    const frames: unknown[] = [];
    const d = new StatusDisplay({ forcePlain: true, onRender: (f) => frames.push(f) });
    d.setStep(3);
    d.setActivity('writing', 'foo');
    expect(frames.length).toBeGreaterThan(0);
    const last = frames[frames.length - 1] as { step: number };
    expect(last.step).toBe(3);
  });

  it('forTool maps to the right activity', () => {
    const lines: string[] = [];
    const d = new StatusDisplay({ forcePlain: true, onLine: (l) => lines.push(l) });
    d.forTool('fs.read', 'index.ts');
    d.done();
    expect(lines.join(' ')).toContain('reading');
  });

  it('bind subscribes to tool events', () => {
    const lines: string[] = [];
    const d = new StatusDisplay({ forcePlain: true, onLine: (l) => lines.push(l) });
    const bus = new EventBus();
    d.bind(bus);
    bus.emitSync('tool.executed', { id: 'fs.read', ok: true, durationMs: 1 });
    d.done();
    expect(lines.join(' ')).toContain('reading');
  });

  it('fail prints an error line', () => {
    const lines: string[] = [];
    const d = new StatusDisplay({ forcePlain: true, onLine: (l) => lines.push(l) });
    d.fail('boom');
    expect(lines.join(' ')).toContain('boom');
  });
});
