/**
 * codex-tool-bridge — a generic, additive host-tool bridge for the codex `app-server`
 * `dynamic_tools` mechanism.
 *
 * codex surfaces a host-injected function tool call as the server request
 * `item/tool/call` (`DynamicToolCallParams { call_id, turn_id, namespace, tool,
 * arguments }`, spike 0.A): the server asks the host to run the tool and reply with the
 * result. This module:
 *   - defines a minimal, runtime-agnostic `CodexHostTool` interface,
 *   - builds codex `dynamic_tools` registration specs from `CodexHostTool[]`,
 *   - dispatches an `item/tool/call` request to the matching tool's `execute`.
 *
 * It intentionally imports NO pi types and NONE of the real extensions — Phase 5 adapts
 * the real `MemoryExtension` / `ConfigExtension` tools onto `CodexHostTool` (or the stable
 * bundled-MCP-server fallback; dynamic_tools is experimental per the Phase 0 gate 0.C).
 *
 * NOTE: the exact wire field names for the registration spec and the response envelope are
 * validated when this is wired live in Phase 5. They are centralized here so any
 * adjustment is a single-line change.
 */

import type { CodexServerRequest } from './codex-client';

export const TOOL_CALL_METHOD = 'item/tool/call';

/** A single content element in a dynamic-tool response (text-only for now). */
export interface CodexToolContentItem {
  type: 'inputText';
  text: string;
}

/** The result envelope the host writes back for an `item/tool/call` request. */
export interface CodexDynamicToolResponse {
  contentItems: CodexToolContentItem[];
  success: boolean;
}

/** A codex `dynamic_tools` registration spec (function variant). */
export interface CodexDynamicToolSpec {
  type: 'function';
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/** The result a `CodexHostTool.execute` returns; normalized into the codex envelope. */
export interface CodexHostToolResult {
  content: string;
  isError?: boolean;
}

/**
 * A generic host-provided function tool. The real memory/config tools are adapted onto
 * this shape in Phase 5; here it is deliberately free of pi / TypeBox coupling.
 */
export interface CodexHostTool {
  name: string;
  description: string;
  /** JSON Schema for the tool arguments. */
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<CodexHostToolResult> | CodexHostToolResult;
}

export class CodexToolBridge {
  private readonly tools = new Map<string, CodexHostTool>();

  constructor(tools: readonly CodexHostTool[] = []) {
    for (const tool of tools) {
      this.tools.set(tool.name, tool);
    }
  }

  /** Register (or replace) a host tool. */
  register(tool: CodexHostTool): void {
    this.tools.set(tool.name, tool);
  }

  /**
   * Replace the entire registered tool set. Used by the runner to rebuild the bridge
   * per turn (open item (d)) so newly added / removed extension + MCP tools take effect.
   */
  setTools(tools: readonly CodexHostTool[]): void {
    this.tools.clear();
    for (const tool of tools) {
      this.tools.set(tool.name, tool);
    }
  }

  /** Whether this bridge owns the given server-request method. */
  canHandle(method: string): boolean {
    return method === TOOL_CALL_METHOD;
  }

  /** Produce codex `dynamic_tools` registration specs for all registered tools. */
  buildDynamicToolSpecs(): CodexDynamicToolSpec[] {
    return [...this.tools.values()].map((tool) => ({
      type: 'function',
      name: tool.name,
      description: tool.description,
      inputSchema: tool.parameters,
    }));
  }

  /**
   * Dispatch an `item/tool/call` server request: run the matching tool's `execute` and
   * return the codex response envelope. Unknown tools and thrown errors both resolve to a
   * `success: false` result rather than a JSON-RPC error, so the model sees the failure as
   * a tool result it can react to (mirrors pi's tool-error surfacing).
   */
  async handle(request: CodexServerRequest): Promise<CodexDynamicToolResponse> {
    const params = asRecord(request.params);
    const toolName = typeof params.tool === 'string' ? params.tool : '';
    const tool = this.tools.get(toolName);

    if (!tool) {
      return errorResult(`Unknown tool: ${toolName || '(unnamed)'}`);
    }

    const args = asRecord(params.arguments);
    try {
      const result = await tool.execute(args);
      return {
        contentItems: [{ type: 'inputText', text: result.content }],
        success: result.isError !== true,
      };
    } catch (err: unknown) {
      return errorResult(err instanceof Error ? err.message : String(err));
    }
  }
}

function errorResult(message: string): CodexDynamicToolResponse {
  return { contentItems: [{ type: 'inputText', text: message }], success: false };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}
