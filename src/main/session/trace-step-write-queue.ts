import type { TraceStep } from '../../renderer/types';

type PendingWrite =
  | { kind: 'create'; sessionId: string; step: TraceStep }
  | { kind: 'update'; updates: Partial<TraceStep> };

export interface TraceStepWriteSink {
  /** Persist a new trace step row. */
  create(sessionId: string, step: TraceStep): void;
  /** Apply a partial update to an existing trace step row. */
  update(stepId: string, updates: Partial<TraceStep>): void;
  /** Optional wrapper to run a flush batch inside a single DB transaction. */
  transaction?(fn: () => void): void;
}

interface QueueOptions {
  /** Debounce window before a flush (ms). */
  flushMs?: number;
}

/** Copy only defined keys from `src` onto `dst` (mirrors the DB's undefined-skip). */
function mergeDefined<T extends object>(dst: T, src: Partial<T>): void {
  for (const [key, value] of Object.entries(src)) {
    if (value !== undefined) {
      (dst as Record<string, unknown>)[key] = value;
    }
  }
}

/**
 * Decouples trace-step DB persistence from the renderer forward path.
 *
 * `sendToRenderer` forwards trace events to the UI immediately; this queue
 * absorbs the synchronous better-sqlite3 writes, coalescing a create plus its
 * follow-up updates (the common create→completed pattern) into a single row
 * write and flushing the whole batch in one transaction on a short debounce.
 */
export class TraceStepWriteQueue {
  // Insertion-ordered map so flush replays writes in the order steps appeared.
  private readonly pending = new Map<string, PendingWrite>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly flushMs: number;

  constructor(
    private readonly sink: TraceStepWriteSink,
    options: QueueOptions = {}
  ) {
    this.flushMs = options.flushMs ?? 60;
  }

  enqueueCreate(sessionId: string, step: TraceStep): void {
    // Clone so later in-place merges don't mutate the caller's object.
    this.pending.set(step.id, { kind: 'create', sessionId, step: { ...step } });
    this.schedule();
  }

  enqueueUpdate(stepId: string, updates: Partial<TraceStep>): void {
    const existing = this.pending.get(stepId);
    if (existing?.kind === 'create') {
      // Fold the update into the not-yet-written create → one row write.
      mergeDefined(existing.step, updates);
    } else if (existing?.kind === 'update') {
      mergeDefined(existing.updates, updates);
    } else {
      this.pending.set(stepId, { kind: 'update', updates: { ...updates } });
    }
    this.schedule();
  }

  private schedule(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => this.flush(), this.flushMs);
  }

  /** Persist all buffered writes now (in one transaction if the sink supports it). */
  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.pending.size === 0) return;
    const batch = Array.from(this.pending.entries());
    this.pending.clear();

    const replay = () => {
      for (const [stepId, write] of batch) {
        if (write.kind === 'create') {
          this.sink.create(write.sessionId, write.step);
        } else {
          this.sink.update(stepId, write.updates);
        }
      }
    };

    if (this.sink.transaction) {
      this.sink.transaction(replay);
    } else {
      replay();
    }
  }
}
