# MCP Guidelines (`src/main/mcp/`)

> MCP servers are managed with the official `@modelcontextprotocol/sdk`. Crucially, tools
> are registered with **codex natively** (not proxied as host dynamic_tools) — codex spawns
> the servers itself, so specs must be fully resolved and emitted as native JSON.

---

## MCPManager and transports

When it applies: connecting to / managing an MCP server.

`MCPManager` (`mcp-manager.ts:223`) supports three transports discriminated by config
`type` (`'stdio' | 'sse' | 'streamable-http'`, `:41`):
`StdioClientTransport` / `SSEClientTransport` / `StreamableHTTPClientTransport`
(`:15-17`).

Lifecycle: `initializeServers(configs)` (`:526`, fingerprint-guarded — skips if
`JSON.stringify` fingerprint matches `lastConfigFingerprint`, `:534-549`), `connectServer`,
`updateServer` (`:591`), `removeServer` (`:643`), `disconnectServer`, `disconnectAll`,
`shutdown`. list/call operations run under a timeout (`withTimeout`, `:144`).

Stdio servers are spawned via the **bundled node** returned by `getBundledNodePath()`
(`:247`), resolving `resources/node/<platform>-<arch>` — the app cannot rely on a system
node being present.

---

## Config store and presets

`mcp-config-store.ts` exposes singleton `mcpConfigStore` (electron-store backed by
`mcp-config.json`) and `MCP_SERVER_PRESETS` (`:13`) — currently `chrome`, `notion`,
`software-development`, `gui-operate`. `getEnabledServers()` feeds the codex config path.
OAuth for remote servers is handled by `mcp-oauth.ts` (loopback redirect,
`OAuthClientProvider`).

---

## Bundled example servers

Two example servers ship in-repo and run as **separate stdio processes**, each constructing
its own `Server` + `StdioServerTransport`:

- `software-dev-server-example.ts` (`new Server` at `:2387`, `StdioServerTransport` at `:3309`).
- `gui-operate-server.ts` (`new Server` at `:6058`, transport at `:6825`).

They are servers, not part of the manager's client code.

---

## Codex-native registration (IMPORTANT)

When it applies: making MCP tools available to the agent.

MCP tools are NOT proxied to codex as host `dynamic_tools`. Instead:

1. `MCPManager.resolveCodexServerSpecs(servers)` (`mcp-manager.ts:741`) fully resolves each
   server spec — absolute `command`, bundled-node substitution, arg placeholder expansion,
   env allowlist — because **codex spawns the servers itself** and lacks the app's PATH.
2. `buildCodexMcpServersConfig(servers)` (`agent/codex-runtime/codex-mcp-config.ts:71`)
   flattens specs into `mcp_servers.<id>.*` config-override entries. Values are the codex
   `thread/start` config map's **native JSON** types: `args` is a native string array (NOT a
   TOML string), `command`/`cwd`/`url` are strings, env/headers are emitted per-key as
   `mcp_servers.<id>.env.<KEY>`.
3. Wired in `agent/agent-runner.ts:1539-1540`
   (`buildCodexMcpServersConfig(await resolveCodexServerSpecs(mcpConfigStore.getEnabledServers()))`)
   and included in the codex runtime signature.

`getTools`/`callTool` still exist, but only for **UI listing**. UI tool names are
`mcp__<server>__<tool>` (`mcp-manager.ts:1606`) with a deterministic sort (`:1587`).

---

## Anti-patterns

- Proxying MCP tools as codex `dynamic_tools` — the `mcp__` prefix is reserved and collides:
  "dynamic tool name is reserved: mcp\_\_…". Register natively via `mcp_servers.*`.
- Emitting config as TOML strings — codex expects native JSON (array args, string scalars).
- Relying on the shell PATH for codex-spawned servers — always resolve absolute paths and
  the bundled node in `resolveCodexServerSpecs`.
