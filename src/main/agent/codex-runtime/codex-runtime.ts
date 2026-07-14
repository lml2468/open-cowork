/**
 * CodexRuntime — Seam 1 of the pi→Codex migration.
 *
 * Assembles a {@link CodexClient} (transport + lifecycle) and a
 * {@link CodexEventTranslator} (Seam 3) into a session-oriented turn API, occupying the
 * role pi plays inside `CoworkAgentRunner` today. `CoworkAgentRunner` keeps its
 * runtime-agnostic responsibilities (prompt assembly, skills, sandbox, timeouts) and, in
 * Phase 5, calls this runtime at the seam boundary; the app-server process is kept warm
 * across turns and per-session codex threads are tracked here.
 *
 * Emitter mapping (mirrors the pi emitters fed by `agent-runner.ts`):
 *   translator 'partial'     → sendPartial(sessionId, delta)          → 'stream.partial'
 *   translator 'thinking'    → sendToRenderer({'stream.thinking'})    → 'stream.thinking'
 *   translator 'traceStep'   → sendTraceStep(sessionId, step)         → 'trace.step'
 *   translator 'traceUpdate' → sendTraceUpdate(sessionId, ...)        → 'trace.update'
 *   translator 'message'     → sendMessage(sessionId, message)        → 'stream.message'
 *   translator 'tokenUsage'  → onTokenUsage(...)   (Phase 5 → 'session.contextInfo')
 *   translator 'compaction'  → onCompaction(...)   (Phase 5 → 'compaction.result')
 *   translator 'error'       → onError(...)        (Phase 5 → terminal 'stream.message')
 *
 * `onTokenUsage` / `onCompaction` / `onError` are semantic callbacks (not raw
 * `ServerEvent`s) because the translator abstracts events the app enriches later:
 * `compaction.result` needs summary/tokensBefore/read+modified files the translator does
 * not have, and the context-usage bar aggregates token counts. Phase 5 wires them.
 *
 * Everything is injected (CodexClient, the two bridges, emitters, translator factory), so
 * unit tests drive it against a fake client with no real codex process or network.
 */

import type { Message, ServerEvent, TokenUsage, TraceStep } from '../../../renderer/types';
import { CodexEventTranslator, type CodexTranslatorAction } from './codex-event-translator';
import type {
  CodexApprovalPolicy,
  CodexInitializeResponse,
  CodexLogger,
  CodexNotification,
  CodexNotificationListener,
  CodexSandboxMode,
  CodexServerRequest,
  CodexServerRequestHandler,
  CodexThreadStartParams,
  CodexThreadStartResponse,
  CodexTurnInterruptParams,
  CodexTurnStartParams,
  CodexTurnStartResponse,
  CodexTurnSteerParams,
  CodexTurnSteerResponse,
} from './codex-client';
import { CodexPermissionBridge } from './codex-permission-bridge';
import { CodexToolBridge } from './codex-tool-bridge';

/** The subset of {@link CodexClient} the runtime depends on (satisfied structurally). */
export interface CodexClientLike {
  isReady(): boolean;
  start(): Promise<CodexInitializeResponse>;
  onNotification(listener: CodexNotificationListener): () => void;
  setServerRequestHandler(handler: CodexServerRequestHandler | null): void;
  threadStart(params: CodexThreadStartParams): Promise<CodexThreadStartResponse>;
  turnStart(params: CodexTurnStartParams): Promise<CodexTurnStartResponse>;
  turnSteer(params: CodexTurnSteerParams): Promise<CodexTurnSteerResponse>;
  turnInterrupt(params: CodexTurnInterruptParams): Promise<Record<string, never>>;
  dispose(): void;
}

/** The emitter set the runtime dispatches translator actions to (mirrors the pi path). */
export interface CodexRuntimeEmitters {
  sendPartial: (sessionId: string, delta: string) => void;
  sendToRenderer: (event: ServerEvent) => void;
  sendTraceStep: (sessionId: string, step: TraceStep) => void;
  sendTraceUpdate: (sessionId: string, stepId: string, updates: Partial<TraceStep>) => void;
  sendMessage: (sessionId: string, message: Message) => void;
  onTokenUsage: (info: {
    sessionId: string;
    tokenUsage: TokenUsage;
    contextWindow: number | null;
  }) => void;
  onCompaction: (info: { sessionId: string; turnId: string }) => void;
  onError: (info: { sessionId: string; message: string; willRetry: boolean }) => void;
}

export interface CodexRuntimeOptions {
  client: CodexClientLike;
  emitters: CodexRuntimeEmitters;
  permissionBridge: CodexPermissionBridge;
  toolBridge: CodexToolBridge;
  /** Delegated to the app's Lima/WSL VM by default (see design.md sandbox section). */
  sandbox?: CodexSandboxMode;
  /** Default 'on-request' so the model escalates and the app answers per tool. */
  approvalPolicy?: CodexApprovalPolicy;
  /** Injectable translator factory (defaults to a plain `CodexEventTranslator`). */
  createTranslator?: (sessionId: string) => CodexEventTranslator;
  logger?: CodexLogger;
}

