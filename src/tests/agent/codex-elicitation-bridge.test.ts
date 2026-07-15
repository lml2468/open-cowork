import { describe, it, expect, vi } from 'vitest';
import {
  CodexElicitationBridge,
  ELICITATION_METHOD,
} from '../../main/agent/codex-runtime/codex-elicitation-bridge';
import type { CodexServerRequest } from '../../main/agent/codex-runtime/codex-client';

const req = (params: Record<string, unknown>): CodexServerRequest =>
  ({ id: 1, method: ELICITATION_METHOD, params }) as unknown as CodexServerRequest;

describe('CodexElicitationBridge', () => {
  it('owns only the elicitation method', () => {
    const bridge = new CodexElicitationBridge({});
    expect(bridge.canHandle(ELICITATION_METHOD)).toBe(true);
    expect(bridge.canHandle('item/tool/call')).toBe(false);
  });

  it('maps an approved prompt to accept with null content', async () => {
    const prompt = vi.fn().mockResolvedValue('accept');
    const bridge = new CodexElicitationBridge({ prompt });
    const res = await bridge.handle(
      req({ serverName: 'Chrome', message: 'Confirm navigation?', mode: 'form' }),
      's1'
    );
    expect(res).toEqual({ action: 'accept', content: null, _meta: null });
    expect(prompt).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 's1',
        serverName: 'Chrome',
        message: 'Confirm navigation?',
      })
    );
  });

  it('maps a denied prompt to decline', async () => {
    const bridge = new CodexElicitationBridge({ prompt: vi.fn().mockResolvedValue('decline') });
    const res = await bridge.handle(req({ serverName: 'Chrome', message: 'x' }), 's1');
    expect(res.action).toBe('decline');
    expect(res.content).toBeNull();
  });

  it('conservatively declines when no prompt handler is wired', async () => {
    const warn = vi.fn();
    const bridge = new CodexElicitationBridge({ logger: { warn } });
    const res = await bridge.handle(req({ serverName: 'Chrome', message: 'x' }), 's1');
    expect(res.action).toBe('decline');
    expect(warn).toHaveBeenCalled();
  });
});
