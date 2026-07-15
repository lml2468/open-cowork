/**
 * CodexClient — spawns and supervises a long-lived `codex app-server` child process
 * and speaks the newline-delimited JSON-RPC v2 protocol verified in the Phase 0 spike.
 *
 * Framing (empirically confirmed against codex 0.142.5):
 *   - Every message is a single JSON object terminated by a newline.
 *   - Request (host -> server):        { id, method, params }
 *   - Response (server -> host):       { id, result } | { id, error }
 *   - Notification (server -> host):   { method, params }            (no id)
 *   - Server request (server -> host): { id, method, params }        (has id + method)
 *     The host must answer with { id, result } | { id, error }.
 *
 * The transport is decoupled from Electron/Node specifics: the child process is created
 * through an injectable spawn function so it can be driven against a fake child in unit
 * tests, and logging goes through an injectable logger.
 */

import { spawn as nodeSpawn } from 'child_process';

// ---------------------------------------------------------------------------
// Protocol types (minimal, hand-declared subset of `codex app-server generate-ts`).
// The full bindings can be regenerated for reference but are intentionally not
// committed; only the shapes this client actually uses are declared here.
// ---------------------------------------------------------------------------

export type JsonRpcId = number | string;

export interface JsonRpcErrorBody {
  code: number;
  message: string;
  data?: unknown;
}

export interface CodexClientInfo {
  name: string;
  title?: string | null;
  version: string;
}

export interface CodexInitializeCapabilities {
  experimentalApi: boolean;
  requestAttestation: boolean;
  mcpServerOpenaiFormElicitation?: boolean;
  optOutNotificationMethods?: string[] | null;
}

export interface CodexInitializeParams {
  clientInfo: CodexClientInfo;
  capabilities: CodexInitializeCapabilities | null;
}

export interface CodexInitializeResponse {
  userAgent: string;
  codexHome: string;
  platformFamily: string;
  platformOs: string;
}

export type CodexSandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access';

/** Coarse approval preset. The `granular` variant is intentionally omitted here. */
export type CodexApprovalPolicy = 'untrusted' | 'on-failure' | 'on-request' | 'never';

export interface CodexThreadStartParams {
  model?: string | null;
  modelProvider?: string | null;
  cwd?: string | null;
  approvalPolicy?: CodexApprovalPolicy | null;
  sandbox?: CodexSandboxMode | null;
  config?: Record<string, unknown> | null;
  baseInstructions?: string | null;
  developerInstructions?: string | null;
  /**
   * Host-injected `dynamic_tools` registration specs (see codex-tool-bridge). Sent on
   * thread start so codex knows which host function tools exist for the thread's turns.
   * Typed as `unknown[]` here to keep the transport layer free of the tool-bridge module.
   */
  dynamicTools?: unknown[] | null;
}

export interface CodexThreadRef {
  id: string;
}

export interface CodexThreadStartResponse {
  thread: CodexThreadRef;
  model: string;
  modelProvider: string;
}

/**
 * Params for `thread/resume` — reload a persisted thread from codex's on-disk rollout by id
 * and rejoin it, restoring its server-side history (text + reasoning + tool calls). Unlike
 * `thread/start`, there is **no `dynamicTools` field**: host tools cannot be re-registered on
 * resume. Host tools work on a resumed thread only if codex restored their specs from the
 * rollout (validated by the live resume gate, not guaranteed here). Config overrides (incl.
 * `mcp_servers`) do re-apply.
 */
export interface CodexThreadResumeParams {
  threadId: string;
  model?: string | null;
  modelProvider?: string | null;
  cwd?: string | null;
  approvalPolicy?: CodexApprovalPolicy | null;
  sandbox?: CodexSandboxMode | null;
  config?: Record<string, unknown> | null;
  baseInstructions?: string | null;
  developerInstructions?: string | null;
}

export interface CodexThreadResumeResponse {
  thread: CodexThreadRef;
  model: string;
  modelProvider: string;
}

/** A single user input element. Only the `text` variant is modeled here. */
export interface CodexTextInput {
  type: 'text';
  text: string;
}

export type CodexUserInput = CodexTextInput;

export interface CodexTurnStartParams {
  threadId: string;
  input: CodexUserInput[];
  clientUserMessageId?: string | null;
  cwd?: string | null;
  approvalPolicy?: CodexApprovalPolicy | null;
  model?: string | null;
  effort?: string | null;
  outputSchema?: unknown;
}

export interface CodexTurnRef {
  id: string;
}

export interface CodexTurnStartResponse {
  turn: CodexTurnRef;
}

export interface CodexTurnSteerParams {
  threadId: string;
  input: CodexUserInput[];
  expectedTurnId: string;
  clientUserMessageId?: string | null;
}

export interface CodexTurnSteerResponse {
  turnId: string;
}

