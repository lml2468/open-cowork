# Agent Runtime Extensions

> Agent capabilities beyond the base codex tools are composed as
> `AgentRuntimeExtension`s and adapted into codex host `dynamic_tools` per turn.
> Directory: `src/main/extensions/`.

## Interfaces — `src/main/extensions/agent-runtime-extension.ts`

- `AgentRuntimeCustomTool`: `{ name, description, parameters, execute }`.
  - `parameters` is a **TypeBox** `TSchema` (`@sinclair/typebox`).
  - `execute(params: unknown) => Promise<AgentToolResult>` — codex owns the real
    `call_id`; the tool only receives validated params.
  - `AgentToolResult` = `{ content: AgentToolResultContent[]; details?; isError? }`.
- `AgentRuntimeExtension`: `{ name, beforeSessionRun?, afterSessionRun?, onSessionDeleted? }`.
  - `beforeSessionRun(ctx) => { promptPrefix?, customTools? }` runs before each turn.
  - `ctx` carries `session`, `prompt`, `existingMessages`, `isColdStart`.

## Manager — `agent-runtime-extension-manager.ts`

`AgentRuntimeExtensionManager`:

- `beforeSessionRun`: iterates extensions, joins all `promptPrefix`es with
  `\n\n`, and concatenates `customTools`. Tools are then **deduped by name,
  last-wins** (`mergeCustomTools`, logs a warning on collision).
- `afterSessionRun` / `onSessionDeleted`: run via `Promise.allSettled`.
- Every hook is wrapped in try/catch **per extension** — one failing extension
  never breaks the turn (errors are logged).

## Concrete extensions

| Extension           | File                                   | `name`     | Provides                                                                                                                                                                                      |
| ------------------- | -------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MemoryExtension`   | `src/main/memory/memory-extension.ts`  | `memory`   | `beforeSessionRun` returns **only** a `promptPrefix` (`buildPromptPrefix`), gated on `memoryService.isEnabled() && session.memoryEnabled`. **No tools.**                                      |
| `ConfigExtension`   | `src/main/config/config-extension.ts`  | `config`   | Tools `config_read` (reads keys in the `SAFE_TOP_LEVEL_KEYS` allowlist) and `config_write` (blocked by `SENSITIVE_KEY_PATTERN`, allowed by `WRITABLE_KEYS`, validated by `FIELD_VALIDATORS`). |
| `SubagentExtension` | `src/main/agent/subagent-extension.ts` | `subagent` | Tool `spawn_subagent`, which runs child turns on a **dedicated** `CodexClient` (its own app-server child). `MAX_CONCURRENT_SUBAGENTS = 3`.                                                    |

## Adaptation to codex host tools (per turn)

In `CoworkAgentRunner.run` (`src/main/agent/agent-runner.ts`):

1. `beforeSessionRun` is awaited (~L1716) → merged `promptPrefix` + `customTools`.
2. `customTools` → `adaptCustomToolsToCodexHostTools(...)`
   (`codex-runtime/codex-tool-adapter.ts`): converts the TypeBox schema to plain
   JSON Schema and wraps `execute` so it **never throws** — a thrown execute
   becomes `{ isError: true }`.
3. `codexToolBridge.setTools(...)` is rebuilt **every turn** (~L2013).
4. `CodexToolBridge.buildDynamicToolSpecs()` is consumed at **`thread/start`**
   only (see `agent-runtime.md`).

MCP tools are **not** proxied through this path — codex connects to MCP servers
natively.

## CRITICAL: the extension list is built TWICE

`src/main/index.ts` constructs an `AgentRuntimeExtensionManager` in **two**
places:

- GUI path (~L1353)
- headless path (~L929)

A new extension **must be added to both lists** or it silently won't apply in
one of the modes.

## config_write enforcement is two-layered

1. `decidePermission` (`config/permission-rules-store.ts`) defaults any tool with
   no explicit rule to `ask` — `config_write` has none, so it always prompts.
2. `SUBAGENT_ALWAYS_DENIED_TOOLS` (`src/main/index.ts` ~L165) **hard-denies**
   `config_write` for subagents.

The `permission: 'always-ask'` marker on the tool definition is documentation of
intent — the runtime does **not** enforce from it. Enforcement is the two layers
above.

## Anti-patterns

- Adding an extension to only one of the two `AgentRuntimeExtensionManager`
  lists.
- Relying on the tool's `permission` marker for enforcement.
- Expecting host tools to be available on a **resumed** thread (they register at
  `thread/start` only).
- Letting a custom tool's `execute` throw instead of returning `isError` — the
  adapter shields it, but returning a clear error result is the intended shape.
