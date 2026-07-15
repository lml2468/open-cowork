import type { TSchema } from '@sinclair/typebox';
import type { Message, Session } from '../../renderer/types';

/** A content element a custom tool returns. */
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
 * A host-provided custom tool (memory / config / spawn_subagent). Adapted into a codex host
 * `dynamic_tools` entry by `codex-runtime/codex-tool-adapter.ts`. `parameters` is a TypeBox
 * schema (`@sinclair/typebox`), which the adapter converts to plain JSON Schema for codex.
 */
export interface AgentRuntimeCustomTool {
  name: string;
  description: string;
  parameters: TSchema;
  /** Codex owns the real `call_id`; the host tool only needs the validated params. */
  execute: (params: unknown) => Promise<AgentToolResult>;
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
