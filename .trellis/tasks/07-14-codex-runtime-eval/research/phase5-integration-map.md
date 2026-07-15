# Phase 5 Integration Map & Sub-step Plan

Wiring `codex-runtime/` into the app to replace pi. Anchors from the codebase analysis;
line numbers are as of Phase 5 start (`agent-runner.ts` is 3238 lines).

## Emitter mapping (CodexRuntimeEmitters → existing producers)

Reuse the existing private helpers in `agent-runner.ts` (1:1 signatures):
`sendPartial` (3235-3237), `sendTraceStep` (3216-3219), `sendTraceUpdate` (3221-3224),
`sendMessage` (3226-3233 — **also persists via `saveMessage`; must keep that side effect**),
`sendToRenderer` (injected, L892). Three adapter closures needed:

- `onTokenUsage` → `session.contextInfo` (window, L1674-1680) + attach `tokenUsage` to the
  message (`normalizeTokenUsage`, L498-520).
- `onCompaction({sessionId,turnId})` → `compaction.result`. **Open item (a):** pi's payload
  has summary/tokensBefore/read+modified files; codex owns summarization. **Decision:** emit
  a reduced `compaction.result` (turnId + isManual; summary/files omitted or best-effort).
- `onError` → terminal assistant `Message` + `trace.update status:'error'` (pattern at
  L2943-3002 etc.).

## Permission prompt path

Replace the pi private hook `installPermissionHook` (925-1013, reaches `agent.setBeforeToolCall`)
with `CodexPermissionBridge`. Wire `prompt: (ctx) => requestPermission(ctx.sessionId,
newToolUseId, ctx.toolName, ctx.input)` (SessionManager round-trip: `session-manager.ts:1255-1276`,
response via `handlePermissionResponse` :1246-1252, 60s timeout→deny). **Enum adapter:**
`'allow_always'` → `'always'`. `decide: decidePermission`, `rememberAlwaysAllow` injected.
**Open item (b):** `wrapBashToolForSudo`/`requestSudoPassword` has no codex equivalent — sudo
folds into command approval. **Decision:** accept as a documented capability change.

## Tool adaptation (pi ToolDefinition → CodexHostTool)

