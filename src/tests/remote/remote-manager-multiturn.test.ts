import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Regression tests for src/main/remote/remote-manager.ts multi-turn session
 * id mapping (issue #291).
 *
 * The bug: clearSessionBuffer() ran on every turn completion and tore down the
 * persistent session id mappings, while remoteSessionIds (only ever added to)
 * kept the remote id. The next turn saw isNewSession === false but could not
 * resolve the actual session id and threw "No actual session ID found".
 */

vi.mock('electron', () => {
  const app = {
    getPath: () => '/tmp/test-user-data',
    getVersion: () => '0.0.0-test',
    isPackaged: false,
    on: vi.fn(),
    getName: () => 'test',
    name: 'test',
  };
  const ipcMain = { on: vi.fn(), handle: vi.fn() };
  const shell = {};
  const electron = { app, ipcMain, shell, BrowserWindow: vi.fn() };
  return { ...electron, default: electron };
});

vi.mock('../../main/utils/logger', () => ({
  log: vi.fn(),
  logError: vi.fn(),
  logWarn: vi.fn(),
}));

import { RemoteManager, type AgentExecutor } from '../../main/remote/remote-manager';
import type { RemoteMessage } from '../../main/remote/types';

/** Route a message the way channels do (via the public RemoteManager API). */
function route(manager: RemoteManager, message: RemoteMessage): Promise<void> {
  return manager.routeMessage(message);
}

function makeMessage(channelId: string, text: string): RemoteMessage {
  return {
    id: `msg-${Math.random().toString(36).slice(2)}`,
    channelType: 'stdio' as RemoteMessage['channelType'],
    channelId,
    sender: { id: 'stdio-user', name: 'stdio', isBot: false },
    content: { type: 'text', text },
    timestamp: 1_700_000_000_000,
    isGroup: false,
    isMentioned: true,
  };
}

describe('RemoteManager multi-turn session mapping (issue #291)', () => {
  let manager: RemoteManager;
  let startSession: ReturnType<typeof vi.fn>;
  let continueSession: ReturnType<typeof vi.fn>;
  let sessionCounter: number;

  beforeEach(() => {
    manager = new RemoteManager();
    sessionCounter = 0;
    startSession = vi.fn(async (_title: string, prompt: string, cwd?: string) => {
      sessionCounter++;
      return {
        id: `actual-session-${sessionCounter}`,
        title: prompt.slice(0, 10),
        cwd,
        messages: [],
      } as unknown as Awaited<ReturnType<AgentExecutor['startSession']>>;
    });
    continueSession = vi.fn(async () => {});

    const executor = {
      startSession,
      continueSession,
      stopSession: vi.fn(async () => {}),
    } as unknown as AgentExecutor;
    manager.setAgentExecutor(executor);
    // No renderer callback needed; emitRemoteUserMessage no-ops without one.
  });

  it('continues an existing session on the second turn instead of throwing', async () => {
    const channelId = 'stdio-abc';

    // Turn 1: starts a new session.
    await route(manager, makeMessage(channelId, 'hello'));
    expect(startSession).toHaveBeenCalledTimes(1);
    expect(continueSession).not.toHaveBeenCalled();

    const actualSessionId = 'actual-session-1';
    expect(manager.isRemoteSession(actualSessionId)).toBe(true);

    // Simulate turn completion clearing the ephemeral buffer
    // (this is what session.status idle/error triggers in index.ts).
    await manager.clearSessionBuffer(actualSessionId);

    // The persistent mapping must survive the per-turn cleanup.
    expect(manager.isRemoteSession(actualSessionId)).toBe(true);

    // Turn 2: same channel session -> must continue, not throw, not re-start.
    await expect(route(manager, makeMessage(channelId, 'again'))).resolves.not.toThrow();
    expect(startSession).toHaveBeenCalledTimes(1);
    expect(continueSession).toHaveBeenCalledTimes(1);
    expect(continueSession).toHaveBeenCalledWith(
      actualSessionId,
      'again',
      expect.anything(),
      undefined
    );
  });

  it('clearSessionBuffer does not remove persistent session id mappings', async () => {
    await route(manager, makeMessage('stdio-xyz', 'hi'));
    const actualSessionId = 'actual-session-1';

    await manager.clearSessionBuffer(actualSessionId);

    expect(manager.getRemoteSessionId(actualSessionId)).toBeDefined();
    expect(manager.isRemoteSession(actualSessionId)).toBe(true);
  });

  it('removeRemoteSession tears down mappings so the id can no longer be continued', async () => {
    await route(manager, makeMessage('stdio-teardown', 'hi'));
    const actualSessionId = 'actual-session-1';
    expect(manager.isRemoteSession(actualSessionId)).toBe(true);

    await manager.removeRemoteSession(actualSessionId);

    expect(manager.isRemoteSession(actualSessionId)).toBe(false);
    expect(manager.getRemoteSessionId(actualSessionId)).toBeUndefined();

    // A subsequent message on the same channel starts a fresh session
    // (remoteSessionIds was cleared in lockstep, so no drift/throw).
    await expect(route(manager, makeMessage('stdio-teardown', 'again'))).resolves.not.toThrow();
    expect(startSession).toHaveBeenCalledTimes(2);
  });
});
