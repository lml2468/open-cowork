/**
 * codex-event-translator — Seam 3 of the pi→Codex migration.
 *
 * Consumes `codex app-server` JSON-RPC v2 `ServerNotification`s (method + params) and
 * produces a normalized stream of **app runtime actions**. It does NOT call the renderer
 * emitters and does NOT import Electron — the caller (CodexRuntime / CoworkAgentRunner,
 * wired in a later phase) maps each action onto the existing emitters:
 *
 *   { kind: 'partial' }     → sendPartial            → ServerEvent 'stream.partial'
 *   { kind: 'thinking' }    → sendToRenderer         → ServerEvent 'stream.thinking'
 *   { kind: 'traceStep' }   → sendTraceStep          → ServerEvent 'trace.step'
 *   { kind: 'traceUpdate' } → sendTraceUpdate        → ServerEvent 'trace.update'
 *   { kind: 'message' }     → sendMessage            → ServerEvent 'stream.message'
 *   { kind: 'compaction' }  → sendToRenderer         → ServerEvent 'compaction.result'
 *   { kind: 'tokenUsage' }  → context-usage bar      → ServerEvent 'session.contextInfo'
 *   { kind: 'error' }       → terminal error message → ServerEvent 'stream.message'
 *
 * The produced `TraceStep` / `Message` / `ContentBlock` shapes are the SAME renderer
 * types the pi translator produces today (see `agent-runner.ts:2577-2955` and
 * `agent-runner-message-end.ts`) so the renderer IPC contract is unchanged.
 *
 * Behavioural notes vs pi (documented divergences):
 *  - pi (Anthropic-shaped) bundles a turn's text, thinking, and tool_use into one
 *    assistant message emitted at `message_end`; codex surfaces them as separate items.
 *    This translator accumulates per-turn deltas and assembles ONE final assistant
 *    `Message` at `turn/completed` (text + thinking + tool_use blocks), matching pi's
 *    "one assistant message per turn" contract. Tool results are emitted as their own
 *    messages when each tool item completes, exactly like pi's `tool_execution_end`.
 *  - Approval requests are codex `ServerRequest`s (not notifications) and are handled by
 *    the permission layer wired in Phase 3 — they are intentionally out of scope here.
 */

import { randomUUID } from 'crypto';
import type { Message, TraceStep, ContentBlock, TokenUsage } from '../../../renderer/types';
import { splitThinkTagBlocks } from '../think-tag-parser';
import type { CodexNotification } from './codex-client';

// ---------------------------------------------------------------------------
// Action union — what the caller dispatches to the existing emitters.
// ---------------------------------------------------------------------------

export type CodexTranslatorAction =
  | { kind: 'partial'; sessionId: string; delta: string }
  | { kind: 'thinking'; sessionId: string; delta: string }
  | { kind: 'traceStep'; sessionId: string; step: TraceStep }
  | { kind: 'traceUpdate'; sessionId: string; stepId: string; updates: Partial<TraceStep> }
  | { kind: 'message'; sessionId: string; message: Message }
  | { kind: 'compaction'; sessionId: string; turnId: string }
  | { kind: 'tokenUsage'; sessionId: string; tokenUsage: TokenUsage; contextWindow: number | null }
  | { kind: 'error'; sessionId: string; message: string; willRetry: boolean };

// ---------------------------------------------------------------------------
// Minimal hand-declared subset of the codex protocol params this translator reads.
// (Generated bindings via `codex app-server generate-ts` are used for reference only
// and intentionally not committed — mirror the style in codex-client.ts.)
// ---------------------------------------------------------------------------

interface CodexDeltaParams {
  threadId: string;
  turnId: string;
  itemId: string;
  delta: string;
}

interface CodexItemNotificationParams {
  item: CodexThreadItem;
  threadId: string;
  turnId: string;
}

interface CodexTurnNotificationParams {
  threadId: string;
  turn: CodexTurn;
}

interface CodexTurn {
  id: string;
  items?: CodexThreadItem[];
}

interface CodexTokenUsageParams {
  threadId: string;
  turnId: string;
  tokenUsage: {
    total?: CodexTokenUsageBreakdown;
    last?: CodexTokenUsageBreakdown;
    modelContextWindow?: number | null;
  };
}

interface CodexTokenUsageBreakdown {
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
}

interface CodexCompactedParams {
  threadId: string;
  turnId: string;
}

interface CodexErrorParams {
  error: { message: string };
  willRetry: boolean;
  threadId: string;
  turnId: string;
}

/** Base view — every codex thread item carries a discriminating `type` + `id`. */
interface CodexItemBase {
  type: string;
  id: string;
}

