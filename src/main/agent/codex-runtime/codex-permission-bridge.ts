/**
 * codex-permission-bridge — maps codex `app-server` approval **server requests** onto the
 * app's existing permission decision logic and returns the codex decision enum.
 *
 * This cleanly replaces pi's private `agent.setBeforeToolCall` reach-in
 * (`agent-runner.ts:938-1006`): with codex, per-tool gating is a first-class protocol
 * feature — the server asks the host to approve each command / file change / permission
 * escalation before executing it (verified in the Phase 0 spike, 0.C).
 *
 * Decision mapping (verified enums, spike 0.C):
 *   app 'allow'   → codex 'accept'
 *   app 'deny'    → codex 'decline'
 *   "always allow" → codex 'acceptForSession'  (+ remembers the session-scoped rule)
 *
 * The bridge is Electron-free and fully injectable: `decide` (the `decidePermission`
 * function), `rememberAlwaysAllow`, and the `prompt` callback (the renderer permission
 * prompt for an 'ask' verdict) are all passed in, so unit tests drive it with fakes.
 */

import type { CodexServerRequest } from './codex-client';

export const COMMAND_APPROVAL_METHOD = 'item/commandExecution/requestApproval';
export const FILE_CHANGE_APPROVAL_METHOD = 'item/fileChange/requestApproval';
export const PERMISSIONS_APPROVAL_METHOD = 'item/permissions/requestApproval';

const APPROVAL_METHODS: ReadonlySet<string> = new Set([
  COMMAND_APPROVAL_METHOD,
  FILE_CHANGE_APPROVAL_METHOD,
  PERMISSIONS_APPROVAL_METHOD,
]);

/** The subset of the command/fileChange approval decision enum the app produces. */
export type CodexApprovalDecision = 'accept' | 'acceptForSession' | 'decline';

/** The JSON-RPC `result` shape the host writes back for an approval request. */
export interface CodexApprovalResponse {
  decision: CodexApprovalDecision;
}

/** A synchronous decision, mirroring `decidePermission`'s return. */
export type PermissionVerdict = 'allow' | 'deny' | 'ask';

/** The terminal decision a renderer prompt resolves an 'ask' to. */
export type PermissionPromptResult = 'allow' | 'deny' | 'always';

export interface PermissionPromptContext {
  sessionId: string;
  toolName: string;
  input: Record<string, unknown>;
  method: string;
  request: CodexServerRequest;
}

export interface CodexPermissionBridgeOptions {
  /** `decidePermission` from `permission-rules-store` (or a fake). */
  decide: (
    sessionId: string,
    toolName: string,
    input: Record<string, unknown>
  ) => PermissionVerdict;
  /**
   * Resolves an 'ask' verdict to a terminal decision — the renderer permission prompt in
   * production. If omitted, an 'ask' conservatively resolves to 'deny' (never auto-allow).
   */
  prompt?: (context: PermissionPromptContext) => Promise<PermissionPromptResult>;
  /** `rememberAlwaysAllow` from `permission-rules-store` (or a fake). */
  rememberAlwaysAllow?: (sessionId: string, toolName: string) => void;
  logger?: { warn: (...args: unknown[]) => void };
}

export class CodexPermissionBridge {
  private readonly decide: CodexPermissionBridgeOptions['decide'];
  private readonly prompt?: CodexPermissionBridgeOptions['prompt'];
  private readonly rememberAlwaysAllow?: CodexPermissionBridgeOptions['rememberAlwaysAllow'];
  private readonly logger?: CodexPermissionBridgeOptions['logger'];

  constructor(options: CodexPermissionBridgeOptions) {
    this.decide = options.decide;
    this.prompt = options.prompt;
    this.rememberAlwaysAllow = options.rememberAlwaysAllow;
    this.logger = options.logger;
  }

  /** Whether this bridge owns the given server-request method. */
  canHandle(method: string): boolean {
    return APPROVAL_METHODS.has(method);
  }

  /**
   * Resolve a codex approval server request to a decision enum. `sessionId` is resolved by
   * the caller (CodexRuntime) from the request's thread id.
   */
  async handle(request: CodexServerRequest, sessionId: string): Promise<CodexApprovalResponse> {
    const { toolName, input } = describeApprovalRequest(request);
    const verdict = this.decide(sessionId, toolName, input);

    if (verdict === 'allow') {
      return { decision: 'accept' };
    }
    if (verdict === 'deny') {
      return { decision: 'decline' };
    }

    // 'ask' — defer to the renderer prompt; conservatively deny when none is wired.
    if (!this.prompt) {
      this.logger?.warn(
        `[codex permission] no prompt handler for '${toolName}' (${request.method}); denying`
      );
      return { decision: 'decline' };
    }

    const result = await this.prompt({
      sessionId,
      toolName,
      input,
      method: request.method,
      request,
    });

    if (result === 'always') {
      this.rememberAlwaysAllow?.(sessionId, toolName);
      return { decision: 'acceptForSession' };
    }
    return { decision: result === 'allow' ? 'accept' : 'decline' };
  }
}

/**
 * Map a codex approval request to an app tool name + input for `decidePermission`.
 * Best-effort field extraction; the concrete param shapes are firmed up in Phase 5 when
 * the real approval flow is wired end to end.
 */
function describeApprovalRequest(request: CodexServerRequest): {
  toolName: string;
  input: Record<string, unknown>;
} {
  const params = asRecord(request.params);
  switch (request.method) {
    case COMMAND_APPROVAL_METHOD:
      return {
        toolName: 'bash',
        input: { command: params.command, cwd: params.cwd },
      };
    case FILE_CHANGE_APPROVAL_METHOD:
      return {
        toolName: 'edit',
        input: { changes: params.changes ?? params.fileChange ?? params.path },
      };
    case PERMISSIONS_APPROVAL_METHOD:
      return {
        toolName: typeof params.tool === 'string' ? params.tool : 'permissions',
        input: params,
      };
    default:
      return { toolName: request.method, input: params };
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}
