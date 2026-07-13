import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  TraceStepWriteQueue,
  type TraceStepWriteSink,
} from '@/main/session/trace-step-write-queue';
import type { TraceStep } from '@/renderer/types';

function makeStep(id: string, overrides: Partial<TraceStep> = {}): TraceStep {
  return {
    id,
    type: 'tool_call',
    status: 'running',
    title: 'Read',
    timestamp: 0,
    ...overrides,
  };
}

function makeSink() {
  const create = vi.fn();
  const update = vi.fn();
  const sink: TraceStepWriteSink = {
    create,
    update,
    transaction: (fn) => fn(),
  };
  return { sink, create, update };
}

describe('TraceStepWriteQueue', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('does not write until the debounce window elapses', () => {
    const { sink, create } = makeSink();
    const q = new TraceStepWriteQueue(sink, { flushMs: 60 });
    q.enqueueCreate('s1', makeStep('a'));
    expect(create).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('coalesces a create + follow-up updates into one create with merged fields', () => {
    const { sink, create, update } = makeSink();
    const q = new TraceStepWriteQueue(sink, { flushMs: 60 });
    q.enqueueCreate('s1', makeStep('a'));
    q.enqueueUpdate('a', { status: 'completed', duration: 120 });
    q.enqueueUpdate('a', { toolOutput: 'done' });
    vi.advanceTimersByTime(60);

    expect(update).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(
      's1',
      expect.objectContaining({
        id: 'a',
        status: 'completed',
        duration: 120,
        toolOutput: 'done',
      })
    );
  });

  it('merges consecutive updates for an already-created step into one update', () => {
    const { sink, update } = makeSink();
    const q = new TraceStepWriteQueue(sink, { flushMs: 60 });
    // First window: the create is flushed.
    q.enqueueCreate('s1', makeStep('a'));
    vi.advanceTimersByTime(60);
    // Second window: only updates → single merged update call.
    q.enqueueUpdate('a', { status: 'completed' });
    q.enqueueUpdate('a', { duration: 5 });
    vi.advanceTimersByTime(60);

    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith('a', { status: 'completed', duration: 5 });
  });

  it('replays writes in insertion order across multiple steps', () => {
    const calls: string[] = [];
    const sink: TraceStepWriteSink = {
      create: (_s, step) => calls.push(`create:${step.id}`),
      update: (id) => calls.push(`update:${id}`),
    };
    const q = new TraceStepWriteQueue(sink, { flushMs: 60 });
    q.enqueueCreate('s1', makeStep('a'));
    q.enqueueCreate('s1', makeStep('b'));
    q.enqueueUpdate('c', { status: 'completed' }); // update-only for an earlier-created step
    vi.advanceTimersByTime(60);
    expect(calls).toEqual(['create:a', 'create:b', 'update:c']);
  });

  it('flush() persists immediately and is safe when empty', () => {
    const { sink, create } = makeSink();
    const q = new TraceStepWriteQueue(sink, { flushMs: 1000 });
    q.enqueueCreate('s1', makeStep('a'));
    q.flush();
    expect(create).toHaveBeenCalledTimes(1);
    q.flush(); // no-op
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('wraps a flush batch in a transaction when the sink provides one', () => {
    const order: string[] = [];
    const sink: TraceStepWriteSink = {
      create: () => order.push('create'),
      update: () => order.push('update'),
      transaction: (fn) => {
        order.push('tx-start');
        fn();
        order.push('tx-end');
      },
    };
    const q = new TraceStepWriteQueue(sink, { flushMs: 60 });
    q.enqueueCreate('s1', makeStep('a'));
    q.enqueueCreate('s1', makeStep('b'));
    vi.advanceTimersByTime(60);
    expect(order).toEqual(['tx-start', 'create', 'create', 'tx-end']);
  });

  it('does not mutate the caller-provided step object', () => {
    const { sink } = makeSink();
    const q = new TraceStepWriteQueue(sink, { flushMs: 60 });
    const step = makeStep('a');
    q.enqueueCreate('s1', step);
    q.enqueueUpdate('a', { status: 'completed' });
    expect(step.status).toBe('running');
  });
});
