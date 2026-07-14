import { describe, it, expect } from 'vitest';
import {
  CodexEventTranslator,
  type CodexTranslatorAction,
} from '@/main/agent/codex-runtime/codex-event-translator';
import type { CodexNotification } from '@/main/agent/codex-runtime/codex-client';
import type { Message, ContentBlock } from '@/renderer/types';

const SESSION_ID = 'session-1';

/** Build a translator with deterministic id/clock injection. */
function makeTranslator(): CodexEventTranslator {
  let counter = 0;
  return new CodexEventTranslator({
    sessionId: SESSION_ID,
    getToolDisplayName: (name) => `display:${name}`,
    generateId: () => `id-${++counter}`,
    now: () => 1000,
  });
}

function n(method: string, params: unknown): CodexNotification {
  return { method, params };
}

/** Feed a sequence of notifications and flatten all produced actions. */
function run(
  translator: CodexEventTranslator,
  events: CodexNotification[]
): CodexTranslatorAction[] {
  return events.flatMap((event) => translator.handleNotification(event));
}

describe('CodexEventTranslator', () => {
  it('accumulates agentMessage deltas into partials and one final assembled Message', () => {
    const t = makeTranslator();
    const actions = run(t, [
      n('turn/started', { threadId: 'th', turn: { id: 'turn-1' } }),
      n('item/agentMessage/delta', {
        threadId: 'th',
        turnId: 'turn-1',
        itemId: 'm1',
        delta: 'Hello',
      }),
      n('item/agentMessage/delta', {
        threadId: 'th',
        turnId: 'turn-1',
        itemId: 'm1',
        delta: ' world',
      }),
      n('turn/completed', { threadId: 'th', turn: { id: 'turn-1' } }),
    ]);

    const partials = actions.filter((a) => a.kind === 'partial');
    // Two streamed deltas + one clearing partial before the final message.
    expect(partials.map((a) => (a.kind === 'partial' ? a.delta : null))).toEqual([
      'Hello',
      ' world',
      '',
    ]);

    const messages = actions.filter(
      (a): a is Extract<CodexTranslatorAction, { kind: 'message' }> => a.kind === 'message'
    );
    expect(messages).toHaveLength(1);
    const message = messages[0].message;
    expect(message.role).toBe('assistant');
    expect(message.content).toEqual<ContentBlock[]>([{ type: 'text', text: 'Hello world' }]);
    expect(message.sessionId).toBe(SESSION_ID);
  });

  it('maps reasoning deltas to thinking actions and persists a thinking block', () => {
    const t = makeTranslator();
    const actions = run(t, [
      n('turn/started', { threadId: 'th', turn: { id: 'turn-1' } }),
      n('item/reasoning/textDelta', {
        threadId: 'th',
        turnId: 'turn-1',
        itemId: 'r1',
        delta: 'thinking hard',
      }),
      n('item/agentMessage/delta', {
        threadId: 'th',
        turnId: 'turn-1',
        itemId: 'm1',
        delta: 'Done',
      }),
      n('turn/completed', { threadId: 'th', turn: { id: 'turn-1' } }),
    ]);

    const thinking = actions.filter((a) => a.kind === 'thinking');
    expect(thinking.map((a) => (a.kind === 'thinking' ? a.delta : null))).toEqual([
      'thinking hard',
    ]);

    const message = actions.find(
      (a): a is Extract<CodexTranslatorAction, { kind: 'message' }> => a.kind === 'message'
    )!.message;
    expect(message.content).toEqual<ContentBlock[]>([
      { type: 'thinking', thinking: 'thinking hard' },
      { type: 'text', text: 'Done' },
    ]);
  });

  it('emits a traceStep on command start and traceUpdate + tool_result on completion', () => {
    const t = makeTranslator();
    const actions = run(t, [
      n('turn/started', { threadId: 'th', turn: { id: 'turn-1' } }),
      n('item/started', {
        threadId: 'th',
        turnId: 'turn-1',
        item: {
          type: 'commandExecution',
          id: 'cmd-1',
          command: 'ls -la',
          cwd: '/work',
          status: 'inProgress',
          aggregatedOutput: null,
          exitCode: null,
        },
      }),
      n('item/completed', {
        threadId: 'th',
        turnId: 'turn-1',
        item: {
          type: 'commandExecution',
          id: 'cmd-1',
          command: 'ls -la',
          cwd: '/work',
          status: 'completed',
          aggregatedOutput: 'file.txt',
          exitCode: 0,
        },
      }),
    ]);

    const step = actions.find(
      (a): a is Extract<CodexTranslatorAction, { kind: 'traceStep' }> => a.kind === 'traceStep'
    )!.step;
    expect(step.id).toBe('cmd-1');
    expect(step.type).toBe('tool_call');
    expect(step.status).toBe('running');
    expect(step.title).toBe('display:shell');
    expect(step.toolName).toBe('shell');
    expect(step.toolInput).toEqual({ command: 'ls -la', cwd: '/work' });

    const update = actions.find(
      (a): a is Extract<CodexTranslatorAction, { kind: 'traceUpdate' }> => a.kind === 'traceUpdate'
    )!;
    expect(update.stepId).toBe('cmd-1');
    expect(update.updates.status).toBe('completed');
    expect(update.updates.toolOutput).toBe('file.txt');

    const toolResult = actions.find(
      (a): a is Extract<CodexTranslatorAction, { kind: 'message' }> => a.kind === 'message'
    )!.message;
    expect(toolResult.content).toEqual([
      { type: 'tool_result', toolUseId: 'cmd-1', content: 'file.txt', isError: false },
    ]);
  });

  it('marks a failed command execution as an error tool_result', () => {
    const t = makeTranslator();
    const actions = run(t, [
      n('item/completed', {
        threadId: 'th',
        turnId: 'turn-1',
        item: {
          type: 'commandExecution',
          id: 'cmd-2',
          command: 'false',
          cwd: '/work',
          status: 'failed',
          aggregatedOutput: 'boom',
          exitCode: 1,
        },
      }),
    ]);

    const update = actions.find(
      (a): a is Extract<CodexTranslatorAction, { kind: 'traceUpdate' }> => a.kind === 'traceUpdate'
    )!;
    expect(update.updates.status).toBe('error');

    const toolResult = actions.find(
      (a): a is Extract<CodexTranslatorAction, { kind: 'message' }> => a.kind === 'message'
    )!.message;
    expect(toolResult.content[0]).toMatchObject({ isError: true, content: 'boom' });
  });

  it('handles an mcp tool call with a structured result', () => {
    const t = makeTranslator();
    const actions = run(t, [
      n('item/started', {
        threadId: 'th',
        turnId: 'turn-1',
        item: {
          type: 'mcpToolCall',
          id: 'mcp-1',
          server: 'files',
          tool: 'read',
          status: 'inProgress',
          arguments: { path: '/x' },
          result: null,
          error: null,
        },
      }),
      n('item/completed', {
        threadId: 'th',
        turnId: 'turn-1',
        item: {
          type: 'mcpToolCall',
          id: 'mcp-1',
          server: 'files',
          tool: 'read',
          status: 'completed',
          arguments: { path: '/x' },
          result: { content: [{ type: 'text', text: 'ok' }] },
          error: null,
        },
      }),
    ]);

    const step = actions.find(
      (a): a is Extract<CodexTranslatorAction, { kind: 'traceStep' }> => a.kind === 'traceStep'
    )!.step;
    expect(step.toolName).toBe('read');
    expect(step.toolInput).toEqual({ server: 'files', tool: 'read', arguments: { path: '/x' } });

    const toolResult = actions.find(
      (a): a is Extract<CodexTranslatorAction, { kind: 'message' }> => a.kind === 'message'
    )!.message;
    expect(toolResult.content[0]).toMatchObject({
      toolUseId: 'mcp-1',
      content: JSON.stringify([{ type: 'text', text: 'ok' }]),
      isError: false,
    });
  });

  it('includes tool_use blocks paired with tool_result in the final message', () => {
    const t = makeTranslator();
    const actions = run(t, [
      n('turn/started', { threadId: 'th', turn: { id: 'turn-1' } }),
      n('item/agentMessage/delta', {
        threadId: 'th',
        turnId: 'turn-1',
        itemId: 'm1',
        delta: 'Running',
      }),
      n('item/started', {
        threadId: 'th',
        turnId: 'turn-1',
        item: {
          type: 'commandExecution',
          id: 'cmd-1',
          command: 'ls',
          cwd: '/w',
          status: 'inProgress',
          aggregatedOutput: null,
          exitCode: null,
        },
      }),
      n('item/completed', {
        threadId: 'th',
        turnId: 'turn-1',
        item: {
          type: 'commandExecution',
          id: 'cmd-1',
          command: 'ls',
          cwd: '/w',
          status: 'completed',
          aggregatedOutput: 'out',
          exitCode: 0,
        },
      }),
      n('turn/completed', { threadId: 'th', turn: { id: 'turn-1' } }),
    ]);

    const messages = actions.filter(
      (a): a is Extract<CodexTranslatorAction, { kind: 'message' }> => a.kind === 'message'
    );
    // First: the tool_result message emitted at item completion.
    expect(messages[0].message.content[0]).toMatchObject({
      type: 'tool_result',
      toolUseId: 'cmd-1',
    });
    // Last: final assistant message with text + the paired tool_use block.
    const final: Message = messages[messages.length - 1].message;
    expect(final.content).toEqual<ContentBlock[]>([
      { type: 'text', text: 'Running' },
      {
        type: 'tool_use',
        id: 'cmd-1',
        name: 'shell',
        displayName: 'display:shell',
        input: { command: 'ls', cwd: '/w' },
      },
    ]);
  });

  it('splits embedded <think> tags in agent text into thinking + text blocks', () => {
    const t = makeTranslator();
    const actions = run(t, [
      n('turn/started', { threadId: 'th', turn: { id: 'turn-1' } }),
      n('item/agentMessage/delta', {
        threadId: 'th',
        turnId: 'turn-1',
        itemId: 'm1',
        delta: '<think>plan</think>answer',
      }),
      n('turn/completed', { threadId: 'th', turn: { id: 'turn-1' } }),
    ]);

    const message = actions.find(
      (a): a is Extract<CodexTranslatorAction, { kind: 'message' }> => a.kind === 'message'
    )!.message;
    expect(message.content).toEqual<ContentBlock[]>([
      { type: 'thinking', thinking: 'plan' },
      { type: 'text', text: 'answer' },
    ]);
  });

  it('assembles the final message from turn items when no deltas were streamed', () => {
    const t = makeTranslator();
    const actions = run(t, [
      n('turn/completed', {
        threadId: 'th',
        turn: {
          id: 'turn-1',
          items: [{ type: 'agentMessage', id: 'm1', text: 'from item' }],
        },
      }),
    ]);

    const message = actions.find(
      (a): a is Extract<CodexTranslatorAction, { kind: 'message' }> => a.kind === 'message'
    )!.message;
    expect(message.content).toEqual<ContentBlock[]>([{ type: 'text', text: 'from item' }]);
  });

  it('emits no message for an empty turn', () => {
    const t = makeTranslator();
    const actions = run(t, [
      n('turn/started', { threadId: 'th', turn: { id: 'turn-1' } }),
      n('turn/completed', { threadId: 'th', turn: { id: 'turn-1' } }),
    ]);
    expect(actions.filter((a) => a.kind === 'message')).toHaveLength(0);
  });

  it('maps token usage and attaches it to the final message', () => {
    const t = makeTranslator();
    const actions = run(t, [
      n('turn/started', { threadId: 'th', turn: { id: 'turn-1' } }),
      n('thread/tokenUsage/updated', {
        threadId: 'th',
        turnId: 'turn-1',
        tokenUsage: {
          last: { totalTokens: 30, inputTokens: 10, outputTokens: 20 },
          total: { totalTokens: 300, inputTokens: 100, outputTokens: 200 },
          modelContextWindow: 128000,
        },
      }),
      n('item/agentMessage/delta', { threadId: 'th', turnId: 'turn-1', itemId: 'm1', delta: 'hi' }),
      n('turn/completed', { threadId: 'th', turn: { id: 'turn-1' } }),
    ]);

    const usage = actions.find(
      (a): a is Extract<CodexTranslatorAction, { kind: 'tokenUsage' }> => a.kind === 'tokenUsage'
    )!;
    expect(usage.tokenUsage).toEqual({ input: 10, output: 20 });
    expect(usage.contextWindow).toBe(128000);

    const message = actions.find(
      (a): a is Extract<CodexTranslatorAction, { kind: 'message' }> => a.kind === 'message'
    )!.message;
    expect(message.tokenUsage).toEqual({ input: 10, output: 20 });
  });

  it('maps thread/compacted to a compaction action', () => {
    const t = makeTranslator();
    const actions = run(t, [n('thread/compacted', { threadId: 'th', turnId: 'turn-1' })]);
    expect(actions).toEqual([{ kind: 'compaction', sessionId: SESSION_ID, turnId: 'turn-1' }]);
  });

  it('maps a contextCompaction item completion to a compaction action', () => {
    const t = makeTranslator();
    const actions = run(t, [
      n('item/completed', {
        threadId: 'th',
        turnId: 'turn-2',
        item: { type: 'contextCompaction', id: 'c1' },
      }),
    ]);
    expect(actions).toEqual([{ kind: 'compaction', sessionId: SESSION_ID, turnId: 'turn-2' }]);
  });

  it('maps an error notification to an error action', () => {
    const t = makeTranslator();
    const actions = run(t, [
      n('error', {
        error: { message: 'upstream 500' },
        willRetry: true,
        threadId: 'th',
        turnId: 'turn-1',
      }),
    ]);
    expect(actions).toEqual([
      { kind: 'error', sessionId: SESSION_ID, message: 'upstream 500', willRetry: true },
    ]);
  });

  it('does not carry token usage from a prior turn onto a later turn without a usage update', () => {
    const t = makeTranslator();
    run(t, [
      n('turn/started', { threadId: 'th', turn: { id: 'turn-1' } }),
      n('thread/tokenUsage/updated', {
        threadId: 'th',
        turnId: 'turn-1',
        tokenUsage: { last: { totalTokens: 30, inputTokens: 10, outputTokens: 20 } },
      }),
      n('item/agentMessage/delta', {
        threadId: 'th',
        turnId: 'turn-1',
        itemId: 'm1',
        delta: 'first',
      }),
      n('turn/completed', { threadId: 'th', turn: { id: 'turn-1' } }),
    ]);
    const second = run(t, [
      n('turn/started', { threadId: 'th', turn: { id: 'turn-2' } }),
      n('item/agentMessage/delta', {
        threadId: 'th',
        turnId: 'turn-2',
        itemId: 'm2',
        delta: 'second',
      }),
      n('turn/completed', { threadId: 'th', turn: { id: 'turn-2' } }),
    ]);

    const message = second.find(
      (a): a is Extract<CodexTranslatorAction, { kind: 'message' }> => a.kind === 'message'
    )!.message;
    expect(message.tokenUsage).toBeUndefined();
  });

  it('applies the injected sanitizer to trace output and tool_result content', () => {
    let counter = 0;
    const t = new CodexEventTranslator({
      sessionId: SESSION_ID,
      sanitizeToolOutput: (out) => out.replace('/real/sandbox', '/workspace'),
      generateId: () => `id-${++counter}`,
      now: () => 1000,
    });
    const actions = run(t, [
      n('item/completed', {
        threadId: 'th',
        turnId: 'turn-1',
        item: {
          type: 'commandExecution',
          id: 'cmd-1',
          command: 'pwd',
          cwd: '/real/sandbox',
          status: 'completed',
          aggregatedOutput: 'cwd is /real/sandbox/project',
          exitCode: 0,
        },
      }),
    ]);

    const update = actions.find(
      (a): a is Extract<CodexTranslatorAction, { kind: 'traceUpdate' }> => a.kind === 'traceUpdate'
    )!;
    expect(update.updates.toolOutput).toBe('cwd is /workspace/project');

    const toolResult = actions.find(
      (a): a is Extract<CodexTranslatorAction, { kind: 'message' }> => a.kind === 'message'
    )!.message;
    expect(toolResult.content[0]).toMatchObject({ content: 'cwd is /workspace/project' });
  });

  it('resets per-turn accumulation between turns', () => {
    const t = makeTranslator();
    run(t, [
      n('turn/started', { threadId: 'th', turn: { id: 'turn-1' } }),
      n('item/agentMessage/delta', {
        threadId: 'th',
        turnId: 'turn-1',
        itemId: 'm1',
        delta: 'first',
      }),
      n('turn/completed', { threadId: 'th', turn: { id: 'turn-1' } }),
    ]);
    const second = run(t, [
      n('turn/started', { threadId: 'th', turn: { id: 'turn-2' } }),
      n('item/agentMessage/delta', {
        threadId: 'th',
        turnId: 'turn-2',
        itemId: 'm2',
        delta: 'second',
      }),
      n('turn/completed', { threadId: 'th', turn: { id: 'turn-2' } }),
    ]);

    const message = second.find(
      (a): a is Extract<CodexTranslatorAction, { kind: 'message' }> => a.kind === 'message'
    )!.message;
    expect(message.content).toEqual<ContentBlock[]>([{ type: 'text', text: 'second' }]);
  });
});
