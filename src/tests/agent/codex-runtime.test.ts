import { describe, it, expect, vi } from 'vitest';
import {
  CodexRuntime,
  type CodexClientLike,
  type CodexRuntimeEmitters,
} from '@/main/agent/codex-runtime/codex-runtime';
import {
  CodexPermissionBridge,
  COMMAND_APPROVAL_METHOD,
} from '@/main/agent/codex-runtime/codex-permission-bridge';
import {
  CodexToolBridge,
  TOOL_CALL_METHOD,
  type CodexHostTool,
} from '@/main/agent/codex-runtime/codex-tool-bridge';
import type {
  CodexInitializeResponse,
  CodexNotification,
  CodexNotificationListener,
  CodexServerRequest,
  CodexServerRequestHandler,
  CodexThreadStartParams,
  CodexThreadStartResponse,
  CodexTurnInterruptParams,
  CodexTurnStartParams,
  CodexTurnStartResponse,
  CodexTurnSteerParams,
  CodexTurnSteerResponse,
} from '@/main/agent/codex-runtime/codex-client';

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

const INIT_RESPONSE: CodexInitializeResponse = {
  userAgent: 'fake/0',
  codexHome: '/tmp',
  platformFamily: 'unix',
  platformOs: 'macos',
};

/** A fake CodexClient that lets the test push notifications + invoke server requests. */
class FakeCodexClient implements CodexClientLike {
  ready = false;
  startCalls = 0;
  disposed = false;
  threadId = 'thread-1';
  turnId = 'turn-1';

  notificationListener: CodexNotificationListener | null = null;
  serverRequestHandler: CodexServerRequestHandler | null = null;
  threadStartCalls: CodexThreadStartParams[] = [];
  turnStartCalls: CodexTurnStartParams[] = [];
  steerCalls: CodexTurnSteerParams[] = [];
  interruptCalls: CodexTurnInterruptParams[] = [];

  isReady(): boolean {
    return this.ready;
  }

  async start(): Promise<CodexInitializeResponse> {
    this.startCalls += 1;
    this.ready = true;
    return INIT_RESPONSE;
  }

  onNotification(listener: CodexNotificationListener): () => void {
    this.notificationListener = listener;
    return () => {
      this.notificationListener = null;
    };
  }

  setServerRequestHandler(handler: CodexServerRequestHandler | null): void {
    this.serverRequestHandler = handler;
  }

  async threadStart(params: CodexThreadStartParams): Promise<CodexThreadStartResponse> {
    this.threadStartCalls.push(params);
    return { thread: { id: this.threadId }, model: 'gpt', modelProvider: 'openai' };
  }

  async turnStart(params: CodexTurnStartParams): Promise<CodexTurnStartResponse> {
    this.turnStartCalls.push(params);
    return { turn: { id: this.turnId } };
  }

  async turnSteer(params: CodexTurnSteerParams): Promise<CodexTurnSteerResponse> {
    this.steerCalls.push(params);
    return { turnId: params.expectedTurnId };
  }

  async turnInterrupt(params: CodexTurnInterruptParams): Promise<Record<string, never>> {
    this.interruptCalls.push(params);
    return {};
  }

  dispose(): void {
    this.disposed = true;
  }

  emit(notification: CodexNotification): void {
    this.notificationListener?.(notification);
  }

  invokeServerRequest(request: CodexServerRequest): Promise<unknown> {
    if (!this.serverRequestHandler) throw new Error('no handler');
    return Promise.resolve(this.serverRequestHandler(request));
  }
}

function makeEmitters(): CodexRuntimeEmitters & {
  calls: Record<string, ReturnType<typeof vi.fn>>;
} {
  const calls = {
    sendPartial: vi.fn(),
    sendToRenderer: vi.fn(),
    sendTraceStep: vi.fn(),
    sendTraceUpdate: vi.fn(),
    sendMessage: vi.fn(),
    onTokenUsage: vi.fn(),
    onCompaction: vi.fn(),
    onError: vi.fn(),
  };
  return { ...calls, calls };
}