export interface CodexRunTurnOptions {
  sessionId: string;
  input: string;
  model?: string;
  modelProvider?: string;
  cwd?: string;
  effort?: string;
  baseInstructions?: string;
  developerInstructions?: string;
  config?: Record<string, unknown>;
}

export interface CodexTurnResult {
  turnId: string | null;
}

interface ActiveTurn {
  threadId: string;
  turnId: string | null;
  resolve: (result: CodexTurnResult) => void;
  reject: (error: Error) => void;
}

const NOOP_LOGGER: CodexLogger = {
  log: () => {},
  warn: () => {},
  error: () => {},
};

export class CodexRuntime {
  private readonly client: CodexClientLike;
  private readonly emitters: CodexRuntimeEmitters;
  private readonly permissionBridge: CodexPermissionBridge;
  private readonly toolBridge: CodexToolBridge;
  private readonly sandbox: CodexSandboxMode;
  private readonly approvalPolicy: CodexApprovalPolicy;
  private readonly createTranslator: (sessionId: string) => CodexEventTranslator;
  private readonly logger: CodexLogger;

  private readonly sessionToThread = new Map<string, string>();
  private readonly threadToSession = new Map<string, string>();
  private readonly translators = new Map<string, CodexEventTranslator>();
  private readonly activeTurns = new Map<string, ActiveTurn>();

  private unsubscribeNotifications: (() => void) | null = null;
  private startPromise: Promise<void> | null = null;
  private disposed = false;

  constructor(options: CodexRuntimeOptions) {
    this.client = options.client;
    this.emitters = options.emitters;
    this.permissionBridge = options.permissionBridge;
    this.toolBridge = options.toolBridge;
    this.sandbox = options.sandbox ?? 'danger-full-access';
    this.approvalPolicy = options.approvalPolicy ?? 'on-request';
    this.createTranslator =
      options.createTranslator ?? ((sessionId) => new CodexEventTranslator({ sessionId }));
    this.logger = options.logger ?? NOOP_LOGGER;

    // Route codex notifications through the translator, and answer approval / tool
    // server-requests through the bridges — the whole point of the long-lived app-server.
    this.unsubscribeNotifications = this.client.onNotification((n) => this.handleNotification(n));
    this.client.setServerRequestHandler((req) => this.handleServerRequest(req));
  }

  /** Run one turn for a session; resolves on `turn/completed`, rejects on `turn/failed`. */
  async runTurn(options: CodexRunTurnOptions): Promise<CodexTurnResult> {
    if (this.disposed) {
      throw new Error('CodexRuntime has been disposed');
    }
    if (this.activeTurns.has(options.sessionId)) {
      throw new Error(`a turn is already in progress for session ${options.sessionId}`);
    }

    const threadId = await this.ensureThread(options);

    // Fresh translator per turn — one turn per session at a time, so replacing is safe and
    // avoids any cross-turn accumulation leaking into the assembled final message.
    this.translators.set(options.sessionId, this.createTranslator(options.sessionId));

    return new Promise<CodexTurnResult>((resolve, reject) => {
      this.activeTurns.set(options.sessionId, { threadId, turnId: null, resolve, reject });

      const params: CodexTurnStartParams = {
        threadId,
        input: [{ type: 'text', text: options.input }],
        approvalPolicy: this.approvalPolicy,
        ...(options.model ? { model: options.model } : {}),
        ...(options.effort ? { effort: options.effort } : {}),
        ...(options.cwd ? { cwd: options.cwd } : {}),
      };

      this.client
        .turnStart(params)
        .then((res: CodexTurnStartResponse) => {
          const active = this.activeTurns.get(options.sessionId);
          if (active) active.turnId = res.turn.id;
        })
        .catch((err: unknown) => {
          this.activeTurns.delete(options.sessionId);
          reject(err instanceof Error ? err : new Error(String(err)));
        });
    });
  }

  /**
   * Loop-guard steering — inject a mid-turn user message into the active turn. This is the
   * clean, first-class replacement for pi's private
   * `session.sendUserMessage(..., { deliverAs: 'steer' })` reach-in (spike 0.A `turn/steer`).
   */
  async steer(sessionId: string, text: string): Promise<void> {
    const active = this.requireActiveTurn(sessionId, 'steer');
    await this.client.turnSteer({
      threadId: active.threadId,
      input: [{ type: 'text', text }],
      expectedTurnId: active.turnId as string,
    });
  }

  /** Interrupt the active turn for a session (`turn/interrupt`). */
  async interrupt(sessionId: string): Promise<void> {
    const active = this.requireActiveTurn(sessionId, 'interrupt');
    await this.client.turnInterrupt({ threadId: active.threadId, turnId: active.turnId as string });
  }

  /** Forget a session's thread + translator (keeps the app-server warm). */
  disposeSession(sessionId: string): void {
    const threadId = this.sessionToThread.get(sessionId);
    if (threadId) this.threadToSession.delete(threadId);
    this.sessionToThread.delete(sessionId);
    this.translators.delete(sessionId);
    const active = this.activeTurns.get(sessionId);
    if (active) {
      this.activeTurns.delete(sessionId);
      active.reject(new Error('session disposed'));
    }
  }

