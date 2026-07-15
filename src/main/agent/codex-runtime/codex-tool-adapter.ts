/**
 * codex-tool-adapter — converts the app's host custom tools (`AgentRuntimeCustomTool` from
 * the extension system: memory / config / spawn_subagent) into the `CodexHostTool` shape the
 * `CodexToolBridge` exposes over codex `dynamic_tools`.
 *
 * Two shapes differ and this adapter reconciles them:
 *   1. parameters: a TypeBox `TSchema` (JSON-Schema-shaped, but decorated with TypeBox
 *      `Symbol` keys) → codex wants a plain JSON-Schema object.
 *   2. result: structured `content: AgentToolResultContent[]` (errors surfaced as
 *      `Error:`-prefixed text) → codex wants a flattened `{ content: string, isError? }`.
 *
 * The wrapped execute NEVER throws — a thrown execute becomes `{ isError: true }` so the
 * model sees a tool result it can react to (mirrors the bridge's own error surfacing).
 */

import type { AgentRuntimeCustomTool } from '../../extensions/agent-runtime-extension';
import type { CodexHostTool, CodexHostToolResult } from './codex-tool-bridge';

/** A single content element a host tool may return. Kept minimal + defensive for the boundary. */
interface CustomToolTextContent {
  type: 'text';
  text: string;
}

interface CustomToolNonTextContent {
  type: string;
  [key: string]: unknown;
}

type CustomToolContent = CustomToolTextContent | CustomToolNonTextContent;

/** The tool-result shape this adapter reads (`AgentToolResult`, read defensively). */
interface CustomToolResult {
  content?: CustomToolContent[];
  isError?: boolean;
  details?: unknown;
}

type CustomToolInvoke = (params: Record<string, unknown>) => Promise<CustomToolResult>;

/** Adapt a single host custom tool into a codex host tool. */
export function adaptCustomToolToCodexHostTool(tool: AgentRuntimeCustomTool): CodexHostTool {
  const invoke = tool.execute as unknown as CustomToolInvoke;

  return {
    name: tool.name,
    description: tool.description,
    parameters: toJsonSchema(tool.parameters),
    async execute(args: Record<string, unknown>): Promise<CodexHostToolResult> {
      try {
        const result = await invoke(args ?? {});
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

/** Adapt a list of host custom tools into codex host tools. */
export function adaptCustomToolsToCodexHostTools(tools: AgentRuntimeCustomTool[]): CodexHostTool[] {
  return tools.map(adaptCustomToolToCodexHostTool);
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

/** Flatten a host tool result into the codex envelope. */
function normalizeResult(result: CustomToolResult | null | undefined): CodexHostToolResult {
  if (!result || typeof result !== 'object') {
    return { content: '' };
  }
  const content = flattenContent(result.content);
  return result.isError === true ? { content, isError: true } : { content };
}

/** Flatten structured content into a single string. */
function flattenContent(content: CustomToolContent[] | undefined): string {
  if (!Array.isArray(content)) {
    return '';
  }
  return content
    .map((item) => {
      if (
        item &&
        item.type === 'text' &&
        typeof (item as CustomToolTextContent).text === 'string'
      ) {
        return (item as CustomToolTextContent).text;
      }
      // Non-text content (e.g. images) has no string form here; note its type.
      return item && typeof item.type === 'string' ? `[${item.type}]` : '';
    })
    .join('\n');
}