Collected in `run()` via `extensionManager.beforeSessionRun` (1857-1864) + MCP
(`buildMcpCustomTools`, merged L2140-2144). `AgentRuntimeCustomTool = ToolDefinition<TSchema>`
(`extensions/agent-runtime-extension.ts:5`). Adapt to `CodexHostTool`
(`codex-tool-bridge.ts:57-65`): TypeBox schema → JSON schema (cast; verify), and wrap
`execute(toolCallId, params, …)` → `execute(args) => {content, isError?}`. `spawn_subagent`
(`subagent-extension.ts:96-128`) → `runCodexSubagent`. **Open item (d):** rebuild the tool
set per turn (matches pi's per-`run()` rebuild) → construct/refresh `CodexToolBridge` per turn.

## Session lifecycle

`CodexRuntime.runTurn` replaces `piSession.prompt` (L2974) + the whole `subscribe` bridge
(2372-2933). Cancel→`interrupt` (cancel L3211-3214), steer (L2430-2431)→`steer`,
`compact()` (3143-3186)→`compact`. `piSessions` map + signature-invalidation (1833-1855)
→ CodexRuntime's `sessionToThread` + `disposeSession` (cwd change). Model/cwd resolution
(1591-1671, pi-specific) → `buildCodexModelConfig` + `CodexRunTurnOptions`. **Open item (c):**
cold-start `<conversation_history>` preamble (1866-1927) — codex threads persist server-side,
so **decision:** seed a NEW thread with the preamble (as first-turn `developerInstructions`/
input); skip within a warm thread.

## One-shot call sites

- Title: `session-manager.ts:858` (`generateTitleWithSdk`) → `generateTitleWithCodex`.
- API test: `config/config-test-routing.ts:9` (`probeWithSdk`, via `config.test` IPC
  `index.ts:2051`) → `testCodexConnectivity`. (Ollama has its own probe — dropped by D4a.)
- Memory LLM: `memory/memory-llm-client.ts:100` (`runPiAiOneShot`) → `runCodexOneShot`.
- All need a shared `CodexOneShotDeps` (a codex client handle).

## Provider regression (D4/D4a)

Drop `anthropic`/`gemini` + chat-only gateways. Ordered edits:

1. `config-store.ts:41-52` (`ProviderType`, `CustomProtocolType`, `ProviderProfileKey`) + `PROFILE_KEYS` (356-364).
2. `shared/api-model-presets.ts:2-25,33+` (preset entries + unions; `PI_AI_CURATED_PRESETS`).
3. `SettingsAPI.tsx:131` (picker array) + 174-188 (custom-protocol options).
4. `useApiConfigState.ts:72-139` (union/validators/profile-keys) + 283-304 (migration defaults).
5. **Migration notice** (net-new): on load, coerce persisted `anthropic`/`gemini`/`custom:gemini`
   → supported default + one-time banner near `SettingsAPI.tsx:123-143`.

## Both extension managers

GUI `index.ts:1341-1350` + headless `index.ts:924-933` build the same trio — the tool
adapter + runtime wiring must apply to both (keep in sync; see spec/main runtime-extensions).

## Ordered sub-steps (each: implement → trellis-check → commit)

- **5.1 Tool adapter** — `AgentRuntimeCustomTool` → `CodexHostTool` adapter module + tests
  (additive; no wire-in yet).
- **5.2 Runner wire-in** — construct CodexClient/Runtime/bridges in `CoworkAgentRunner`;
  emitters + permission prompt + runTurn replace pi; cancel/steer/compact. (BREAKING)
- **5.3 One-shot repoint** — title/API-test/memory-LLM call sites → codex analogues + shared client.
- **5.4 Provider regression** — config-store/presets/UI + migration notice.
- **5.5 Headless** — mirror wiring for the headless manager + auto-permission sender.
- **5.6 e2e** — real run against live codex (streaming, a tool + permission prompt, subagent,
  title-gen, an OpenAI/Responses provider); light+dark; then Phase 6 (remove pi).

**Open-item decisions:** (a) reduced `compaction.result`; (b) sudo → command approval
(documented change); (c) preamble seeds new threads only; (d) per-turn tool bridge;
(e) `describeApprovalRequest` param shapes validated during 5.6 e2e.

## Follow-ups discovered mid-implementation

- **(f) Env-freshness for long-lived codex clients [medium — from 5.3 check].** Both the
  per-runner `CodexClient` (`agent-runner.ts`) and the shared one-shot client
  (`codex-shared-client.ts`) are spawned without an `env` option, so the child inherits
  `process.env` at spawn; `applyCodexModelEnv` mutates the _parent_ env, which a POSIX child
  can't see afterward. Impact: a **config API-test of a freshly-typed key** run after the
  shared server is already warm validates the STALE key. Fix options (defer to 5.4/5.6 or a
  dedicated follow-up): respawn/dispose the shared client on credential change, OR use an
  ephemeral client for the API-test path, OR pass auth per-request instead of ambient env.
- **(g) Runner/shared-client consolidation [low].** Process currently runs two codex
  app-servers (per-runner + shared one-shot) to avoid dispose-ownership ambiguity. Optional
  later consolidation onto one warm app-server.
- **(h) Provider auto-coercion + migration notice [medium — descoped from 5.4].** 5.4 landed
  as **UI-picker narrowing only** (`SettingsAPI` + `ConfigModal` show only `openai`/`custom`;
  custom protocol = `openai`/Responses). The type unions were deliberately **kept broad**
  (narrowing them cascades across ~60 sites and repeatedly stalled sub-agents). Existing
  users persisted on a dropped provider (anthropic/gemini/openrouter/ollama) are handled by
  the runtime **failing closed** (`buildCodexModelConfig` → clear "unsupported provider"
  error), not a crash. Still TODO: auto-coerce a persisted dropped provider → `openai` on
  load + a one-time notice (i18n en+zh), and a Phase-6 clean removal of the dead union
  members once pi is gone.
