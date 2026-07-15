# Design — Codex-native MCP servers

## Approach (confirmed feasible)

codex accepts `mcp_servers.<id>.command|args|env|url` via the same dotted-config override
the app already uses for `model_providers.*`, and that config rides `thread/start` — so MCP
servers are registered with codex **per-thread**, no `config.toml` writes. codex then owns
the `mcp__<server>__<tool>` namespace natively (no dynamic-tool collision).

## Phase 1 (this change) — core wiring

- New pure module `codex-runtime/codex-mcp-config.ts`: `buildCodexMcpServersConfig(servers)`
  → flattened `mcp_servers.*` string overrides (stdio command/args(JSON)/cwd/env; http url +
  headers). Unit-tested.
- `agent-runner`: compute `mcpServersConfig` from `mcpConfigStore.getEnabledServers()`, merge
  into the `config` passed at `thread/start` (`{ ...modelConfig.configOverrides,
...mcpServersConfig }`), and add the server-set to the runtime signature so the thread
  re-creates when servers change.
- **Removed** the app-side MCP `dynamic_tools` proxy (`buildMcpCustomTools` +
  `normalizeMcpToolResultForModel` + typebox `Type` in that path). The app's own host tools
  (memory/config/subagent) still go through `dynamic_tools` (they don't use `mcp__`).

## Known follow-ups (Phase 2 — need a live codex run to resolve)

- **Double-spawn**: `mcp-manager` still connects enabled servers itself (for the MCP status
  UI / OAuth), and codex now also spawns them. Functionally independent (works), but wasteful.
  Cleanly transferring ownership (stop mcp-manager spawning codex-owned servers; drive the
  status UI from codex MCP events) is Phase 2.
- **Q1 permission**: verify codex raises an approval server-request for native MCP tool calls
  under `approvalPolicy: on-request`; extend `CodexPermissionBridge` for that method if needed.
- **Q3 spawn env**: codex spawns MCP servers with codex's env — confirm the bundled Chrome/
  GUI servers (npx/node) resolve PATH/NODE_PATH/resourcesPath; if not, pass a fully-resolved
  command/env in `buildCodexMcpServersConfig` (reuse mcp-manager's env resolution).
- **Trace**: render codex-native `McpToolCall` events in `CodexEventTranslator` (currently
  MCP tool calls may not surface as trace steps).
- **OAuth** MCP servers: codex uses `codex mcp login`; the app's OAuth flow needs bridging or
  those servers stay on a separate path.

## Verification

- Phase 1: tsc / lint / vitest green; `codex-mcp-config` unit tests.
- Phase 2 gate: live run — enable Chrome DevTools MCP against a Responses gateway, confirm a
  tool call completes with no `mcp__… reserved` error, gated, and shown in the trace.
