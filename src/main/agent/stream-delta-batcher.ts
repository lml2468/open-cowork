import type { ServerEvent } from '../../renderer/types';

type DeltaType = 'stream.partial' | 'stream.thinking';

interface BatcherOptions {
  /** Max time a delta may sit buffered before being flushed (ms). */
  flushMs?: number;
  /** Flush eagerly once buffered chars for a session reach this threshold. */
  maxChars?: number;
}

/**
 * Coalesces high-frequency streaming deltas (stream.partial / stream.thinking)
 * into fewer IPC messages.
 *
 * The renderer treats every `delta` as an additive fragment it appends, so
 * merging N consecutive same-kind deltas into one message with the concatenated
 * string is equivalent to sending them individually — but at a fraction of the
 * main→renderer structured-clone cost.
 *
 * Ordering guarantee: any non-delta event flushes all pending deltas first, so
 * deltas always reach the renderer before the stream.message / trace.* events
 * that logically follow them.
 */
export class StreamDeltaBatcher {
  private readonly pending = new Map<string, Array<{ type: DeltaType; delta: string }>>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly flushMs: number;
  private readonly maxChars: number;

  constructor(
    private readonly sink: (event: ServerEvent) => void,
    options: BatcherOptions = {}
  ) {
    this.flushMs = options.flushMs ?? 16;
    this.maxChars = options.maxChars ?? 8192;
  }

  /** Entry point that replaces a raw `sendToRenderer(event)` call. */
  send(event: ServerEvent): void {
    if (event.type === 'stream.partial' || event.type === 'stream.thinking') {
      this.enqueue(event.type, event.payload.sessionId, event.payload.delta);
      return;
    }
    this.flushAll();
    this.sink(event);
  }

  private enqueue(type: DeltaType, sessionId: string, delta: string): void {
    let buf = this.pending.get(sessionId);
    if (!buf) {
      buf = [];
      this.pending.set(sessionId, buf);
    }
    const last = buf[buf.length - 1];
    if (last && last.type === type) {
      last.delta += delta;
    } else {
      buf.push({ type, delta });
    }

    const total = buf.reduce((n, e) => n + e.delta.length, 0);
    if (total >= this.maxChars) {
      this.flush(sessionId);
      return;
    }
    if (!this.timers.has(sessionId)) {
      this.timers.set(
        sessionId,
        setTimeout(() => this.flush(sessionId), this.flushMs)
      );
    }
  }

  /** Emit buffered deltas for one session, in order, as merged messages. */
  flush(sessionId: string): void {
    const timer = this.timers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(sessionId);
    }
    const buf = this.pending.get(sessionId);
    if (!buf || buf.length === 0) return;
    this.pending.delete(sessionId);
    for (const entry of buf) {
      this.sink({ type: entry.type, payload: { sessionId, delta: entry.delta } });
    }
  }

  /** Flush every session's pending deltas. */
  flushAll(): void {
    if (this.pending.size === 0) return;
    for (const sessionId of Array.from(this.pending.keys())) {
      this.flush(sessionId);
    }
  }
}
