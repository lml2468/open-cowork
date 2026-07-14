# Design: Codex-backed Agent Runtime

Target design for replacing the pi runtime with an OpenAI Codex-driven backend. Grounded
in the coupling map (`prd.md` → Background) and `research/codex-integration-surface.md`.

## Architecture & boundaries

- **Embedding model:** the Electron **main process spawns one long-lived
  `codex app-server`** child (JSON-RPC v2 over stdio). Chosen over `codex exec` because
  per-tool approval and `dynamic_tools` injection require app-server. Binary shipped via
  the `@openai/codex-{darwin,win32,linux}-{x64,arm64}` npm packages, bundled per platform
  (mirror the existing per-platform resource prep in the build; see the build-and-test
  guide + `vite.config.ts` externalization).
- **New module:** `src/main/agent/codex-runtime/` — a `CodexClient` (JSON-RPC transport +
  lifecycle) and a `CodexRuntime` that occupies the role pi plays inside
  `CoworkAgentRunner` today. `CoworkAgentRunner` keeps its runtime-agnostic
  responsibilities (prompt assembly, skills/path resolution, sandbox, loop guard,
  timeouts, artifact parsing, the `send*` emitters) and calls `CodexRuntime` at the three
  seams below.
- **Unchanged boundaries (reuse as-is):** the renderer `ServerEvent`/`TraceStep`/`Message`
  contract; `SessionManager` + SQLite history; `AgentRuntimeExtensionManager` lifecycle;
  `permission-rules-store` decision logic; MCP call/normalize logic; the cold-start
  `<conversation_history>` preamble (`agent-runner.ts:1829-1927`).

## The three seams, re-implemented

### Seam 1 — session lifecycle (`agent-runner.ts` ~2140–3030 + `subagent-extension.ts`)

| pi (today)                                                                                              | Codex (target)                                                                                                                     |
| ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `createAgentSession({model, tools, customTools, sessionManager, settingsManager, resourceLoader, cwd})` | `CodexClient` JSON-RPC `thread/start` with `cwd`, model/provider config, `dynamicTools`, MCP servers, `danger-full-access` sandbox |
| `piSession.prompt(contextualPrompt)` (one call per turn)                                                | `thread/sendMessage` (or turn RPC); await turn completion                                                                          |
| `piSession.subscribe(cb)`                                                                               | subscribe to app-server notifications (`item.*`, `command_execution`, `mcp_tool_call`, `reasoning`, turn lifecycle)                |
| `setModel` / `setThinkingLevel` hot-swap                                                                | per-turn model/effort in the turn request, or `thread` reconfig                                                                    |
| `session.dispose()`                                                                                     | `thread` close; keep the app-server process warm, dispose per-session threads                                                      |

Subagents (`SubagentExtension`, its own pi child loop at `subagent-extension.ts:252-370`)
become **child Codex threads** on the same app-server, with the same event→emitter
translation.

### Seam 2 — model/provider resolution (`pi-model-resolution.ts`, 371 LOC → deleted)

Replace pi `Model<Api>` construction with **codex `model_providers` config** (`base_url`,
`wire_api: chat|responses`, `env_key`). Per D4 only OpenAI-wire providers exist:

- OpenAI (first-class), OpenAI-compatible custom base URLs, OpenRouter, Azure, and
  Ollama via its OpenAI-compatible endpoint.
- New `src/main/agent/codex-model-config.ts` maps the app's config-store fields → codex
  provider/model config + auth (API key via `env_key`; ChatGPT login optional later).
- `applyPiModelRuntimeOverrides` (pi `compat` flags) is dropped; codex handles wire
  differences. Ollama `num_ctx` (was the private `_onPayload` patch) moves to codex
  provider config / model params.

### Seam 3 — event translation (the cleanest cut line, `agent-runner.ts:2577-2955`)

The translator function stays; only its **input event source** changes from pi events to
codex app-server JSON-RPC notifications. Output emitters are unchanged
(`sendPartial`, `sendToRenderer`, `sendTraceStep`, `sendMessage`). Mapping:

| Codex app-server event                          | app emitter / `ServerEvent`                 |
| ----------------------------------------------- | ------------------------------------------- |
| assistant text delta (`item.*` / message delta) | `sendPartial` → `stream.partial`            |
| `reasoning` delta                               | `stream.thinking`                           |
| `command_execution` / `mcp_tool_call` begin     | `sendTraceStep` → `trace.step`              |
| tool begin/end + result                         | `trace.update` + tool_result `Message`      |
| turn end / final message                        | assemble final `Message` (`ContentBlock[]`) |
| codex compaction event (if exposed)             | `trace.step` + `compaction.result`          |