interface CodexAgentMessageItem extends CodexItemBase {
  type: 'agentMessage';
  text: string;
}

interface CodexReasoningItem extends CodexItemBase {
  type: 'reasoning';
  summary: string[];
  content: string[];
}

interface CodexCommandExecutionItem extends CodexItemBase {
  type: 'commandExecution';
  command: string;
  cwd?: string;
  status: 'inProgress' | 'completed' | 'failed' | 'declined';
  aggregatedOutput: string | null;
  exitCode: number | null;
}

interface CodexMcpToolCallItem extends CodexItemBase {
  type: 'mcpToolCall';
  server: string;
  tool: string;
  status: 'inProgress' | 'completed' | 'failed';
  arguments: unknown;
  result: { content: unknown[] } | null;
  error: { message: string } | null;
}

interface CodexDynamicToolCallItem extends CodexItemBase {
  type: 'dynamicToolCall';
  namespace: string | null;
  tool: string;
  status: 'inProgress' | 'completed' | 'failed';
  arguments: unknown;
  contentItems: unknown[] | null;
  success: boolean | null;
}

type CodexThreadItem =
  | CodexAgentMessageItem
  | CodexReasoningItem
  | CodexCommandExecutionItem
  | CodexMcpToolCallItem
  | CodexDynamicToolCallItem
  | CodexItemBase;

/** Item types surfaced as tool-call trace steps + tool_result messages. */
const TOOL_ITEM_TYPES = new Set(['commandExecution', 'mcpToolCall', 'dynamicToolCall']);

// ---------------------------------------------------------------------------
// Options / dependency injection (keeps the translator pure + deterministic).
// ---------------------------------------------------------------------------

export interface CodexEventTranslatorOptions {
  /** App session id every produced action is tagged with. */
  sessionId: string;
  /** Human-facing tool label; defaults to identity. */
  getToolDisplayName?: (toolName: string) => string;
  /**
   * Redacts sandbox/internal paths from tool output before it reaches the
   * renderer, mirroring pi's `sanitizeOutputPaths` (`agent-runner.ts:1212`).
   * Defaults to identity; the caller injects the session-scoped sanitizer.
   */
  sanitizeToolOutput?: (output: string) => string;
  /** Id factory for generated messages; defaults to `crypto.randomUUID`. */
  generateId?: () => string;
  /** Clock for timestamps; defaults to `Date.now`. */
  now?: () => number;
}

const MAX_TOOL_OUTPUT = 800;

export class CodexEventTranslator {
  private readonly sessionId: string;
  private readonly getToolDisplayName: (toolName: string) => string;
  private readonly sanitizeToolOutput: (output: string) => string;
  private readonly generateId: () => string;
  private readonly now: () => number;

  // Per-turn accumulation.
  private pendingText = '';
  private pendingThinking = '';
  private readonly pendingToolUses: ContentBlock[] = [];
  private lastTokenUsage: TokenUsage | null = null;

  constructor(options: CodexEventTranslatorOptions) {
    this.sessionId = options.sessionId;
    this.getToolDisplayName = options.getToolDisplayName ?? ((name) => name);
    this.sanitizeToolOutput = options.sanitizeToolOutput ?? ((output) => output);
    this.generateId = options.generateId ?? (() => randomUUID());
    this.now = options.now ?? (() => Date.now());
  }

  /** Translate a single codex notification into zero or more app runtime actions. */
  handleNotification(notification: CodexNotification): CodexTranslatorAction[] {
    switch (notification.method) {
      case 'item/agentMessage/delta':
        return this.onAgentMessageDelta(notification.params as CodexDeltaParams);
      case 'item/reasoning/textDelta':
      case 'item/reasoning/summaryTextDelta':
        return this.onReasoningDelta(notification.params as CodexDeltaParams);
      case 'item/started':
        return this.onItemStarted(notification.params as CodexItemNotificationParams);
      case 'item/completed':
        return this.onItemCompleted(notification.params as CodexItemNotificationParams);
      case 'turn/started':
        return this.onTurnStarted();
      case 'turn/completed':
        return this.onTurnCompleted(notification.params as CodexTurnNotificationParams);
      case 'thread/tokenUsage/updated':
        return this.onTokenUsage(notification.params as CodexTokenUsageParams);
      case 'thread/compacted':
        return this.onCompacted(notification.params as CodexCompactedParams);
      case 'error':
        return this.onError(notification.params as CodexErrorParams);
      default:
        return [];
    }
  }

  // --- streaming deltas ----------------------------------------------------