export interface CodexTurnInterruptParams {
  threadId: string;
  turnId: string;
}

export interface CodexThreadInjectItemsParams {
  threadId: string;
  /** Raw Responses API items appended to the thread's model-visible history. */
  items: unknown[];
}

/**
 * Trigger codex-native compaction for a thread (`thread/compact/start`, verified in the
 * Phase 0 spike). The summary is delivered later as a `thread/compacted`
 * (`ContextCompactedNotification`) the event translator maps to a `compaction` action.
 */
export interface CodexThreadCompactStartParams {
  threadId: string;
}

/**
 * Command-execution approval decision (server request
 * `item/commandExecution/requestApproval`). NOT the legacy `ReviewDecision`
 * approved/denied strings.
 */
export type CodexCommandApprovalDecision =
  | 'accept'
  | 'acceptForSession'
  | 'decline'
  | 'cancel'
  | { acceptWithExecpolicyAmendment: { execpolicy_amendment: unknown } }
  | { applyNetworkPolicyAmendment: { network_policy_amendment: unknown } };

/** File-change approval decision (server request `item/fileChange/requestApproval`). */
export type CodexFileChangeApprovalDecision = 'accept' | 'acceptForSession' | 'decline' | 'cancel';

// ---------------------------------------------------------------------------
// Transport wiring
// ---------------------------------------------------------------------------

/** A server -> host notification (no id). */
export interface CodexNotification {
  method: string;
  params: unknown;
}

/** A server -> host request the host must answer. */
export interface CodexServerRequest {
  id: JsonRpcId;
  method: string;
  params: unknown;
}

export type CodexNotificationListener = (notification: CodexNotification) => void;

/**
 * Handler for server -> host requests. The resolved value is written back as the
 * JSON-RPC `result`; throwing produces a JSON-RPC `error` response.
 */
export type CodexServerRequestHandler = (request: CodexServerRequest) => unknown | Promise<unknown>;

export interface CodexLogger {
  log: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

/** Minimal shape of the child process this client drives (subset of Node's ChildProcess). */
export interface CodexChildProcessLike {
  readonly stdin: NodeJS.WritableStream | null;
  readonly stdout: NodeJS.ReadableStream | null;
  readonly stderr: NodeJS.ReadableStream | null;
  readonly pid?: number;
  kill(signal?: NodeJS.Signals | number): boolean;
  on(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;
  on(event: 'error', listener: (err: Error) => void): this;
}

export type CodexSpawnFn = (
  command: string,
  args: readonly string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv }
) => CodexChildProcessLike;

export type CodexClientState = 'idle' | 'starting' | 'ready' | 'crashed' | 'stopped';

export type CodexClientStateListener = (state: CodexClientState) => void;

export interface CodexClientOptions {
  clientInfo: CodexClientInfo;
  capabilities?: CodexInitializeCapabilities | null;
  binaryPath?: string;
  args?: readonly string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  spawn?: CodexSpawnFn;
  logger?: CodexLogger;
  autoRestart?: boolean;
  maxRestarts?: number;
  baseRestartDelayMs?: number;
  maxRestartDelayMs?: number;
}

const NOOP_LOGGER: CodexLogger = {
  log: () => {},
  warn: () => {},
  error: () => {},
};

const defaultSpawn: CodexSpawnFn = (command, args, options) =>
  nodeSpawn(command, [...args], {
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: options.cwd,
    env: options.env,
  });

/** Error thrown when the server answers a request with a JSON-RPC error. */
export class CodexRpcError extends Error {
  readonly code: number;
  readonly data: unknown;

  constructor(body: JsonRpcErrorBody) {
    super(body.message);
    this.name = 'CodexRpcError';
    this.code = body.code;
    this.data = body.data;
  }
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
}

interface RawMessage {
  id?: JsonRpcId;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: JsonRpcErrorBody;
}

export class CodexClient {
  private readonly binaryPath: string;
  private readonly args: readonly string[];
  private readonly cwd?: string;
  private readonly env?: NodeJS.ProcessEnv;
  private readonly spawnFn: CodexSpawnFn;
  private readonly logger: CodexLogger;
  private readonly autoRestart: boolean;
  private readonly maxRestarts: number;
  private readonly baseRestartDelayMs: number;
  private readonly maxRestartDelayMs: number;

  private initializeParams: CodexInitializeParams;

  private child: CodexChildProcessLike | null = null;
  private stdoutBuffer = '';
  private nextId = 1;
  private readonly pending = new Map<JsonRpcId, PendingRequest>();
  private readonly notificationListeners = new Set<CodexNotificationListener>();
  private serverRequestHandler: CodexServerRequestHandler | null = null;
  private readonly stateListeners = new Set<CodexClientStateListener>();