  /** Tear down everything, including the app-server child. Idempotent. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribeNotifications?.();
    this.unsubscribeNotifications = null;
    this.client.setServerRequestHandler(null);
    for (const active of this.activeTurns.values()) {
      active.reject(new Error('CodexRuntime disposed'));
    }
    this.activeTurns.clear();
    this.translators.clear();
    this.sessionToThread.clear();
    this.threadToSession.clear();
    this.client.dispose();
  }

  // --- internals ----------------------------------------------------------

  private requireActiveTurn(sessionId: string, action: string): ActiveTurn {
    const active = this.activeTurns.get(sessionId);
    if (!active || !active.turnId) {
      throw new Error(`no active turn to ${action} for session ${sessionId}`);
    }
    return active;
  }

  private async ensureThread(options: CodexRunTurnOptions): Promise<string> {
    await this.ensureStarted();

    const existing = this.sessionToThread.get(options.sessionId);
    if (existing) return existing;

    const params: CodexThreadStartParams = {
      approvalPolicy: this.approvalPolicy,
      sandbox: this.sandbox,
      ...(options.model ? { model: options.model } : {}),
      ...(options.modelProvider ? { modelProvider: options.modelProvider } : {}),
      ...(options.cwd ? { cwd: options.cwd } : {}),
      ...(options.baseInstructions ? { baseInstructions: options.baseInstructions } : {}),
      ...(options.developerInstructions
        ? { developerInstructions: options.developerInstructions }
        : {}),
      ...(options.config ? { config: options.config } : {}),
    };

    const res = await this.client.threadStart(params);
    const threadId = res.thread.id;
    this.sessionToThread.set(options.sessionId, threadId);
    this.threadToSession.set(threadId, options.sessionId);
    return threadId;
  }

  private async ensureStarted(): Promise<void> {
    if (this.client.isReady()) return;
    if (!this.startPromise) {
      this.startPromise = this.client
        .start()
        .then(() => undefined)
        .finally(() => {
          this.startPromise = null;
        });
    }
    return this.startPromise;
  }

  private handleNotification(notification: CodexNotification): void {
    const threadId = readThreadId(notification.params);
    const sessionId = threadId ? this.threadToSession.get(threadId) : undefined;
    if (!sessionId) return;

    const translator = this.translators.get(sessionId);
    if (translator) {
      for (const action of translator.handleNotification(notification)) {
        this.dispatchAction(action);
      }
    }

    if (notification.method === 'turn/completed') {
      this.completeTurn(sessionId);
    } else if (notification.method === 'turn/failed') {
      this.failTurn(sessionId, notification.params);
    }
  }

  private dispatchAction(action: CodexTranslatorAction): void {
    switch (action.kind) {
      case 'partial':
        this.emitters.sendPartial(action.sessionId, action.delta);
        break;
      case 'thinking':
        this.emitters.sendToRenderer({
          type: 'stream.thinking',
          payload: { sessionId: action.sessionId, delta: action.delta },
        });
        break;
      case 'traceStep':
        this.emitters.sendTraceStep(action.sessionId, action.step);
        break;
      case 'traceUpdate':
        this.emitters.sendTraceUpdate(action.sessionId, action.stepId, action.updates);
        break;
      case 'message':
        this.emitters.sendMessage(action.sessionId, action.message);
        break;
      case 'tokenUsage':
        this.emitters.onTokenUsage({
          sessionId: action.sessionId,
          tokenUsage: action.tokenUsage,
          contextWindow: action.contextWindow,
        });
        break;
      case 'compaction':
        this.emitters.onCompaction({ sessionId: action.sessionId, turnId: action.turnId });
        break;
      case 'error':
        this.emitters.onError({
          sessionId: action.sessionId,
          message: action.message,
          willRetry: action.willRetry,
        });
        break;
    }
  }

  private completeTurn(sessionId: string): void {
    const active = this.activeTurns.get(sessionId);
    if (!active) return;
    this.activeTurns.delete(sessionId);
    active.resolve({ turnId: active.turnId });
  }

  private failTurn(sessionId: string, params: unknown): void {
    const active = this.activeTurns.get(sessionId);
    const message = readErrorMessage(params);
    this.emitters.onError({ sessionId, message, willRetry: false });
    if (!active) return;
    this.activeTurns.delete(sessionId);
    active.reject(new Error(message));
  }

  private async handleServerRequest(request: CodexServerRequest): Promise<unknown> {
    if (this.permissionBridge.canHandle(request.method)) {
      const sessionId = this.resolveSessionId(request.params);
      return this.permissionBridge.handle(request, sessionId);
    }
    if (this.toolBridge.canHandle(request.method)) {
      return this.toolBridge.handle(request);
    }
    this.logger.warn('[CodexRuntime] unhandled server request', request.method);
    throw new Error(`Unhandled codex server request: ${request.method}`);
  }

  private resolveSessionId(params: unknown): string {
    const threadId = readThreadId(params);
    if (threadId) {
      return this.threadToSession.get(threadId) ?? threadId;
    }
    return 'unknown';
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
