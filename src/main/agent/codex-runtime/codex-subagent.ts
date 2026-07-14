/**
 * codex-subagent — codex equivalent of the `SubagentExtension` child loop
 * (`subagent-extension.ts:252-393`), which today spawns a nested in-process pi agent
 * session.
 *
 * Instead of a nested pi loop, a subagent is a **child codex thread on the shared, warm
 * app-server** (the injected client). The task is sent as one turn; codex-native events
 * flow through the same {@link CodexEventTranslator} the main runtime uses; the final
 * assistant text is collected and returned. A timeout and an optional parent
 * `AbortSignal` both interrupt the child turn (via `turn/interrupt`) and settle the
 * runner, mirroring the pi version's `Promise.race` + `abort()` teardown.
 *
 * This is the reusable runner + its result shape only. Exposing it as a
 * `spawn_subagent` host tool / `AgentRuntimeExtension` is Phase 5.
 *
 * Notes on shared-client safety:
 *  - It subscribes with `onNotification` (additive — multiple listeners coexist), and it
 *    does NOT touch `setServerRequestHandler`, so the parent runtime's approval / tool
 *    handler stays intact. Child command approvals therefore flow through the same
 *    permission logic as the parent.
 *  - There is no thread-close RPC; "dispose" = interrupt any in-flight turn + unsubscribe.
 */

import type { Message, TraceStep } from '../../../renderer/types';
import { CodexEventTranslator } from './codex-event-translator';
import type {
  CodexInitializeResponse,
  CodexLogger,
  CodexNotification,
  CodexNotificationListener,
  CodexThreadStartParams,
  CodexThreadStartResponse,
  CodexTurnInterruptParams,
  CodexTurnStartParams,
  CodexTurnStartResponse,
  CodexSandboxMode,
  CodexApprovalPolicy,
} from './codex-client';

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_TIMEOUT_MS = 300_000;
const MAX_TASK_LENGTH = 10_000;

/** The subset of {@link CodexClient} the subagent runner depends on. */
export interface CodexSubagentClientLike {
  isReady(): boolean;
  start(): Promise<CodexInitializeResponse>;
  onNotification(listener: CodexNotificationListener): () => void;
  threadStart(params: CodexThreadStartParams): Promise<CodexThreadStartResponse>;
  turnStart(params: CodexTurnStartParams): Promise<CodexTurnStartResponse>;
  turnInterrupt(params: CodexTurnInterruptParams): Promise<Record<string, never>>;
}

/** Progress events mirroring the pi `subagent.progress` payload variants. */
export type CodexSubagentProgress =
  | { event: 'started'; task: string }
  | { event: 'tool_start'; toolName: string }
  | { event: 'tool_end'; toolName: string; isError: boolean }
  | { event: 'text_delta'; text: string }
  | { event: 'completed'; durationMs: number }
  | { event: 'failed'; error: string; durationMs: number };

export interface CodexSubagentOptions {
  task: string;
  resultFormat?: string;
  cwd?: string;
  model?: string;
  modelProvider?: string;
  config?: Record<string, unknown>;
  /** Max execution time in ms. Default 120s, clamped to 300s (mirrors pi). */
  timeoutMs?: number;
  /** Sandbox for the child thread. Defaults to the app's VM-delegated full access. */
  sandbox?: CodexSandboxMode;
  /** Approval preset for the child. Default 'on-request' so approvals gate per tool. */
  approvalPolicy?: CodexApprovalPolicy;
  /** Parent cancellation — aborts the child turn when the parent session stops. */
  parentSignal?: AbortSignal | null;
  onProgress?: (progress: CodexSubagentProgress) => void;
}

export interface CodexSubagentDeps {
  client: CodexSubagentClientLike;
  /** Stable id for the child (session id passed to the translator). Defaults to random. */
  subagentId?: string;
  createTranslator?: (sessionId: string) => CodexEventTranslator;
  now?: () => number;
  generateId?: () => string;
  logger?: CodexLogger;
}

export type CodexSubagentStatus = 'completed' | 'timeout' | 'cancelled' | 'error';

export interface CodexSubagentResult {
  text: string;
  status: CodexSubagentStatus;
  durationMs: number;
  error?: string;
}

const NOOP_LOGGER: CodexLogger = {
  log: () => {},
  warn: () => {},
  error: () => {},
};

class SubagentTimeoutError extends Error {
  constructor() {
    super('Subagent timed out');
    this.name = 'SubagentTimeoutError';
  }
}

