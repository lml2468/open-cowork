import type { TSchema } from '@sinclair/typebox';
import type { Message, Session } from '../../renderer/types';

/** A content element a custom tool returns (structural subset of the former pi tool-result). */
export interface AgentToolResultContent {
  type: string;
  text?: string;
  [key: string]: unknown;
}

/** The result a custom tool's `execute` resolves to. */
export interface AgentToolResult {
  content: AgentToolResultContent[];
  details?: unknown;
  isError?: boolean;
}

/**
 * A host-provided custom tool. Formerly `ToolDefinition<TSchema>` from pi; now a local
 * structural type (pi removed in Phase 6). The Codex tool bridge/adapter consumes this
 * shape (`codex-runtime/codex-tool-adapter.ts`). `parameters` is a TypeBox schema
 * (`@sinclair/typebox`, an independent dep).
 */
export interface AgentRuntimeCustomTool {
  name: string;
  label?: string;
  description: string;
  parameters: TSchema;
  execute: (
    toolCallId: string,
    params: unknown,
    signal?: AbortSignal,
    onUpdate?: (update: unknown) => void,
    ctx?: unknown
  ) => Promise<AgentToolResult>;
}

export interface BeforeSessionRunContext {
  session: Session;
  prompt: string;
  existingMessages: Message[];
  isColdStart: boolean;
}

export interface BeforeSessionRunResult {
  promptPrefix?: string;
  customTools?: AgentRuntimeCustomTool[];
}

export interface AfterSessionRunContext {
  session: Session;
  prompt: string;
  messages: Message[];
}

export interface SessionDeletedContext {
  sessionId: string;
  session?: Session | null;
}

export interface AgentRuntimeExtension {
  name: string;
  beforeSessionRun?(context: BeforeSessionRunContext): Promise<BeforeSessionRunResult | void>;
  afterSessionRun?(context: AfterSessionRunContext): Promise<void>;
  onSessionDeleted?(context: SessionDeletedContext): Promise<void>;
}
