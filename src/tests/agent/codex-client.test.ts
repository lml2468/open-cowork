import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import {
  CodexClient,
  CodexRpcError,
  type CodexChildProcessLike,
  type CodexNotification,
  type CodexServerRequest,
} from '@/main/agent/codex-runtime/codex-client';

/** A fake `codex app-server` child: PassThrough streams + emittable exit. */
class FakeChild extends EventEmitter implements CodexChildProcessLike {
  readonly stdin = new PassThrough();
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly pid = 4242;
  killed = false;
  lastSignal: NodeJS.Signals | number | undefined;

  kill(signal?: NodeJS.Signals | number): boolean {
    this.killed = true;
    this.lastSignal = signal;
    return true;
  }

  simulateExit(code: number | null, signal: NodeJS.Signals | null = null): void {
    this.emit('exit', code, signal);
  }
}

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

interface SentMessage {
  id?: number | string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string };
}

/**
 * Wire a fake child + client. Captures everything the client writes to stdin and
 * auto-answers the `initialize` handshake so `start()` resolves.
 */
function setup(options?: { autoRestart?: boolean }) {
  const child = new FakeChild();
  const sent: SentMessage[] = [];

  let stdinBuffer = '';
  child.stdin.on('data', (chunk: Buffer) => {
    stdinBuffer += chunk.toString('utf8');
    let nl: number;
    while ((nl = stdinBuffer.indexOf('\n')) >= 0) {
      const line = stdinBuffer.slice(0, nl).trim();
      stdinBuffer = stdinBuffer.slice(nl + 1);
      if (!line) continue;
      const msg = JSON.parse(line) as SentMessage;
      sent.push(msg);
      // Auto-answer the handshake.
      if (msg.method === 'initialize' && msg.id !== undefined) {
        writeServer({
          id: msg.id,
          result: {
            userAgent: 'codex-fake/0.0.0',
            codexHome: '/tmp/codex',
            platformFamily: 'unix',
            platformOs: 'macos',
          },
        });
      }
    }
  });

  const client = new CodexClient({
    clientInfo: { name: 'cowork-test', version: '0.0.0' },
    spawn: () => child,
    autoRestart: options?.autoRestart ?? false,
    baseRestartDelayMs: 1,
    maxRestartDelayMs: 5,
  });

  function writeServer(obj: SentMessage): void {
    child.stdout.write(JSON.stringify(obj) + '\n');
  }

  function lastSent(): SentMessage {
    return sent[sent.length - 1];
  }

  return { child, client, sent, writeServer, lastSent };
}

