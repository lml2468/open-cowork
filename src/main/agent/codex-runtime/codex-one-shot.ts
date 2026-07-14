/**
 * codex-one-shot — codex equivalent of `sdk-one-shot.ts`'s utility calls (title
 * generation + API connectivity probe), which today go through pi-ai `completeSimple`.
 *
 * Instead of the pi model registry, this drives a single non-interactive turn on an
 * ephemeral codex thread:
 *   - `approvalPolicy: 'never'` and `sandbox: 'read-only'` — these are pure text
 *     completions (title/probe), no tools and no filesystem writes, so no approval
 *     round-trips are needed (mirrors pi `completeSimple`, which runs no agent loop).
 *   - the caller-supplied system prompt is passed as `baseInstructions` so the built-in
 *     coding-agent prompt does not bleed into a title/probe answer.
 *
 * The assistant text + a `hasThinking` flag are collected by feeding the codex
 * notifications through the same {@link CodexEventTranslator} the runtime uses, so text /
 * reasoning extraction stays consistent with the streaming path.
 *
 * Everything is injected (a minimal {@link CodexOneShotClientLike}, translator factory,
 * clock) so unit tests drive it against a fake client with no real codex process.
 */

import type { ApiTestResult } from '../../../renderer/types';
import { normalizeGeneratedTitle } from '../../session/session-title-utils';
import { CodexEventTranslator } from './codex-event-translator';
import type {
  CodexInitializeResponse,
  CodexLogger,
  CodexNotification,
  CodexNotificationListener,
  CodexThreadStartParams,
  CodexThreadStartResponse,
  CodexTurnStartParams,
  CodexTurnStartResponse,
} from './codex-client';

/** The subset of {@link CodexClient} a one-shot turn depends on (satisfied structurally). */
export interface CodexOneShotClientLike {
  isReady(): boolean;
  start(): Promise<CodexInitializeResponse>;
  onNotification(listener: CodexNotificationListener): () => void;
  threadStart(params: CodexThreadStartParams): Promise<CodexThreadStartResponse>;
  turnStart(params: CodexTurnStartParams): Promise<CodexTurnStartResponse>;
}

export interface CodexOneShotOptions {
  prompt: string;
  systemPrompt: string;
  model?: string;
  modelProvider?: string;
  cwd?: string;
  /** Flattened codex config overrides (e.g. `model_providers.*`). */
  config?: Record<string, unknown>;
  /** Abandon the turn after this long. Default 60s. */
  timeoutMs?: number;
}

export interface CodexOneShotDeps {
  client: CodexOneShotClientLike;
  /** Injectable translator factory (defaults to a plain `CodexEventTranslator`). */
  createTranslator?: (sessionId: string) => CodexEventTranslator;
  now?: () => number;
  logger?: CodexLogger;
}

/** Mirrors `runPiAiOneShot`'s return shape. */
export interface CodexOneShotResult {
  text: string;
  hasThinking: boolean;
  durationMs: number;
}

const DEFAULT_TIMEOUT_MS = 60_000;
const ONE_SHOT_SESSION_ID = 'codex-one-shot';
const PROBE_ACK = 'sdk_probe_ok';

const NOOP_LOGGER: CodexLogger = {
  log: () => {},
  warn: () => {},
  error: () => {},
};

// Error-classification regexes mirror sdk-one-shot.ts (kept local; that module is
// pi-owned and must not be modified in this phase).
const NETWORK_ERROR_RE =
  /enotfound|econnrefused|etimedout|eai_again|enetunreach|timed?\s*out|timeout|abort|network\s*error/i;
const AUTH_ERROR_RE =
  /authentication[_\s-]?failed|\bunauthorized\b|invalid[_\s-]?api[_\s-]?key|api[_\s-]?key[_\s-]?invalid|api[_\s]+key[_\s]+not[_\s]+valid|\bforbidden\b|permission[_\s-]?denied|\b401\b|\b403\b/i;
const RATE_LIMIT_RE = /rate[_\s-]?limit|too\s+many\s+requests|429/i;
const SERVER_ERROR_RE = /server[_\s-]?error|internal\s+server\s+error|\b5\d\d\b/i;

class CodexOneShotTimeoutError extends Error {
  constructor(ms: number) {
    super(`codex one-shot timed out after ${ms}ms`);
    this.name = 'CodexOneShotTimeoutError';
  }
}

/**
 * Run a single non-interactive codex turn and return the assistant text. The codex
 * analogue of `runPiAiOneShot`.
 */
