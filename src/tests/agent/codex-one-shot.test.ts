import { describe, it, expect } from 'vitest';
import {
  runCodexOneShot,
  generateTitleWithCodex,
  testCodexConnectivity,
  type CodexOneShotClientLike,
} from '@/main/agent/codex-runtime/codex-one-shot';
import type {
  CodexInitializeResponse,
  CodexNotification,
  CodexNotificationListener,
  CodexThreadStartParams,
  CodexThreadStartResponse,
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
  params: { threadId: 'thread-1', turnId: 'turn-1', itemId: 'i1', delta: text },
});
const reasoning = (text: string): CodexNotification => ({
  method: 'item/reasoning/textDelta',
  params: { threadId: 'thread-1', turnId: 'turn-1', itemId: 'r1', delta: text },
});
const completed = (): CodexNotification => ({
  method: 'turn/completed',
  params: { threadId: 'thread-1', turn: { id: 'turn-1' } },
});
const failed = (message: string): CodexNotification => ({
  method: 'turn/failed',
  params: { threadId: 'thread-1', turnId: 'turn-1', error: { message } },
});

/** A fake client that replays a scripted notification stream when a turn starts. */
class FakeOneShotClient implements CodexOneShotClientLike {
  ready = false;
  startCalls = 0;
  listener: CodexNotificationListener | null = null;
  threadStartCalls: CodexThreadStartParams[] = [];
  turnStartCalls: CodexTurnStartParams[] = [];

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
    return { thread: { id: 'thread-1' }, model: 'gpt', modelProvider: 'openai' };
  }
  async turnStart(params: CodexTurnStartParams): Promise<CodexTurnStartResponse> {
    this.turnStartCalls.push(params);
    // Replay after the race is established (avoids an unhandled-rejection window).
    setImmediate(() => {
      for (const n of this.script) this.listener?.(n);
    });
    return { turn: { id: 'turn-1' } };
  }
}

describe('runCodexOneShot', () => {
  it('starts the client, opens a read-only ephemeral thread, and returns the text', async () => {
    const client = new FakeOneShotClient([delta('Hello '), delta('world'), completed()]);
    const result = await runCodexOneShot(
      { prompt: 'hi', systemPrompt: 'be brief', model: 'gpt', modelProvider: 'openai' },
      { client }
    );

    expect(client.startCalls).toBe(1);
    expect(client.threadStartCalls[0]).toMatchObject({
      approvalPolicy: 'never',
      sandbox: 'read-only',
      baseInstructions: 'be brief',
      model: 'gpt',
      modelProvider: 'openai',
    });
    expect(client.turnStartCalls[0].input).toEqual([{ type: 'text', text: 'hi' }]);
    expect(result.text).toBe('Hello world');
    expect(result.hasThinking).toBe(false);
    // The subscription is torn down after the turn (no listener leak).
    expect(client.listener).toBeNull();
  });

  it('reports hasThinking when reasoning deltas stream', async () => {
    const client = new FakeOneShotClient([reasoning('mulling...'), delta('42'), completed()]);
    const result = await runCodexOneShot({ prompt: 'q', systemPrompt: 's' }, { client });
    expect(result.hasThinking).toBe(true);
    expect(result.text).toBe('42');
  });

  it('does not re-start an already-ready client', async () => {
    const client = new FakeOneShotClient([delta('ok'), completed()]);
    client.ready = true;
    await runCodexOneShot({ prompt: 'q', systemPrompt: 's' }, { client });
    expect(client.startCalls).toBe(0);
  });

  it('rejects when the turn fails', async () => {
    const client = new FakeOneShotClient([failed('model exploded')]);
    await expect(runCodexOneShot({ prompt: 'q', systemPrompt: 's' }, { client })).rejects.toThrow(
      'model exploded'
    );
    expect(client.listener).toBeNull();
  });
});

describe('generateTitleWithCodex', () => {
  it('returns a normalized title from the one-shot text', async () => {
    const client = new FakeOneShotClient([delta('"My Great Title"'), completed()]);
    const title = await generateTitleWithCodex({ titlePrompt: 'summarize' }, { client });
    expect(title).toBe('My Great Title');
  });

  it('returns null (never throws) when the turn fails', async () => {
    const client = new FakeOneShotClient([failed('boom')]);
    const title = await generateTitleWithCodex({ titlePrompt: 'summarize' }, { client });
    expect(title).toBeNull();
  });
});

describe('testCodexConnectivity', () => {
  it('returns ok when the probe echoes the ack token', async () => {
    const client = new FakeOneShotClient([delta('The answer is 4. sdk_probe_ok'), completed()]);
    const result = await testCodexConnectivity({}, { client });
    expect(result.ok).toBe(true);
  });

  it('returns a mismatch error when the ack token is missing', async () => {
    const client = new FakeOneShotClient([delta('The answer is 4.'), completed()]);
    const result = await testCodexConnectivity({}, { client });
    expect(result.ok).toBe(false);
    expect(result.errorType).toBe('unknown');
    expect(result.details).toContain('probe_response_mismatch');
  });

  it('classifies an auth failure as unauthorized', async () => {
    const client = new FakeOneShotClient([failed('401 unauthorized: invalid api key')]);
    const result = await testCodexConnectivity({}, { client });
    expect(result.ok).toBe(false);
    expect(result.errorType).toBe('unauthorized');
  });

  it('classifies a connection failure as a network error', async () => {
    const client = new FakeOneShotClient([failed('ECONNREFUSED connecting to host')]);
    const result = await testCodexConnectivity({}, { client });
    expect(result.ok).toBe(false);
    expect(result.errorType).toBe('network_error');
  });
});