describe('CodexClient transport', () => {
  it('completes the initialize handshake and becomes ready', async () => {
    const { client, sent } = setup();
    const res = await client.start();
    expect(res.userAgent).toBe('codex-fake/0.0.0');
    expect(client.isReady()).toBe(true);
    expect(sent[0]?.method).toBe('initialize');
  });

  it('correlates a request with its response by id', async () => {
    const { client, writeServer, lastSent } = setup();
    await client.start();

    const promise = client.turnStart({
      threadId: 't1',
      input: [{ type: 'text', text: 'hi' }],
    });
    await flush();
    const req = lastSent();
    expect(req.method).toBe('turn/start');
    expect(typeof req.id).toBe('number');

    writeServer({ id: req.id, result: { turn: { id: 'turn-1' } } });
    await expect(promise).resolves.toEqual({ turn: { id: 'turn-1' } });
  });

  it('rejects a request when the server returns an error', async () => {
    const { client, writeServer, lastSent } = setup();
    await client.start();

    const promise = client.threadStart({ cwd: '/tmp' });
    await flush();
    const req = lastSent();
    writeServer({ id: req.id, error: { code: -32000, message: 'boom' } });

    await expect(promise).rejects.toBeInstanceOf(CodexRpcError);
    await promise.catch((err: unknown) => {
      expect(err).toBeInstanceOf(CodexRpcError);
      if (err instanceof CodexRpcError) {
        expect(err.code).toBe(-32000);
        expect(err.message).toBe('boom');
      }
    });
  });

  it('dispatches server notifications to listeners', async () => {
    const { client, writeServer } = setup();
    await client.start();

    const received: CodexNotification[] = [];
    client.onNotification((n) => received.push(n));

    writeServer({ method: 'item/agentMessage/delta', params: { delta: 'PONG' } });
    await flush();

    expect(received).toHaveLength(1);
    expect(received[0].method).toBe('item/agentMessage/delta');
    expect(received[0].params).toEqual({ delta: 'PONG' });
  });

  it('reassembles messages split across chunk boundaries', async () => {
    const { client, child } = setup();
    await client.start();

    const received: CodexNotification[] = [];
    client.onNotification((n) => received.push(n));

    const full = JSON.stringify({ method: 'turn/completed', params: { turnId: 'x' } }) + '\n';
    const mid = Math.floor(full.length / 2);
    child.stdout.write(full.slice(0, mid));
    await flush();
    expect(received).toHaveLength(0); // incomplete line — nothing dispatched yet
    child.stdout.write(full.slice(mid));
    await flush();

    expect(received).toHaveLength(1);
    expect(received[0].method).toBe('turn/completed');
  });

  it('handles two messages arriving in one chunk', async () => {
    const { client, child } = setup();
    await client.start();

    const received: CodexNotification[] = [];
    client.onNotification((n) => received.push(n));

    const line1 = JSON.stringify({ method: 'a', params: 1 });
    const line2 = JSON.stringify({ method: 'b', params: 2 });
    child.stdout.write(line1 + '\n' + line2 + '\n');
    await flush();

    expect(received.map((n) => n.method)).toEqual(['a', 'b']);
  });

  it('answers a server-to-host request via the registered handler', async () => {
    const { client, writeServer, sent } = setup();
    await client.start();

    const seen: CodexServerRequest[] = [];
    client.setServerRequestHandler((req) => {
      seen.push(req);
      return { decision: 'accept' };
    });

    writeServer({
      id: 100,
      method: 'item/commandExecution/requestApproval',
      params: { command: 'rm -rf /tmp/x' },
    });
    await flush();
    await flush();

    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe('item/commandExecution/requestApproval');

    const reply = sent.find((m) => m.id === 100 && m.result !== undefined);
    expect(reply?.result).toEqual({ decision: 'accept' });
  });

  it('returns a JSON-RPC error when a server request has no handler', async () => {
    const { client, writeServer, sent } = setup();
    await client.start();

    writeServer({ id: 200, method: 'item/tool/call', params: {} });
    await flush();

    const reply = sent.find((m) => m.id === 200);
    expect(reply?.error?.code).toBe(-32601);
  });

  it('propagates a thrown handler error as a JSON-RPC error response', async () => {
    const { client, writeServer, sent } = setup();
    await client.start();

    client.setServerRequestHandler(() => {
      throw new Error('handler failed');
    });
    writeServer({ id: 300, method: 'item/tool/call', params: {} });
    await flush();
    await flush();

    const reply = sent.find((m) => m.id === 300);
    expect(reply?.error?.message).toBe('handler failed');
  });

  it('ignores non-JSON lines without crashing', async () => {
    const { client, child, writeServer } = setup();
    await client.start();

    const received: CodexNotification[] = [];
    client.onNotification((n) => received.push(n));

    child.stdout.write('not json at all\n');
    writeServer({ method: 'item/started', params: {} });
    await flush();

    expect(received.map((n) => n.method)).toEqual(['item/started']);
  });

  it('kills the child and reports stopped on dispose', async () => {
    const { client, child } = setup();
    await client.start();

    client.dispose();
    expect(child.killed).toBe(true);
    expect(child.lastSignal).toBe('SIGTERM');
    expect(client.getState()).toBe('stopped');
  });

  it('rejects in-flight requests when the child exits', async () => {
    const { client, child } = setup();
    await client.start();

    const promise = client.threadStart({ cwd: '/tmp' });
    await flush();
    child.simulateExit(1, null);

    await expect(promise).rejects.toThrow(/exited/);
  });

  it('rejects new requests after dispose', async () => {
    const { client } = setup();
    await client.start();
    client.dispose();
    await expect(client.turnInterrupt({ threadId: 't', turnId: 'x' })).rejects.toThrow(/disposed/);
  });

  it('rejects (does not throw) when the child is not running', async () => {
    const { client } = setup();
    // No start() — the child has no live stdin yet.
    await expect(client.turnInterrupt({ threadId: 't', turnId: 'x' })).rejects.toThrow(
      /not running/
    );
  });

  it('restarts on unexpected exit when autoRestart is enabled', async () => {
    const children = [new FakeChild(), new FakeChild()];
    let spawnCount = 0;

    // Auto-answer initialize on both children.
    for (const c of children) {
      let buf = '';
      c.stdin.on('data', (chunk: Buffer) => {
        buf += chunk.toString('utf8');
        let nl: number;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const msg = JSON.parse(line) as SentMessage;
          if (msg.method === 'initialize' && msg.id !== undefined) {
            c.stdout.write(
              JSON.stringify({
                id: msg.id,
                result: {
                  userAgent: 'x',
                  codexHome: '/tmp',
                  platformFamily: 'unix',
                  platformOs: 'macos',
                },
              }) + '\n'
            );
          }
        }
      });
    }

    const client = new CodexClient({
      clientInfo: { name: 't', version: '0' },
      spawn: () => children[spawnCount++],
      autoRestart: true,
      maxRestarts: 3,
      baseRestartDelayMs: 5,
      maxRestartDelayMs: 20,
    });

    await client.start();
    expect(spawnCount).toBe(1);

    children[0].simulateExit(1, null);
    expect(client.getState()).toBe('crashed');

    // Wait past the (~5ms) restart backoff plus the re-initialize round trip.
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(spawnCount).toBe(2);
    expect(client.isReady()).toBe(true);

    client.dispose();
  });
});
