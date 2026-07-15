/**
 * codex-elicitation-bridge — handles codex's `mcpServer/elicitation/request` server request,
 * which fires when a native MCP server elicits user input/confirmation mid-tool-call (MCP
 * 2025-11 elicitation). Without a handler the runtime throws "Unhandled codex server
 * request" and codex treats the tool call as denied with no user interaction.
 *
 * This bridge routes the elicitation `message` to the app's existing approve/deny permission
 * UI (same round-trip the command/file approvals use) and maps the decision to the codex
 * elicitation response enum. It intentionally does NOT (yet) render `requestedSchema` as a
 * form: `accept` returns `content: null`, which satisfies confirmation-style elicitations
 * (empty/optional schema); schema-driven form input is a follow-up.
 *
 * Electron-free + injectable: `prompt` is passed in so unit tests drive it with a fake.
 *
 * Protocol (verified via `codex app-server generate-ts`):
 *   request params: `{ threadId, turnId, serverName } & ({mode:'form'|'openai/form', message,
 *     requestedSchema} | {mode:'url', message, url, elicitationId})`
 *   response: `{ action: 'accept'|'decline'|'cancel', content: JsonValue|null, _meta: JsonValue|null }`
 */

import type { CodexServerRequest } from './codex-client';

export const ELICITATION_METHOD = 'mcpServer/elicitation/request';

export type CodexElicitationAction = 'accept' | 'decline' | 'cancel';

/** The JSON-RPC `result` shape codex expects for an elicitation request. */
export interface CodexElicitationResponse {
  action: CodexElicitationAction;
  content: unknown | null;
  _meta: unknown | null;
}

export interface ElicitationPromptContext {
  sessionId: string;
  serverName: string;
  message: string;
  mode: string;
  request: CodexServerRequest;
}

export interface CodexElicitationBridgeOptions {
  /**
   * Resolve an elicitation to accept/decline — the renderer approve/deny prompt in
   * production. If omitted, elicitations conservatively decline (never auto-accept).
   */
  prompt?: (context: ElicitationPromptContext) => Promise<'accept' | 'decline'>;
  logger?: { warn: (...args: unknown[]) => void };
}

export class CodexElicitationBridge {
  private readonly prompt?: CodexElicitationBridgeOptions['prompt'];
  private readonly logger?: CodexElicitationBridgeOptions['logger'];

  constructor(options: CodexElicitationBridgeOptions) {
    this.prompt = options.prompt;
    this.logger = options.logger;
  }

  /** Whether this bridge owns the given server-request method. */
  canHandle(method: string): boolean {
    return method === ELICITATION_METHOD;
  }

  /**
   * Resolve a codex elicitation server request to an accept/decline response. `sessionId` is
   * resolved by the caller (CodexRuntime) from the request's thread id.
   */
  async handle(request: CodexServerRequest, sessionId: string): Promise<CodexElicitationResponse> {
    const { serverName, message, mode } = describeElicitation(request);

    if (!this.prompt) {
      this.logger?.warn(
        `[codex elicitation] no prompt handler for '${serverName}' (${mode}); declining`
      );
      return { action: 'decline', content: null, _meta: null };
    }

    const decision = await this.prompt({ sessionId, serverName, message, mode, request });
    return decision === 'accept'
      ? { action: 'accept', content: null, _meta: null }
      : { action: 'decline', content: null, _meta: null };
  }
}

function describeElicitation(request: CodexServerRequest): {
  serverName: string;
  message: string;
  mode: string;
} {
  const params = asRecord(request.params);
  const serverName = typeof params.serverName === 'string' ? params.serverName : 'MCP server';
  const message = typeof params.message === 'string' ? params.message : '';
  const mode = typeof params.mode === 'string' ? params.mode : 'form';
  return { serverName, message, mode };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}
