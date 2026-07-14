import { describe, it, expect } from 'vitest';
import {
  runCodexSubagent,
  type CodexSubagentClientLike,
  type CodexSubagentProgress,
} from '@/main/agent/codex-runtime/codex-subagent';
import type {
  CodexInitializeResponse,
  CodexNotification,
  CodexNotificationListener,
  CodexThreadStartParams,
  CodexThreadStartResponse,
  CodexTurnInterruptParams,
  CodexTurnStartParams,
  CodexTurnStartResponse,
} from '@/main/agent/codex-runtime/codex-client';

const INIT_RESPONSE: CodexInitializeResponse = {
  userAgent: 'fake/0',
  codexHome: '/tmp',
  platformFamily: 'unix',
  platformOs: 'macos',
};

const delta = (text: string): CodexNotification => ({
  method: 'item/agentMessage/delta',
  params: { threadId: 'child-1', turnId: 'turn-1', itemId: 'i1', delta: text },
});
const completed = (): CodexNotification => ({
  method: 'turn/completed',
  params: { threadId: 'child-1', turn: { id: 'turn-1' } },
});
const failed = (message: string): CodexNotification => ({
  method: 'turn/failed',
  params: { threadId: 'child-1', turnId: 'turn-1', error: { message } },
});

/** A fake app-server client that replays a scripted notification stream per turn. */
class FakeSubagentClient implements CodexSubagentClientLike {
  ready = true;
  startCalls = 0;
  listener: CodexNotificationListener | null = null;
  threadStartCalls: CodexThreadStartParams[] = [];
  turnStartCalls: CodexTurnStartParams[] = [];
  interruptCalls: CodexTurnInterruptParams[] = [];

  constructor(private readonly script: CodexNotification[]) {}

  isReady(): boolean {
    return this.ready;
  }
  async start(): Promise<CodexInitializeResponse> {
    this.startCalls += 1;
    this.ready = true;
    return INIT_RESPONSE;
  }
  onNotification(listener: CodexNotificationListener): () => void {
    this.listener = listener;
    return () => {
      this.listener = null;
    };
  }
  async threadStart(params: CodexThreadStartParams): Promise<CodexThreadStartResponse> {
    this.threadStartCalls.push(params);
    return { thread: { id: 'child-1' }, model: 'gpt', modelProvider: 'openai' };
  }
  async turnStart(params: CodexTurnStartParams): Promise<CodexTurnStartResponse> {
    this.turnStartCalls.push(params);
    setImmediate(() => {
      for (const n of this.script) this.listener?.(n);
    });
    return { turn: { id: 'turn-1' } };
  }
  async turnInterrupt(params: CodexTurnInterruptParams): Promise<Record<string, never>> {
    this.interruptCalls.push(params);
    return {};
  }
}

describe('runCodexSubagent', () => {
  it('starts a child thread, sends the task, and collects the final text', async () => {
    const client = new FakeSubagentClient([delta('the answer'), completed()]);
    const progress: CodexSubagentProgress[] = [];

    const result = await runCodexSubagent(
      {
        task: 'do a thing',
        model: 'gpt',
        modelProvider: 'openai',
        onProgress: (p) => progress.push(p),
      },
      { client, subagentId: 'sub-1' }
    );

    // A dedicated child thread is opened with the task baked into baseInstructions.
    expect(client.threadStartCalls).toHaveLength(1);
    expect(client.threadStartCalls[0].baseInstructions).toContain('do a thing');
    expect(client.threadStartCalls[0]).toMatchObject({ model: 'gpt', modelProvider: 'openai' });
    expect(client.turnStartCalls[0].input).toEqual([{ type: 'text', text: 'do a thing' }]);

    expect(result.status).toBe('completed');
    expect(result.text).toBe('the answer');
    expect(progress.map((p) => p.event)).toEqual(expect.arrayContaining(['started', 'completed']));
    // No leaked subscription on the shared client.
    expect(client.listener).toBeNull();
    // A clean completion never interrupts.
    expect(client.interruptCalls).toHaveLength(0);
  });

  it('starts the app-server when it is not yet ready', async () => {
    const client = new FakeSubagentClient([delta('ok'), completed()]);
    client.ready = false;
    const result = await runCodexSubagent({ task: 't' }, { client });
    expect(client.startCalls).toBe(1);
    expect(result.status).toBe('completed');
  });

  it('rejects an empty task without opening a thread', async () => {
    const client = new FakeSubagentClient([]);
    const result = await runCodexSubagent({ task: '   ' }, { client });
    expect(result.status).toBe('error');
    expect(result.error).toContain('task parameter is required');
    expect(client.threadStartCalls).toHaveLength(0);
  });

  it('times out, interrupts the child turn, and disposes the subscription', async () => {
    // Script never completes the turn → the timeout fires.
    const client = new FakeSubagentClient([delta('partial work')]);
    const result = await runCodexSubagent({ task: 'slow task', timeoutMs: 20 }, { client });

    expect(result.status).toBe('timeout');
    expect(client.interruptCalls).toEqual([{ threadId: 'child-1', turnId: 'turn-1' }]);
    // Partial text is still returned as a best-effort result.
    expect(result.text).toBe('partial work');
    expect(client.listener).toBeNull();
  });

  it('cancels via the parent abort signal and interrupts the child turn', async () => {
    const controller = new AbortController();
    controller.abort();
    const client = new FakeSubagentClient([]);

    const result = await runCodexSubagent(
      { task: 'work', timeoutMs: 5000, parentSignal: controller.signal },
      { client }
    );

    expect(result.status).toBe('cancelled');
    expect(client.interruptCalls).toEqual([{ threadId: 'child-1', turnId: 'turn-1' }]);
    expect(client.listener).toBeNull();
  });

  it('reports an error result (never throws) when the turn fails', async () => {
    const client = new FakeSubagentClient([failed('model exploded')]);
    const result = await runCodexSubagent({ task: 'work' }, { client });
    expect(result.status).toBe('error');
    expect(result.error).toBe('model exploded');
    expect(client.interruptCalls).toEqual([{ threadId: 'child-1', turnId: 'turn-1' }]);
  });
});