  private onAgentMessageDelta(params: CodexDeltaParams): CodexTranslatorAction[] {
    const delta = params.delta ?? '';
    if (!delta) return [];
    this.pendingText += delta;
    return [{ kind: 'partial', sessionId: this.sessionId, delta }];
  }

  private onReasoningDelta(params: CodexDeltaParams): CodexTranslatorAction[] {
    const delta = params.delta ?? '';
    if (!delta) return [];
    this.pendingThinking += delta;
    return [{ kind: 'thinking', sessionId: this.sessionId, delta }];
  }

  // --- tool item lifecycle -------------------------------------------------

  private onItemStarted(params: CodexItemNotificationParams): CodexTranslatorAction[] {
    const item = params.item;
    if (!TOOL_ITEM_TYPES.has(item.type)) return [];

    const { toolName, toolInput } = describeToolItem(item);
    const displayName = this.getToolDisplayName(toolName);

    // Record a tool_use block so the final assistant message pairs with the
    // tool_result message emitted on completion (mirrors pi's contract).
    this.pendingToolUses.push({
      type: 'tool_use',
      id: item.id,
      name: toolName,
      displayName,
      input: toolInput,
    });

    const step: TraceStep = {
      id: item.id,
      type: 'tool_call',
      status: 'running',
      title: displayName,
      toolName,
      toolInput,
      timestamp: this.now(),
    };
    return [{ kind: 'traceStep', sessionId: this.sessionId, step }];
  }

  private onItemCompleted(params: CodexItemNotificationParams): CodexTranslatorAction[] {
    const item = params.item;
    if (item.type === 'contextCompaction') {
      return [{ kind: 'compaction', sessionId: this.sessionId, turnId: params.turnId }];
    }
    if (!TOOL_ITEM_TYPES.has(item.type)) return [];

    const { toolName } = describeToolItem(item);
    const displayName = this.getToolDisplayName(toolName);
    const { output, isError } = resolveToolResult(item);
    const sanitizedOutput = this.sanitizeToolOutput(output);
    const trimmedOutput = sanitizedOutput.slice(0, MAX_TOOL_OUTPUT);

    const actions: CodexTranslatorAction[] = [
      {
        kind: 'traceUpdate',
        sessionId: this.sessionId,
        stepId: item.id,
        updates: {
          status: isError ? 'error' : 'completed',
          title: displayName,
          toolName,
          toolOutput: trimmedOutput,
        },
      },
    ];

    const toolResult: Message = {
      id: this.generateId(),
      sessionId: this.sessionId,
      role: 'assistant',
      content: [
        {
          type: 'tool_result',
          toolUseId: item.id,
          content: sanitizedOutput,
          isError,
        },
      ],
      timestamp: this.now(),
    };
    actions.push({ kind: 'message', sessionId: this.sessionId, message: toolResult });
    return actions;
  }

  // --- turn lifecycle ------------------------------------------------------

  private onTurnStarted(): CodexTranslatorAction[] {
    this.resetTurn();
    return [];
  }

  private onTurnCompleted(params: CodexTurnNotificationParams): CodexTranslatorAction[] {
    const actions = this.assembleFinalMessage(params.turn);
    this.resetTurn();
    return actions;
  }

  private onTokenUsage(params: CodexTokenUsageParams): CodexTranslatorAction[] {
    const breakdown = params.tokenUsage.last ?? params.tokenUsage.total;
    if (!breakdown) return [];
    const tokenUsage: TokenUsage = {
      input: breakdown.inputTokens,
      output: breakdown.outputTokens,
    };
    this.lastTokenUsage = tokenUsage;
    return [
      {
        kind: 'tokenUsage',
        sessionId: this.sessionId,
        tokenUsage,
        contextWindow: params.tokenUsage.modelContextWindow ?? null,
      },
    ];
  }

  private onCompacted(params: CodexCompactedParams): CodexTranslatorAction[] {
    return [{ kind: 'compaction', sessionId: this.sessionId, turnId: params.turnId }];
  }

  private onError(params: CodexErrorParams): CodexTranslatorAction[] {
    return [
      {
        kind: 'error',
        sessionId: this.sessionId,
        message: params.error?.message ?? 'stream_error',
        willRetry: Boolean(params.willRetry),
      },
    ];
  }

  // --- final message assembly ---------------------------------------------