  private state: CodexClientState = 'idle';
  private disposed = false;
  private restartAttempts = 0;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: CodexClientOptions) {
    this.binaryPath = options.binaryPath ?? 'codex';
    this.args = options.args ?? ['app-server'];
    this.cwd = options.cwd;
    this.env = options.env;
    this.spawnFn = options.spawn ?? defaultSpawn;
    this.logger = options.logger ?? NOOP_LOGGER;
    this.autoRestart = options.autoRestart ?? true;
    this.maxRestarts = options.maxRestarts ?? 5;
    this.baseRestartDelayMs = options.baseRestartDelayMs ?? 500;
    this.maxRestartDelayMs = options.maxRestartDelayMs ?? 10_000;
    this.initializeParams = {
      clientInfo: options.clientInfo,
      capabilities: options.capabilities ?? null,
    };
  }

  // --- lifecycle ----------------------------------------------------------

  getState(): CodexClientState {
    return this.state;
  }

  isReady(): boolean {
    return this.state === 'ready';
  }

  onStateChange(listener: CodexClientStateListener): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  /** Spawn the child and complete the JSON-RPC handshake. */
  async start(): Promise<CodexInitializeResponse> {
    if (this.disposed) {
      throw new Error('CodexClient has been disposed');
    }
    return this.launch();
  }

  private async launch(): Promise<CodexInitializeResponse> {
    this.setState('starting');
    this.spawnChild();
    const response = await this.initialize();
    this.restartAttempts = 0;
    this.setState('ready');
    return response;
  }

