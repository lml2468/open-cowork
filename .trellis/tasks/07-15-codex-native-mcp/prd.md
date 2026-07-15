# PRD — Codex-native MCP servers (drop dynamic_tools proxy)

## Goal

Expose MCP servers to the agent through codex's **native `mcp_servers`** integration instead
of proxying each MCP tool as a host `dynamic_tools` entry. This removes the `mcp__` namespace
collision (codex reserves `mcp__…` and rejects `dynamic tool name is reserved: mcp__Chrome__click`)
and follows codex best practice.

## Background / evidence

- codex 0.142.5 reserves the `mcp__` dynamic-tool namespace for its own native MCP servers and
  rejects host `dynamic_tools` named `mcp__…`.
- Today `agent-runner.buildMcpCustomTools()` wraps each `mcpManager.getTools()` entry (named
  `mcp__<server>__<tool>` in `mcp-manager.ts:1520`) into an `AgentRuntimeCustomTool`, adapts it
  via `adaptPiToolsToCodexHostTools`, and registers it on the `CodexToolBridge` — the collision.
- **Confirmed feasible:** codex accepts `mcp_servers.<name>.command|args|env|url` via the same
  dotted-config override the app already uses for `model_providers.*`, so servers can be passed
  **per-thread** at `thread/start` `config` (no `config.toml` writes). Verified via
  `codex -c 'mcp_servers.demo.command=echo' mcp list` → server registered.
- App MCP config shape (`mcp-config-store.ts`): `{ type: 'stdio', command, args, env }` and
  SSE/StreamableHTTP (url). Two bundled servers use runtime-resolved path placeholders
  (`{SOFTWARE_DEV_SERVER_PATH}`, `{GUI_OPERATE_SERVER_PATH}`) + env.

## Requirements

- R1: At `thread/start` (and on runtime-signature change), translate **enabled** app MCP
  server configs into codex `mcp_servers.<name>.*` config entries (stdio command/args/env;
  streamable-http/sse url). Resolve bundled-server path placeholders + env first.
- R2: Stop registering MCP tools on the `CodexToolBridge`. Keep the app's **own** host tools
  (memory / config / spawn_subagent) as `dynamic_tools` (they don't use `mcp__`).
- R3: The trace/UI must render codex-native MCP tool calls (codex emits native `McpToolCall`
  items) — extend `CodexEventTranslator` to map them to trace steps.
- R4: Per-tool permission gating must still apply to MCP tool calls (confirm which approval
  server-request codex raises for native MCP calls; extend `CodexPermissionBridge` if needed).
- R5: No regression for the bundled Chrome DevTools / GUI Operate / Software-Dev servers.

## Open questions (resolve during design/impl)

- Q1: Does codex raise an approval server-request for native MCP tool calls under
  `approvalPolicy: on-request`, and under what method? (drives R4)
- Q2: OAuth MCP servers — the app currently owns the OAuth flow. Does codex-native require
  `codex mcp login`, and can per-thread config carry a bearer token / auth? (may be deferred:
  keep OAuth servers on the old proxy path, or gate them out initially.)
- Q3: Do codex-spawned MCP servers run with the host environment the bundled Chrome/GUI
  servers need (PATH, resourcesPath), or must we pass a fully-resolved command/env?

## Acceptance criteria

- [ ] Configuring an MCP server (e.g. Chrome DevTools) and asking the agent to use it completes
      a tool call end-to-end with **no** `mcp__… reserved` error.
- [ ] MCP tool calls appear in the trace with a sensible label.
- [ ] MCP tool calls are permission-gated (or the capability change is explicitly documented).
- [ ] The app's own memory/config/subagent tools still work (still `dynamic_tools`).
- [ ] tsc / lint / vitest green.

## Out of scope

- Rewriting the app's MCP config UI / storage.
- OAuth MCP servers if Q2 proves large — document + phase separately.
