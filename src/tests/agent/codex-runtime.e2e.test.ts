/**
 * Phase 5.6 end-to-end integration test — drives the REAL assembled CodexRuntime
 * (CodexClient + CodexEventTranslator + CodexPermissionBridge + CodexToolBridge, i.e. the
 * code wired in 5.2/5.3) against a live `codex app-server`, using codex's DEFAULT auth
 * (no model_providers override) so a turn actually completes.
 *
 * Opt-in only: requires a working local `codex` (logged in) and RUN_CODEX_E2E=1. CI and the
 * normal `npx vitest run` SKIP this (it spawns a real subprocess, hits the network, and
 * spends tokens). Run manually:  RUN_CODEX_E2E=1 npx vitest run src/tests/agent/codex-runtime.e2e.test.ts
 */
import { describe, it, expect, afterAll } from 'vitest';
import { CodexClient } from '../../main/agent/codex-runtime/codex-client';
import {
  CodexRuntime,
  type CodexRuntimeEmitters,
} from '../../main/agent/codex-runtime/codex-runtime';
import { CodexPermissionBridge } from '../../main/agent/codex-runtime/codex-permission-bridge';
import {
  CodexToolBridge,
  type CodexHostTool,
} from '../../main/agent/codex-runtime/codex-tool-bridge';
import type { Message, ServerEvent, TraceStep } from '../../renderer/types';

const RUN = process.env.RUN_CODEX_E2E === '1';

interface Captured {
  partials: string[];
  messages: Message[];
  traceSteps: TraceStep[];
  serverEvents: ServerEvent[];
  toolCalls: Array<{ tool: string; args: unknown }>;
  errors: string[];
}

function makeRuntime(cap: Captured) {
  const client = new CodexClient({
    clientInfo: { name: 'cowork-e2e', version: '0.0.0' },
    capabilities: { experimentalApi: true, requestAttestation: false },
  });
  const echoTool: CodexHostTool = {
    name: 'spike_echo',
    description: 'Echo back the given text.',
    parameters: {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text'],
      additionalProperties: false,
    },
    execute: async (args) => {
      cap.toolCalls.push({ tool: 'spike_echo', args });
      const text = (args as { text?: string }).text ?? '';
      return { content: `echoed: ${text}` };
    },
  };
  const toolBridge = new CodexToolBridge([echoTool]);
  const permissionBridge = new CodexPermissionBridge({
    decide: () => 'allow',
    rememberAlwaysAllow: () => {},
  });
  const emitters: CodexRuntimeEmitters = {
    sendPartial: (_s, delta) => cap.partials.push(delta),
    sendToRenderer: (e) => cap.serverEvents.push(e),
    sendTraceStep: (_s, step) => cap.traceSteps.push(step),
    sendTraceUpdate: () => {},
    sendMessage: (_s, m) => cap.messages.push(m),
    onTokenUsage: () => {},
    onCompaction: () => {},
    onError: (info) => cap.errors.push(info.message),
  };
  const runtime = new CodexRuntime({
    client,
    emitters,
    permissionBridge,
    toolBridge,
    sandbox: 'danger-full-access',
    approvalPolicy: 'never',
  });
  return runtime;
}

function messageText(m: Message): string {
  return m.content
    .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

describe.skipIf(!RUN)('CodexRuntime e2e (live codex, default auth)', () => {
  const cap: Captured = {
    partials: [],
    messages: [],
    traceSteps: [],
    serverEvents: [],
    toolCalls: [],
    errors: [],
  };
  const runtime = makeRuntime(cap);
  afterAll(() => runtime.dispose());

  it('streams a text turn and assembles a final message', async () => {
    await runtime.runTurn({ sessionId: 's1', input: 'Reply with exactly: PONG' });
    expect(cap.errors).toEqual([]);
    expect(cap.messages.length).toBeGreaterThan(0);
    const finalText = cap.messages.map(messageText).join('');
    expect(finalText).toContain('PONG');
  }, 120_000);

  it('invokes a host dynamic tool via item/tool/call', async () => {
    cap.toolCalls.length = 0;
    await runtime.runTurn({
      sessionId: 's1',
      input: 'Call the spike_echo tool with text set to HELLO_E2E. You must use the tool.',
    });
    expect(cap.errors).toEqual([]);
    expect(cap.toolCalls.some((c) => c.tool === 'spike_echo')).toBe(true);
  }, 120_000);
});