  /**
   * Assemble the single end-of-turn assistant `Message` from accumulated deltas,
   * falling back to the completed turn's items when no deltas were streamed. Emits a
   * partial-clear before the message (matching pi's `message_end` path).
   */
  private assembleFinalMessage(turn: CodexTurn | undefined): CodexTranslatorAction[] {
    const text = this.pendingText || collectAgentMessageText(turn);
    const thinking = this.pendingThinking || collectReasoningText(turn);
    const toolUses =
      this.pendingToolUses.length > 0 ? this.pendingToolUses : this.collectToolUses(turn);

    const contentBlocks: ContentBlock[] = [];
    if (thinking) {
      contentBlocks.push({ type: 'thinking', thinking });
    }
    for (const block of splitThinkTagBlocks(text)) {
      if (block.type === 'thinking') {
        contentBlocks.push({ type: 'thinking', thinking: block.thinking });
      } else if (block.text) {
        contentBlocks.push({ type: 'text', text: block.text });
      }
    }
    contentBlocks.push(...toolUses);

    if (contentBlocks.length === 0) {
      return [];
    }

    const message: Message = {
      id: this.generateId(),
      sessionId: this.sessionId,
      role: 'assistant',
      content: contentBlocks,
      timestamp: this.now(),
      ...(this.lastTokenUsage ? { tokenUsage: this.lastTokenUsage } : {}),
    };

    return [
      { kind: 'partial', sessionId: this.sessionId, delta: '' },
      { kind: 'message', sessionId: this.sessionId, message },
    ];
  }

  private collectToolUses(turn: CodexTurn | undefined): ContentBlock[] {
    if (!turn?.items) return [];
    const blocks: ContentBlock[] = [];
    for (const item of turn.items) {
      if (!TOOL_ITEM_TYPES.has(item.type)) continue;
      const { toolName, toolInput } = describeToolItem(item);
      blocks.push({
        type: 'tool_use',
        id: item.id,
        name: toolName,
        displayName: this.getToolDisplayName(toolName),
        input: toolInput,
      });
    }
    return blocks;
  }

  private resetTurn(): void {
    this.pendingText = '';
    this.pendingThinking = '';
    this.pendingToolUses.length = 0;
    // Token usage is per-turn (pi reads it off each message's own `usage`); clearing
    // it here prevents a turn that emits no usage update from inheriting the previous
    // turn's numbers on its final message.
    this.lastTokenUsage = null;
  }
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function describeToolItem(item: CodexThreadItem): {
  toolName: string;
  toolInput: Record<string, unknown>;
} {
  switch (item.type) {
    case 'commandExecution': {
      const cmd = item as CodexCommandExecutionItem;
      return { toolName: 'shell', toolInput: { command: cmd.command, cwd: cmd.cwd } };
    }
    case 'mcpToolCall': {
      const mcp = item as CodexMcpToolCallItem;
      return {
        toolName: mcp.tool,
        toolInput: { server: mcp.server, tool: mcp.tool, arguments: mcp.arguments },
      };
    }
    case 'dynamicToolCall': {
      const dyn = item as CodexDynamicToolCallItem;
      return {
        toolName: dyn.tool,
        toolInput: { namespace: dyn.namespace, tool: dyn.tool, arguments: dyn.arguments },
      };
    }
    default:
      return { toolName: item.type, toolInput: {} };
  }
}

function resolveToolResult(item: CodexThreadItem): { output: string; isError: boolean } {
  switch (item.type) {
    case 'commandExecution': {
      const cmd = item as CodexCommandExecutionItem;
      const isError = cmd.status === 'failed' || (cmd.exitCode != null && cmd.exitCode !== 0);
      return { output: cmd.aggregatedOutput ?? '', isError };
    }
    case 'mcpToolCall': {
      const mcp = item as CodexMcpToolCallItem;
      if (mcp.error) return { output: mcp.error.message, isError: true };
      const output = mcp.result ? stringifyUnknown(mcp.result.content) : '';
      return { output, isError: mcp.status === 'failed' };
    }
    case 'dynamicToolCall': {
      const dyn = item as CodexDynamicToolCallItem;
      const isError = dyn.status === 'failed' || dyn.success === false;
      return { output: dyn.contentItems ? stringifyUnknown(dyn.contentItems) : '', isError };
    }
    default:
      return { output: '', isError: false };
  }
}

function collectAgentMessageText(turn: CodexTurn | undefined): string {
  if (!turn?.items) return '';
  return turn.items
    .filter((item): item is CodexAgentMessageItem => item.type === 'agentMessage')
    .map((item) => item.text)
    .filter((text) => text.length > 0)
    .join('\n');
}

function collectReasoningText(turn: CodexTurn | undefined): string {
  if (!turn?.items) return '';
  return turn.items
    .filter((item): item is CodexReasoningItem => item.type === 'reasoning')
    .map((item) => [...(item.content ?? []), ...(item.summary ?? [])].join('\n'))
    .filter((text) => text.length > 0)
    .join('\n');
}

function stringifyUnknown(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