export async function runCodexOneShot(
  options: CodexOneShotOptions,
  deps: CodexOneShotDeps
): Promise<CodexOneShotResult> {
  const client = deps.client;
  const now = deps.now ?? (() => Date.now());
  const logger = deps.logger ?? NOOP_LOGGER;
  const createTranslator =
    deps.createTranslator ?? ((sessionId: string) => new CodexEventTranslator({ sessionId }));
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const start = now();

  if (!client.isReady()) {
    await client.start();
  }

  const threadStartParams: CodexThreadStartParams = {
    approvalPolicy: 'never',
    sandbox: 'read-only',
    baseInstructions: options.systemPrompt,
    ...(options.model ? { model: options.model } : {}),
    ...(options.modelProvider ? { modelProvider: options.modelProvider } : {}),
    ...(options.cwd ? { cwd: options.cwd } : {}),
    ...(options.config ? { config: options.config } : {}),
  };
  const threadRes = await client.threadStart(threadStartParams);
  const threadId = threadRes.thread.id;

  const translator = createTranslator(ONE_SHOT_SESSION_ID);
  let text = '';
  let hasThinking = false;

  let resolveDone: () => void = () => {};
  let rejectDone: (err: Error) => void = () => {};
  const donePromise = new Promise<void>((resolve, reject) => {
    resolveDone = resolve;
    rejectDone = reject;
  });

  const unsubscribe = client.onNotification((notification: CodexNotification) => {
    if (readThreadId(notification.params) !== threadId) return;
    for (const action of translator.handleNotification(notification)) {
      if (action.kind === 'partial') {
        text += action.delta;
      } else if (action.kind === 'thinking') {
        hasThinking = true;
      } else if (action.kind === 'message') {
        const extracted = extractAssistantText(action.message);
        if (extracted) text = extracted;
      }
    }
    if (notification.method === 'turn/completed') {
      resolveDone();
    } else if (notification.method === 'turn/failed') {
      rejectDone(new Error(readErrorMessage(notification.params)));
    } else if (notification.method === 'error') {
      rejectDone(new Error(readErrorMessage(notification.params)));
    }
  });

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new CodexOneShotTimeoutError(timeoutMs)), timeoutMs);
  });

  try {
    const turnParams: CodexTurnStartParams = {
      threadId,
      input: [{ type: 'text', text: options.prompt }],
      approvalPolicy: 'never',
    };
    await client.turnStart(turnParams);
    await Promise.race([donePromise, timeoutPromise]);
    return { text: text.trim(), hasThinking, durationMs: now() - start };
  } catch (err: unknown) {
    logger.warn('[codex one-shot] turn failed', err instanceof Error ? err.message : String(err));
    throw err instanceof Error ? err : new Error(String(err));
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    unsubscribe();
  }
}

/**
 * Generate a session title with a one-shot codex turn. Codex analogue of
 * `generateTitleWithSdk` — returns the normalized title, or `null` on empty output /
 * failure (never throws).
 */
export async function generateTitleWithCodex(
  options: {
    titlePrompt: string;
    model?: string;
    modelProvider?: string;
    config?: Record<string, unknown>;
  },
  deps: CodexOneShotDeps
): Promise<string | null> {
  try {
    const result = await runCodexOneShot(
      {
        prompt: options.titlePrompt,
        systemPrompt:
          'Generate a concise title. Reply with only the title text and no extra markup.',
        model: options.model,
        modelProvider: options.modelProvider,
        config: options.config,
      },
      deps
    );
    return normalizeGeneratedTitle(result.text);
  } catch (err: unknown) {
    (deps.logger ?? NOOP_LOGGER).warn(
      '[codex one-shot] title generation failed',
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }
}

/**
 * Probe API connectivity with a one-shot codex turn. Codex analogue of `probeWithSdk` —
 * resolves to an {@link ApiTestResult} (never throws); provider errors are classified the
 * same way as the pi probe.
 */
export async function testCodexConnectivity(
  options: { model?: string; modelProvider?: string; config?: Record<string, unknown> },
  deps: CodexOneShotDeps
): Promise<ApiTestResult> {
  const probeStart = (deps.now ?? (() => Date.now()))();
  try {
    const result = await runCodexOneShot(
      {
        prompt: `What is 2+2? After answering, also include this token: ${PROBE_ACK}`,
        systemPrompt: `You are a connectivity test. Answer briefly, then include the token: ${PROBE_ACK}`,
        model: options.model,
        modelProvider: options.modelProvider,
        config: options.config,
      },
      deps
    );

    if (!result.text && !result.hasThinking) {
      return {
        ok: false,
        latencyMs: result.durationMs,
        errorType: 'unknown',
        details: 'empty_probe_response',
      };
    }
    // Thinking-only responses can't be validated against the ack token, but the model is
    // reachable — treat as ok (mirrors probeWithSdk).
    if (!result.text && result.hasThinking) {
      return { ok: true, latencyMs: result.durationMs };
    }
    if (!normalizeProbeAck(result.text).includes(PROBE_ACK)) {
      return {
        ok: false,
        latencyMs: result.durationMs,
        errorType: 'unknown',
        details: `probe_response_mismatch:${result.text.slice(0, 120)}`,
      };
    }
    return { ok: true, latencyMs: result.durationMs };
  } catch (err: unknown) {
    const details = err instanceof Error ? err.message : String(err);
    const elapsed = (deps.now ?? (() => Date.now()))() - probeStart;
    return classifyCodexProbeError(details, elapsed);
  }
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function classifyCodexProbeError(errorText: string, durationMs: number): ApiTestResult {
  const details = errorText.trim();
  const lowered = details.toLowerCase();
  if (AUTH_ERROR_RE.test(lowered)) {
    return { ok: false, latencyMs: durationMs, errorType: 'unauthorized', details };
  }
  if (RATE_LIMIT_RE.test(lowered)) {
    return { ok: false, latencyMs: durationMs, errorType: 'rate_limited', details };
  }
  if (SERVER_ERROR_RE.test(lowered)) {
    return { ok: false, latencyMs: durationMs, errorType: 'server_error', details };
  }
  if (NETWORK_ERROR_RE.test(lowered)) {
    return { ok: false, latencyMs: durationMs, errorType: 'network_error', details };
  }
  return { ok: false, latencyMs: durationMs, errorType: 'unknown', details };
}

function normalizeProbeAck(raw: string): string {
  return raw
    .replace(/(?<!\w)[*_~`"']+|[*_~`"']+(?!\w)/g, '')
    .replace(/[.,!?;:]+$/g, '')
    .trim()
    .toLowerCase();
}

function extractAssistantText(message: { content: unknown }): string {
  if (!Array.isArray(message.content)) return '';
  return message.content
    .filter(
      (block): block is { type: 'text'; text: string } =>
        !!block &&
        typeof block === 'object' &&
        (block as { type?: unknown }).type === 'text' &&
        typeof (block as { text?: unknown }).text === 'string'
    )
    .map((block) => block.text)
    .join('');
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