class ParentCancelledError extends Error {
  constructor() {
    super('Parent session cancelled');
    this.name = 'ParentCancelledError';
  }
}

/**
 * Run a task in a child codex thread and collect its final text. Never throws: task/setup
 * failures, timeouts and cancellations are all reported through {@link CodexSubagentResult}
 * (matching the pi tool's error-as-result contract).
 */
export async function runCodexSubagent(
  options: CodexSubagentOptions,
  deps: CodexSubagentDeps
): Promise<CodexSubagentResult> {
  const client = deps.client;
  const now = deps.now ?? (() => Date.now());
  const logger = deps.logger ?? NOOP_LOGGER;
  const generateId = deps.generateId ?? (() => Math.random().toString(36).slice(2));
  const createTranslator =
    deps.createTranslator ?? ((sessionId: string) => new CodexEventTranslator({ sessionId }));
  const onProgress = options.onProgress;

  const startTime = now();

  const task = typeof options.task === 'string' ? options.task : '';
  if (task.trim().length === 0) {
    return { text: '', status: 'error', durationMs: 0, error: 'task parameter is required' };
  }
  if (task.length > MAX_TASK_LENGTH) {
    return {
      text: '',
      status: 'error',
      durationMs: 0,
      error: `task exceeds maximum length (${MAX_TASK_LENGTH} chars)`,
    };
  }

  const timeoutMs = Math.min(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);
  const subagentId = deps.subagentId ?? generateId();

  emitProgress(onProgress, { event: 'started', task: task.slice(0, 200) });

  if (!client.isReady()) {
    try {
      await client.start();
    } catch (err: unknown) {
      const durationMs = now() - startTime;
      const message = err instanceof Error ? err.message : String(err);
      emitProgress(onProgress, { event: 'failed', error: message.slice(0, 200), durationMs });
      return { text: '', status: 'error', durationMs, error: message };
    }
  }

  const childSystemPrompt = buildChildSystemPrompt(task, options.resultFormat);
  const threadStartParams: CodexThreadStartParams = {
    baseInstructions: childSystemPrompt,
    approvalPolicy: options.approvalPolicy ?? 'on-request',
    sandbox: options.sandbox ?? 'danger-full-access',
    ...(options.model ? { model: options.model } : {}),
    ...(options.modelProvider ? { modelProvider: options.modelProvider } : {}),
    ...(options.cwd ? { cwd: options.cwd } : {}),
    ...(options.config ? { config: options.config } : {}),
  };

  let threadId: string;
  try {
    const threadRes = await client.threadStart(threadStartParams);
    threadId = threadRes.thread.id;
  } catch (err: unknown) {
    const durationMs = now() - startTime;
    const message = err instanceof Error ? err.message : String(err);
    emitProgress(onProgress, { event: 'failed', error: message.slice(0, 200), durationMs });
    return { text: '', status: 'error', durationMs, error: message };
  }

  const translator = createTranslator(subagentId);
  let finalText = '';
  let streamedText = '';
  let turnId: string | null = null;

  let resolveDone: () => void = () => {};
  let rejectDone: (err: Error) => void = () => {};
  const donePromise = new Promise<void>((resolve, reject) => {
    resolveDone = resolve;
    rejectDone = reject;
  });

  const unsubscribe = client.onNotification((notification: CodexNotification) => {
    if (readThreadId(notification.params) !== threadId) return;
    for (const action of translator.handleNotification(notification)) {
      handleAction(action, {
        onProgress,
        onText: (delta) => {
          streamedText += delta;
        },
        onFinalMessage: (message) => {
          const extracted = extractAssistantText(message);
          if (extracted) finalText = extracted;
        },
      });
    }
    if (notification.method === 'turn/completed') {
      resolveDone();
    } else if (notification.method === 'turn/failed' || notification.method === 'error') {
      rejectDone(new Error(readErrorMessage(notification.params)));
    }
  });

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let parentAbortHandler: (() => void) | undefined;
  const parentSignal = options.parentSignal ?? null;

  try {
    const turnRes = await client.turnStart({
      threadId,
      input: [{ type: 'text', text: task }],
      approvalPolicy: options.approvalPolicy ?? 'on-request',
    });
    turnId = turnRes.turn.id;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new SubagentTimeoutError()), timeoutMs);
    });

    const racers: Promise<unknown>[] = [donePromise, timeoutPromise];
    if (parentSignal) {
      racers.push(
        new Promise<never>((_, reject) => {
          if (parentSignal.aborted) {
            reject(new ParentCancelledError());
            return;
          }
          parentAbortHandler = () => reject(new ParentCancelledError());
          parentSignal.addEventListener('abort', parentAbortHandler);
        })
      );
    }

    await Promise.race(racers);

    const durationMs = now() - startTime;
    emitProgress(onProgress, { event: 'completed', durationMs });
    return { text: finalText || streamedText, status: 'completed', durationMs };
  } catch (err: unknown) {
    const durationMs = now() - startTime;
    const isTimeout = err instanceof SubagentTimeoutError;
    const isCancelled = err instanceof ParentCancelledError;
    const message = err instanceof Error ? err.message : String(err);

    // Interrupt the in-flight child turn so it stops consuming the shared app-server.
    if (turnId) {
      try {
        await client.turnInterrupt({ threadId, turnId });
      } catch (interruptErr: unknown) {
        logger.warn(
          '[codex subagent] interrupt failed',
          interruptErr instanceof Error ? interruptErr.message : String(interruptErr)
        );
      }
    }

    const status: CodexSubagentStatus = isTimeout ? 'timeout' : isCancelled ? 'cancelled' : 'error';
    emitProgress(onProgress, {
      event: 'failed',
      error: isTimeout ? 'timeout' : isCancelled ? 'cancelled' : message.slice(0, 200),
      durationMs,
    });
    return {
      text: finalText || streamedText,
      status,
      durationMs,
      ...(status === 'error' ? { error: message } : {}),
    };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    if (parentAbortHandler && parentSignal) {
      parentSignal.removeEventListener('abort', parentAbortHandler);
    }
    unsubscribe();
  }
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function buildChildSystemPrompt(task: string, resultFormat?: string): string {
  const parts = [
    'You are a focused sub-agent. Complete the task below and return ONLY the result.',
    'Do not ask questions. Do not provide commentary beyond what is needed for the result.',
    '',
    '## Task',
    task,
  ];
  if (resultFormat) {
    parts.push('', '## Expected Output Format', resultFormat);
  }
  return parts.join('\n');
}