`agent-runner-message-end.ts` is rewritten to assemble the final `Message` from codex's
final-item payload instead of pi's `AssistantMessage`/`ToolCall` types.

## Extensions, tools, permissions

- **Custom tools:** `AgentRuntimeCustomTool` is retargeted from pi `ToolDefinition<TSchema>`
  to a codex **`dynamic_tools`** descriptor (host-injected function tools over app-server;
  experimental → pin version) — or, as the stable fallback, a **bundled MCP server** that
  fronts the Memory/Config tools. `MemoryExtension` / `ConfigExtension` re-express their
  TypeBox-schema tools + `execute(...)` in the chosen mechanism. The
  `AgentRuntimeExtension` lifecycle interface itself is unchanged.
- **Permissions:** the app answers app-server approval requests
  (`CommandExecutionApprovalDecision` / `FileChangeApprovalDecision`, MCP
  `elicitation/create`) by calling the existing `decidePermission` / `rememberAlwaysAllow`
  from `permission-rules-store`. This removes the fragile `agent.setBeforeToolCall`
  private reach-in.
- **Built-in tools & sandbox:** Codex supplies its own shell/apply_patch tools; the
  sudo/timeout/Windows wrappers around `createCodingTools` are dropped or re-targeted. The
  app sets codex `danger-full-access` and relies on its existing **Lima/WSL VM** for
  isolation (documented codex pattern). Path guards stay.
- **Loop-guard steering:** the pi `sendUserMessage(...,{deliverAs:'steer'})` reach-in →
  codex mid-turn user-message injection if available, else documented as a capability
  change (the loop guard still detects; the steering delivery mechanism may differ).

## Capability map (verdict + evidence)

| Capability                                                    | Verdict     | Notes                                                  |
| ------------------------------------------------------------- | ----------- | ------------------------------------------------------ |
| Streaming text/thinking traces                                | keep        | Seam 3; codex streams deltas + reasoning               |
| Per-tool permission gating                                    | keep        | app-server approval events → `permission-rules-store`  |
| MCP tools                                                     | keep        | codex MCP client (`mcp_servers` TOML)                  |
| Custom app tools (memory/config)                              | changed     | via `dynamic_tools` (exp.) or bundled MCP server       |
| Subagents                                                     | changed     | child codex threads instead of nested pi loop          |
| VM sandbox (Lima/WSL)                                         | keep        | `danger-full-access` + delegate to app VM              |
| Skills                                                        | keep        | prompt/resource assembly is runtime-agnostic           |
| Memory / schedule / remote control / headless RPC             | keep        | above the runtime seam; unaffected                     |
| Conversation history                                          | keep        | cold-start `<conversation_history>` preamble reused    |
| Compaction                                                    | changed     | codex-native compaction; re-map to `compaction.result` |
| **Anthropic / Gemini providers**                              | **dropped** | D4 — OpenAI-wire only                                  |
| OpenAI + Responses-API endpoints only                         | keep        | `wire_api="responses"` (D4a; Phase 0 finding)          |
| Chat-completions-only gateways (OpenRouter/Ollama/Azure-chat) | **dropped** | codex 0.142 dropped `wire_api="chat"` (D4a)            |

## Compatibility & migration notes (D4 regression)

- `ProviderType` (`config-store.ts:41`) loses `anthropic` / `gemini`; `pi-model-resolution`
  is removed. Config UI (renderer settings/API) drops those providers.
- Existing users configured on Anthropic/Gemini must be migrated: on load, detect a
  now-unsupported provider and surface a `ServerEvent`-driven notice directing them to an
  OpenAI-compatible config; do not silently break sessions.
- Encrypted API keys for removed providers are left in place but unused (no destructive
  key deletion).

## Trade-offs & risks

- **Provider regression** (accepted, D4): removes a headline feature; the biggest product
  cost.
- **Experimental surface:** `dynamic_tools` + parts of app-server are experimental — pin a
  codex version, target protocol v2, and prefer the MCP-server fallback for custom tools if
  stability bites.
- **No fallback (D3 hard cut-over):** a capability that fails in Phase 0 stops the cut-over;
  mitigated by the Phase 0 gate (`implement.md`).
- **Process management:** a long-lived native child adds lifecycle/error-recovery burden
  (crash restart, zombie cleanup) the in-process pi loop didn't have.
- **Binary size / packaging:** per-platform codex binaries added to the bundle.

## Operational & rollback

- All work lands on a feature branch; hard cut-over means rollback = revert the branch /
  do not merge. The Phase 0 gate ensures pi is removed only after parity is demonstrated,
  so `main` never carries a half-migrated runtime.
- Health: supervise the app-server child (restart on crash), and gate agent runs on both
  `hasUsableCredentialsForActiveSet` and app-server readiness.
