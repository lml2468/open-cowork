/**
 * codex-tool-adapter — the pi↔codex tool boundary.
 *
 * Converts the app's pi-shaped custom tools (`AgentRuntimeCustomTool =
 * ToolDefinition<TSchema, unknown>`) into the runtime-agnostic `CodexHostTool` shape the
 * (already-built) `CodexToolBridge` exposes over codex `dynamic_tools`. This is the ONE
 * module allowed to reference the pi tool type — everything downstream sees only
 * `CodexHostTool`.
 *
 * The two shapes differ in three ways this adapter reconciles:
 *   1. parameters: pi carries a TypeBox `TSchema` (JSON-Schema-shaped, but decorated with
 *      TypeBox `Symbol` keys) → codex wants a plain JSON-Schema object.
 *   2. execute signature: pi is
 *      `execute(toolCallId, params, signal?, onUpdate?, ctx?) => Promise<AgentToolResult>`
 *      → codex is `execute(args) => Promise<CodexHostToolResult>`.
 *   3. result: pi returns structured `content: (TextContent | ImageContent)[]` (no error
 *      flag; errors are conventionally surfaced as `Error:`-prefixed text) → codex wants a
 *      flattened `{ content: string, isError?: boolean }`.
 *
 * The wrapped execute NEVER throws — a thrown pi execute becomes `{ isError: true }` so the
 * model sees a tool result it can react to (mirrors the bridge's own error surfacing).
 */

import type { AgentRuntimeCustomTool } from '../../extensions/agent-runtime-extension';
import type { CodexHostTool, CodexHostToolResult } from './codex-tool-bridge';

/** A single content element a pi tool may return. Kept minimal + defensive for the boundary. */
interface PiTextContent {
  type: 'text';
  text: string;
}

interface PiNonTextContent {
  type: string;
  [key: string]: unknown;
}

type PiToolContent = PiTextContent | PiNonTextContent;

/**
 * The pi tool result shape this adapter reads. Pi's `AgentToolResult` has `content` +
 * `details`; `isError` is not part of the pi type but is read defensively in case a tool
 * (or the codex side) sets it.
 */
interface PiToolResult {
  content?: PiToolContent[];
  isError?: boolean;
  details?: unknown;
}

/**
 * The narrowed pi execute signature the adapter actually invokes. The app's custom tools
 * never use `signal` / `onUpdate` / `ctx`, so we call with just `(toolCallId, params)`.
 * A structural cast (below) bridges from the full 5-arg pi signature to this 2-arg one.
 */
type PiToolInvoke = (toolCallId: string, params: Record<string, unknown>) => Promise<PiToolResult>;

let syntheticCallCounter = 0;

/** Adapt a single pi custom tool into a codex host tool. */
export function adaptPiToolToCodexHostTool(tool: AgentRuntimeCustomTool): CodexHostTool {
  // The full pi execute takes `(toolCallId, params, signal, onUpdate, ctx)` but the app's
  // tools only read the first two. Isolate the boundary narrowing to this typed alias
  // rather than leaking `any` through the module.
  const invoke = tool.execute as unknown as PiToolInvoke;

  return {
    name: tool.name,
    description: tool.description,
    parameters: toJsonSchema(tool.parameters),
    async execute(args: Record<string, unknown>): Promise<CodexHostToolResult> {
      const toolCallId = `codex-adapter-${++syntheticCallCounter}`;
      try {
        const result = await invoke(toolCallId, args ?? {});
        return normalizeResult(result);
      } catch (err: unknown) {
        return {
          content: err instanceof Error ? err.message : String(err),
          isError: true,
        };
      }
    },
  };
}

/** Adapt a list of pi custom tools into codex host tools. */
export function adaptPiToolsToCodexHostTools(tools: AgentRuntimeCustomTool[]): CodexHostTool[] {
  return tools.map(adaptPiToolToCodexHostTool);
}

/**
 * Convert a TypeBox `TSchema` into a plain JSON-Schema object. TypeBox schemas are
 * JSON-Schema-shaped plain objects decorated with non-enumerable `Symbol` keys; a JSON
 * round-trip performs a structural deep clone that drops the symbols (and any functions),
 * yielding a clean JSON-Schema object without a bare `any` cast.
 */
function toJsonSchema(schema: unknown): Record<string, unknown> {
  if (!schema || typeof schema !== 'object') {
    return {};
  }
  try {
    const cloned: unknown = JSON.parse(JSON.stringify(schema));
    return cloned && typeof cloned === 'object' ? (cloned as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Flatten a pi tool result into the codex envelope. */
function normalizeResult(result: PiToolResult | null | undefined): CodexHostToolResult {
  if (!result || typeof result !== 'object') {
    return { content: '' };
  }
  const content = flattenContent(result.content);
  return result.isError === true ? { content, isError: true } : { content };
}

/** Flatten pi structured content into a single string. */
function flattenContent(content: PiToolContent[] | undefined): string {
  if (!Array.isArray(content)) {
    return '';
  }
  return content
    .map((item) => {
      if (item && item.type === 'text' && typeof (item as PiTextContent).text === 'string') {
        return (item as PiTextContent).text;
      }
      // Non-text content (e.g. images) has no string form here; note its type.
      return item && typeof item.type === 'string' ? `[${item.type}]` : '';
    })
    .join('\n');
}
