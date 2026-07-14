import { describe, it, expect, vi } from 'vitest';
import {
  CodexPermissionBridge,
  COMMAND_APPROVAL_METHOD,
  FILE_CHANGE_APPROVAL_METHOD,
  PERMISSIONS_APPROVAL_METHOD,
  type PermissionVerdict,
  type PermissionPromptResult,
} from '@/main/agent/codex-runtime/codex-permission-bridge';
import type { CodexServerRequest } from '@/main/agent/codex-runtime/codex-client';

function request(method: string, params: unknown): CodexServerRequest {
  return { id: 1, method, params };
}

describe('CodexPermissionBridge', () => {
  it('claims only the approval server-request methods', () => {
    const bridge = new CodexPermissionBridge({ decide: () => 'allow' });
    expect(bridge.canHandle(COMMAND_APPROVAL_METHOD)).toBe(true);
    expect(bridge.canHandle(FILE_CHANGE_APPROVAL_METHOD)).toBe(true);
    expect(bridge.canHandle(PERMISSIONS_APPROVAL_METHOD)).toBe(true);
    expect(bridge.canHandle('item/tool/call')).toBe(false);
    expect(bridge.canHandle('turn/completed')).toBe(false);
  });

  it("maps an 'allow' verdict to codex 'accept'", async () => {
    const bridge = new CodexPermissionBridge({ decide: () => 'allow' });
    const res = await bridge.handle(
      request(COMMAND_APPROVAL_METHOD, { threadId: 't1', command: 'ls' }),
      's1'
    );
    expect(res).toEqual({ decision: 'accept' });
  });

  it("maps a 'deny' verdict to codex 'decline'", async () => {
    const bridge = new CodexPermissionBridge({ decide: () => 'deny' });
    const res = await bridge.handle(
      request(COMMAND_APPROVAL_METHOD, { command: 'rm -rf /' }),
      's1'
    );
    expect(res).toEqual({ decision: 'decline' });
  });

  it("resolves an 'ask' verdict through the prompt and maps 'always' to acceptForSession", async () => {
    const remember = vi.fn();
    const bridge = new CodexPermissionBridge({
      decide: () => 'ask',
      prompt: async () => 'always',
      rememberAlwaysAllow: remember,
    });
    const res = await bridge.handle(
      request(FILE_CHANGE_APPROVAL_METHOD, { threadId: 't1', path: '/a' }),
      's1'
    );
    expect(res).toEqual({ decision: 'acceptForSession' });
    expect(remember).toHaveBeenCalledWith('s1', 'edit');
  });

  it("maps a prompt 'allow' to accept and 'deny' to decline without remembering", async () => {
    const remember = vi.fn();
    const allowBridge = new CodexPermissionBridge({
      decide: () => 'ask',
      prompt: async () => 'allow',
      rememberAlwaysAllow: remember,
    });
    await expect(allowBridge.handle(request(COMMAND_APPROVAL_METHOD, {}), 's1')).resolves.toEqual({
      decision: 'accept',
    });

    const denyBridge = new CodexPermissionBridge({
      decide: () => 'ask',
      prompt: async () => 'deny',
    });
    await expect(denyBridge.handle(request(COMMAND_APPROVAL_METHOD, {}), 's1')).resolves.toEqual({
      decision: 'decline',
    });

    expect(remember).not.toHaveBeenCalled();
  });

  it("conservatively declines an 'ask' when no prompt handler is wired", async () => {
    const warn = vi.fn();
    const bridge = new CodexPermissionBridge({ decide: () => 'ask', logger: { warn } });
    const res = await bridge.handle(request(COMMAND_APPROVAL_METHOD, {}), 's1');
    expect(res).toEqual({ decision: 'decline' });
    expect(warn).toHaveBeenCalled();
  });

  it('passes the correct tool name + input to decide per request kind', async () => {
    const decide = vi.fn(
      (_sessionId: string, _toolName: string, _input: Record<string, unknown>): PermissionVerdict =>
        'allow'
    );
    const bridge = new CodexPermissionBridge({ decide });

    await bridge.handle(
      request(COMMAND_APPROVAL_METHOD, { command: 'echo hi', cwd: '/tmp' }),
      'sess'
    );
    expect(decide).toHaveBeenCalledWith('sess', 'bash', { command: 'echo hi', cwd: '/tmp' });

    await bridge.handle(request(FILE_CHANGE_APPROVAL_METHOD, { path: '/f' }), 'sess');
    expect(decide).toHaveBeenLastCalledWith('sess', 'edit', { changes: '/f' });

    await bridge.handle(request(PERMISSIONS_APPROVAL_METHOD, { tool: 'network' }), 'sess');
    expect(decide).toHaveBeenLastCalledWith('sess', 'network', { tool: 'network' });
  });

  it('threads the full prompt context through to the prompt callback', async () => {
    const contexts: Array<Record<string, unknown>> = [];
    const bridge = new CodexPermissionBridge({
      decide: () => 'ask',
      prompt: async (ctx): Promise<PermissionPromptResult> => {
        contexts.push({ ...ctx });
        return 'deny';
      },
    });
    await bridge.handle(request(COMMAND_APPROVAL_METHOD, { command: 'ls' }), 'sX');
    expect(contexts[0]).toMatchObject({
      sessionId: 'sX',
      toolName: 'bash',
      method: COMMAND_APPROVAL_METHOD,
    });
  });
});