  private spawnChild(): void {
    this.stdoutBuffer = '';
    const child = this.spawnFn(this.binaryPath, this.args, {
      cwd: this.cwd,
      env: this.env,
    });
    this.child = child;

    child.stdout?.on('data', (chunk: Buffer | string) => {
      this.onStdoutChunk(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
    });
    child.stderr?.on('data', (chunk: Buffer | string) => {
      const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      this.logger.warn('[codex app-server stderr]', text.trimEnd());
    });
    child.on('error', (err: Error) => {
      this.logger.error('[codex app-server error]', err.message);
    });
    child.on('exit', (code, signal) => this.onChildExit(code, signal));
  }

  private onChildExit(code: number | null, signal: NodeJS.Signals | null): void {
    this.child = null;
    this.rejectAllPending(
      new Error(`codex app-server exited (code=${code ?? 'null'}, signal=${signal ?? 'null'})`)
    );

    if (this.disposed) {
      this.setState('stopped');
      return;
    }

    this.setState('crashed');

    if (!this.autoRestart || this.restartAttempts >= this.maxRestarts) {
      this.logger.error(
        `[codex app-server] not restarting (attempts=${this.restartAttempts}, max=${this.maxRestarts})`
      );
      this.setState('stopped');
      return;
    }

    const delay = Math.min(
      this.baseRestartDelayMs * 2 ** this.restartAttempts,
      this.maxRestartDelayMs
    );
    this.restartAttempts += 1;
    this.logger.warn(
      `[codex app-server] restarting in ${delay}ms (attempt ${this.restartAttempts})`
    );
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      if (this.disposed) return;
      this.launch().catch((err: unknown) => {
        this.logger.error(
          '[codex app-server] restart failed',
          err instanceof Error ? err.message : String(err)
        );
      });
    }, delay);
  }

  /** Kill the child and reject any in-flight requests. Idempotent. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    const child = this.child;
    this.child = null;
    if (child) {
      try {
        child.kill('SIGTERM');
      } catch (err: unknown) {
        this.logger.warn(
          '[codex app-server] kill failed',
          err instanceof Error ? err.message : String(err)
        );
      }
    }
    this.rejectAllPending(new Error('CodexClient disposed'));
    this.setState('stopped');
  }

  // --- transport ----------------------------------------------------------

  onNotification(listener: CodexNotificationListener): () => void {
    this.notificationListeners.add(listener);
    return () => this.notificationListeners.delete(listener);
  }

  setServerRequestHandler(handler: CodexServerRequestHandler | null): void {
    this.serverRequestHandler = handler;
  }

  /** Send a JSON-RPC request and resolve with the typed result. */
  request<TResult>(method: string, params?: unknown): Promise<TResult> {
    if (this.disposed) {
      return Promise.reject(new Error('CodexClient has been disposed'));
    }
    const id = this.nextId++;
    const promise = new Promise<TResult>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (value) => resolve(value as TResult),
        reject,
      });
    });
    try {
      this.writeMessage({ id, method, params });
    } catch (err: unknown) {
      // Surface a write failure as a rejected promise (consistent with the disposed
      // branch) and drop the now-unanswerable pending entry so it can't leak.
      this.pending.delete(id);
      return Promise.reject(err instanceof Error ? err : new Error(String(err)));
    }
    return promise;
  }

  private writeMessage(message: Record<string, unknown>): void {
    const stdin = this.child?.stdin;
    if (!stdin) {
      throw new Error('codex app-server is not running');
    }
    stdin.write(JSON.stringify(message) + '\n');
  }

  /** Write a message, swallowing failures — used for fire-and-forget responses that
   * have no promise to reject (e.g. answering a server request after the child died). */
  private safeWrite(message: Record<string, unknown>): void {
    try {
      this.writeMessage(message);
    } catch (err: unknown) {
      this.logger.warn(
        '[codex app-server] failed to send response',
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  private onStdoutChunk(chunk: string): void {
    this.stdoutBuffer += chunk;
    let newlineIndex: number;
    while ((newlineIndex = this.stdoutBuffer.indexOf('\n')) >= 0) {
      const line = this.stdoutBuffer.slice(0, newlineIndex).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);
      if (!line) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        this.logger.warn('[codex app-server] non-JSON line', line.slice(0, 200));
        continue;
      }
      if (typeof parsed !== 'object' || parsed === null) continue;
      this.handleMessage(parsed as RawMessage);
    }
  }

  private handleMessage(msg: RawMessage): void {
    const hasId = msg.id !== undefined && msg.id !== null;
    const hasMethod = typeof msg.method === 'string';

    if (hasMethod && hasId) {
      void this.handleServerRequest({
        id: msg.id as JsonRpcId,
        method: msg.method as string,
        params: msg.params,
      });
      return;
    }

    if (hasMethod) {
      this.dispatchNotification({ method: msg.method as string, params: msg.params });
      return;
    }

    if (hasId) {
      this.resolveResponse(msg);
    }
  }

  private dispatchNotification(notification: CodexNotification): void {
    for (const listener of this.notificationListeners) {
      try {
        listener(notification);
      } catch (err: unknown) {
        this.logger.error(
          '[codex app-server] notification listener threw',
          err instanceof Error ? err.message : String(err)
        );
      }
    }
  }

  private resolveResponse(msg: RawMessage): void {
    const id = msg.id as JsonRpcId;
    const pending = this.pending.get(id);
    if (!pending) {
      this.logger.warn('[codex app-server] response for unknown id', id);
      return;
    }
    this.pending.delete(id);
    if (msg.error) {
      pending.reject(new CodexRpcError(msg.error));
    } else {
      pending.resolve(msg.result);
    }
  }

  private async handleServerRequest(request: CodexServerRequest): Promise<void> {
    const handler = this.serverRequestHandler;
    if (!handler) {
      this.safeWrite({
        id: request.id,
        error: { code: -32601, message: `No handler for server request ${request.method}` },
      });
      return;
    }
    try {
      const result = await handler(request);
      this.safeWrite({ id: request.id, result: result ?? {} });
    } catch (err: unknown) {
      this.safeWrite({
        id: request.id,
        error: { code: -32000, message: err instanceof Error ? err.message : String(err) },
      });
    }
  }

  private rejectAllPending(error: Error): void {
    for (const pending of this.pending.values()) {
      pending.reject(error);
    }
    this.pending.clear();
  }

  private setState(state: CodexClientState): void {
    if (this.state === state) return;
    this.state = state;
    for (const listener of this.stateListeners) {
      try {
        listener(state);
      } catch (err: unknown) {
        this.logger.error(
          '[codex app-server] state listener threw',
          err instanceof Error ? err.message : String(err)
        );
      }
    }
  }

  // --- typed method helpers ----------------------------------------------

  initialize(params?: CodexInitializeParams): Promise<CodexInitializeResponse> {
    if (params) {
      this.initializeParams = params;
    }
    return this.request<CodexInitializeResponse>('initialize', this.initializeParams);
  }

  threadStart(params: CodexThreadStartParams): Promise<CodexThreadStartResponse> {
    return this.request<CodexThreadStartResponse>('thread/start', params);
  }

  threadResume(params: CodexThreadResumeParams): Promise<CodexThreadResumeResponse> {
    return this.request<CodexThreadResumeResponse>('thread/resume', params);
  }

  turnStart(params: CodexTurnStartParams): Promise<CodexTurnStartResponse> {
    return this.request<CodexTurnStartResponse>('turn/start', params);
  }

  turnSteer(params: CodexTurnSteerParams): Promise<CodexTurnSteerResponse> {
    return this.request<CodexTurnSteerResponse>('turn/steer', params);
  }

  turnInterrupt(params: CodexTurnInterruptParams): Promise<Record<string, never>> {
    return this.request<Record<string, never>>('turn/interrupt', params);
  }

  injectItems(params: CodexThreadInjectItemsParams): Promise<Record<string, never>> {
    return this.request<Record<string, never>>('thread/inject_items', params);
  }

  threadCompactStart(params: CodexThreadCompactStartParams): Promise<Record<string, never>> {
    return this.request<Record<string, never>>('thread/compact/start', params);
  }
}