interface ActionHandlers {
  onProgress?: (progress: CodexSubagentProgress) => void;
  onText: (delta: string) => void;
  onFinalMessage: (message: Message) => void;
}

function handleAction(
  action: ReturnType<CodexEventTranslator['handleNotification']>[number],
  handlers: ActionHandlers
): void {
  switch (action.kind) {
    case 'partial':
      if (action.delta) {
        handlers.onText(action.delta);
        emitProgress(handlers.onProgress, { event: 'text_delta', text: action.delta });
      }
      break;
    case 'traceStep':
      emitProgress(handlers.onProgress, {
        event: 'tool_start',
        toolName: toolNameFromStep(action.step),
      });
      break;
    case 'traceUpdate':
      emitProgress(handlers.onProgress, {
        event: 'tool_end',
        toolName: action.updates.toolName ?? 'unknown',
        isError: action.updates.status === 'error',
      });
      break;
    case 'message':
      handlers.onFinalMessage(action.message);
      break;
    default:
      break;
  }
}

function toolNameFromStep(step: TraceStep): string {
  return step.toolName ?? 'unknown';
}

function extractAssistantText(message: Message): string {
  if (!Array.isArray(message.content)) return '';
  return message.content
    .filter(
      (block): block is { type: 'text'; text: string } =>
        block.type === 'text' && typeof (block as { text?: unknown }).text === 'string'
    )
    .map((block) => block.text)
    .join('');
}

function emitProgress(
  onProgress: ((progress: CodexSubagentProgress) => void) | undefined,
  progress: CodexSubagentProgress
): void {
  if (!onProgress) return;
  try {
    onProgress(progress);
  } catch {
    // Progress sink (renderer) may be disconnected — swallow to avoid disrupting the run.
  }
}

function readThreadId(params: unknown): string | undefined {
  if (params && typeof params === 'object' && 'threadId' in params) {
    const value = (params as { threadId?: unknown }).threadId;
    return typeof value === 'string' ? value : undefined;
  }
  return undefined;
}

function readErrorMessage(params: unknown): string {
  if (params && typeof params === 'object') {
    const err = (params as { error?: { message?: unknown } }).error;
    if (err && typeof err.message === 'string') return err.message;
    const message = (params as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return 'turn_failed';
}
