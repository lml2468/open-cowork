import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StreamDeltaBatcher } from '@/main/agent/stream-delta-batcher';
import type { ServerEvent } from '@/renderer/types';

function partial(sessionId: string, delta: string): ServerEvent {
  return { type: 'stream.partial', payload: { sessionId, delta } };
}
function thinking(sessionId: string, delta: string): ServerEvent {
  return { type: 'stream.thinking', payload: { sessionId, delta } };
}

describe('StreamDeltaBatcher', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('coalesces consecutive same-kind deltas into one message on flush', () => {
    const sink = vi.fn();
    const b = new StreamDeltaBatcher(sink, { flushMs: 16 });
    b.send(partial('s1', 'Hel'));
    b.send(partial('s1', 'lo '));
    b.send(partial('s1', 'world'));
    expect(sink).not.toHaveBeenCalled(); // still buffered

    vi.advanceTimersByTime(16);
    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink).toHaveBeenCalledWith(partial('s1', 'Hello world'));
  });

  it('preserves order and concatenation equals the sum of deltas', () => {
    const sink = vi.fn();
    const b = new StreamDeltaBatcher(sink, { flushMs: 16 });
    const deltas = ['a', 'b', 'c', 'd', 'e'];
    deltas.forEach((d) => b.send(partial('s1', d)));
    vi.advanceTimersByTime(16);
    const sent = sink.mock.calls.map(
      (c) => (c[0] as Extract<ServerEvent, { type: 'stream.partial' }>).payload.delta
    );
    expect(sent.join('')).toBe(deltas.join(''));
  });

  it('keeps interleaved thinking/text deltas in order as separate runs', () => {
    const sink = vi.fn();
    const b = new StreamDeltaBatcher(sink, { flushMs: 16 });
    b.send(thinking('s1', 'think1'));
    b.send(thinking('s1', 'think2'));
    b.send(partial('s1', 'text1'));
    b.send(thinking('s1', 'think3'));
    vi.advanceTimersByTime(16);
    expect(sink.mock.calls.map((c) => c[0])).toEqual([
      thinking('s1', 'think1think2'),
      partial('s1', 'text1'),
      thinking('s1', 'think3'),
    ]);
  });

  it('flushes pending deltas before forwarding a non-delta event (ordering)', () => {
    const sink = vi.fn();
    const b = new StreamDeltaBatcher(sink);
    b.send(partial('s1', 'streamed'));
    const message: ServerEvent = {
      type: 'stream.message',
      payload: {
        sessionId: 's1',
        message: {
          id: 'm1',
          sessionId: 's1',
          role: 'assistant',
          content: [{ type: 'text', text: 'streamed' }],
          timestamp: 0,
        },
      },
    };
    b.send(message);
    // delta must arrive first, then the message — no timer needed
    expect(sink.mock.calls.map((c) => (c[0] as ServerEvent).type)).toEqual([
      'stream.partial',
      'stream.message',
    ]);
  });

  it('flushes eagerly when the char threshold is exceeded', () => {
    const sink = vi.fn();
    const b = new StreamDeltaBatcher(sink, { flushMs: 1000, maxChars: 10 });
    b.send(partial('s1', '123456'));
    expect(sink).not.toHaveBeenCalled();
    b.send(partial('s1', '7890')); // total 10 → eager flush
    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink).toHaveBeenCalledWith(partial('s1', '1234567890'));
  });

  it('buffers per session independently', () => {
    const sink = vi.fn();
    const b = new StreamDeltaBatcher(sink, { flushMs: 16 });
    b.send(partial('s1', 'a'));
    b.send(partial('s2', 'b'));
    b.flush('s1');
    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink).toHaveBeenCalledWith(partial('s1', 'a'));
    b.flush('s2');
    expect(sink).toHaveBeenCalledWith(partial('s2', 'b'));
  });

  it('flush() on an empty session is a no-op', () => {
    const sink = vi.fn();
    const b = new StreamDeltaBatcher(sink);
    b.flush('nope');
    expect(sink).not.toHaveBeenCalled();
  });
});