function makeRuntime(
  client: FakeCodexClient,
  overrides?: {
    emitters?: ReturnType<typeof makeEmitters>;
    permissionBridge?: CodexPermissionBridge;
    toolBridge?: CodexToolBridge;
  }
) {
  const emitters = overrides?.emitters ?? makeEmitters();
  const permissionBridge =
    overrides?.permissionBridge ?? new CodexPermissionBridge({ decide: () => 'allow' });
  const toolBridge = overrides?.toolBridge ?? new CodexToolBridge();
  const runtime = new CodexRuntime({ client, emitters, permissionBridge, toolBridge });
  return { runtime, emitters, permissionBridge, toolBridge };
}

const deltaNotification = (delta: string): CodexNotification => ({
  method: 'item/agentMessage/delta',
  params: { threadId: 'thread-1', turnId: 'turn-1', itemId: 'i1', delta },
});

const completedNotification = (): CodexNotification => ({
  method: 'turn/completed',
  params: { threadId: 'thread-1', turn: { id: 'turn-1' } },
});

describe('CodexRuntime', () => {
  it('starts the client, opens a thread, and streams a turn to the emitters', async () => {
    const client = new FakeCodexClient();
    const { runtime, emitters } = makeRuntime(client);

    const turn = runtime.runTurn({ sessionId: 's1', input: 'hi', model: 'gpt', cwd: '/w' });
    await flush();

    expect(client.startCalls).toBe(1);
    expect(client.threadStartCalls[0]).toMatchObject({
      sandbox: 'danger-full-access',
      approvalPolicy: 'on-request',
      model: 'gpt',
      cwd: '/w',
    });
    expect(client.turnStartCalls[0].input).toEqual([{ type: 'text', text: 'hi' }]);

    client.emit(deltaNotification('Hello'));
    client.emit(completedNotification());
    const result = await turn;

    expect(emitters.calls.sendPartial).toHaveBeenCalledWith('s1', 'Hello');
    // The end-of-turn assembles a single assistant message from the accumulated delta.
    expect(emitters.calls.sendMessage).toHaveBeenCalledTimes(1);
    const [, message] = emitters.calls.sendMessage.mock.calls[0];
    expect(message.content).toEqual([{ type: 'text', text: 'Hello' }]);
    expect(result.turnId).toBe('turn-1');
  });

  it('routes a thinking action through sendToRenderer as a stream.thinking event', async () => {
    const client = new FakeCodexClient();
    const { runtime, emitters } = makeRuntime(client);

    const turn = runtime.runTurn({ sessionId: 's1', input: 'hi' });
    await flush();
    client.emit({
      method: 'item/reasoning/textDelta',
      params: { threadId: 'thread-1', turnId: 'turn-1', itemId: 'r', delta: 'thinking...' },
    });
    client.emit(completedNotification());
    await turn;

    expect(emitters.calls.sendToRenderer).toHaveBeenCalledWith({
      type: 'stream.thinking',
      payload: { sessionId: 's1', delta: 'thinking...' },
    });
  });

  it('forwards token-usage and compaction actions to their semantic callbacks', async () => {
    const client = new FakeCodexClient();
    const { runtime, emitters } = makeRuntime(client);

    const turn = runtime.runTurn({ sessionId: 's1', input: 'hi' });
    await flush();
    client.emit({
      method: 'thread/tokenUsage/updated',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        tokenUsage: {
          last: { totalTokens: 30, inputTokens: 20, outputTokens: 10 },
          modelContextWindow: 128000,
        },
      },
    });
    client.emit({ method: 'thread/compacted', params: { threadId: 'thread-1', turnId: 'turn-1' } });
    client.emit(completedNotification());
    await turn;

    expect(emitters.calls.onTokenUsage).toHaveBeenCalledWith({
      sessionId: 's1',
      tokenUsage: { input: 20, output: 10 },
      contextWindow: 128000,
    });
    expect(emitters.calls.onCompaction).toHaveBeenCalledWith({ sessionId: 's1', turnId: 'turn-1' });
  });

  it('keeps the app-server warm and reuses the thread across turns', async () => {
    const client = new FakeCodexClient();
    const { runtime } = makeRuntime(client);

    const t1 = runtime.runTurn({ sessionId: 's1', input: 'one' });
    await flush();
    client.emit(completedNotification());
    await t1;

    const t2 = runtime.runTurn({ sessionId: 's1', input: 'two' });
    await flush();
    client.emit(completedNotification());
    await t2;

    expect(client.startCalls).toBe(1);
    expect(client.threadStartCalls).toHaveLength(1);
    expect(client.turnStartCalls).toHaveLength(2);
  });

  it('rejects a second concurrent turn for the same session', async () => {
    const client = new FakeCodexClient();
    const { runtime } = makeRuntime(client);

    const t1 = runtime.runTurn({ sessionId: 's1', input: 'one' });
    await flush();
    await expect(runtime.runTurn({ sessionId: 's1', input: 'two' })).rejects.toThrow(
      /already in progress/
    );

    client.emit(completedNotification());
    await t1;
  });

  it('steers and interrupts the active turn with the resolved turn id', async () => {
    const client = new FakeCodexClient();
    const { runtime } = makeRuntime(client);

    const turn = runtime.runTurn({ sessionId: 's1', input: 'go' });
    await flush();

    await runtime.steer('s1', 'stop that');
    expect(client.steerCalls[0]).toEqual({
      threadId: 'thread-1',
      input: [{ type: 'text', text: 'stop that' }],
      expectedTurnId: 'turn-1',
    });

    await runtime.interrupt('s1');
    expect(client.interruptCalls[0]).toEqual({ threadId: 'thread-1', turnId: 'turn-1' });

    client.emit(completedNotification());
    await turn;
  });

  it('throws when steering with no active turn', async () => {
    const client = new FakeCodexClient();
    const { runtime } = makeRuntime(client);
    await expect(runtime.steer('s1', 'x')).rejects.toThrow(/no active turn/);
  });

  it('rejects the turn and reports onError on turn/failed', async () => {
    const client = new FakeCodexClient();
    const { runtime, emitters } = makeRuntime(client);

    const turn = runtime.runTurn({ sessionId: 's1', input: 'hi' });
    await flush();
    client.emit({
      method: 'turn/failed',
      params: { threadId: 'thread-1', turnId: 'turn-1', error: { message: 'model exploded' } },
    });

    await expect(turn).rejects.toThrow('model exploded');
    expect(emitters.calls.onError).toHaveBeenCalledWith({
      sessionId: 's1',
      message: 'model exploded',
      willRetry: false,
    });
  });

  it('answers a permission server-request through the permission bridge', async () => {
    const client = new FakeCodexClient();
    const permissionBridge = new CodexPermissionBridge({ decide: () => 'allow' });
    const { runtime } = makeRuntime(client, { permissionBridge });

    // Establish the thread↔session mapping first.
    const turn = runtime.runTurn({ sessionId: 's1', input: 'hi' });
    await flush();

    const decision = await client.invokeServerRequest({
      id: 1,
      method: COMMAND_APPROVAL_METHOD,
      params: { threadId: 'thread-1', command: 'ls' },
    });
    expect(decision).toEqual({ decision: 'accept' });

    client.emit(completedNotification());
    await turn;
    void runtime;
  });

  it('answers a tool server-request through the tool bridge', async () => {
    const client = new FakeCodexClient();
    const echo: CodexHostTool = {
      name: 'echo',
      description: '',
      parameters: {},
      execute: (args) => ({ content: `got:${String(args.v)}` }),
    };
    const toolBridge = new CodexToolBridge([echo]);
    makeRuntime(client, { toolBridge });

    const res = await client.invokeServerRequest({
      id: 2,
      method: TOOL_CALL_METHOD,
      params: { threadId: 'thread-1', tool: 'echo', arguments: { v: 42 } },
    });
    expect(res).toEqual({ content_items: [{ type: 'text', text: 'got:42' }], success: true });
  });

  it('rejects an unhandled server-request method', async () => {
    const client = new FakeCodexClient();
    makeRuntime(client);
    await expect(
      client.invokeServerRequest({ id: 3, method: 'unknown/method', params: {} })
    ).rejects.toThrow(/Unhandled codex server request/);
  });

  it('disposes: unsubscribes, rejects active turns, and disposes the client', async () => {
    const client = new FakeCodexClient();
    const { runtime } = makeRuntime(client);

    const turn = runtime.runTurn({ sessionId: 's1', input: 'hi' });
    await flush();

    runtime.dispose();
    await expect(turn).rejects.toThrow(/disposed/);
    expect(client.disposed).toBe(true);
    expect(client.notificationListener).toBeNull();
    expect(client.serverRequestHandler).toBeNull();
  });
});
