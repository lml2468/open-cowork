# PRD: Migrate Agent Runtime from pi to Codex

## Goal

Replace Open Cowork's in-process agent runtime (the `@mariozechner/pi-coding-agent` /
`pi-ai` SDK) with an implementation driven by the **OpenAI Codex CLI/agent**
(github.com/openai/codex), embedded as a long-lived backend process. Deliverable of this
task is the migration plan: this `prd.md`, `design.md` (target architecture + capability
map), and `implement.md` (phased execution plan).

## Decisions (confirmed with user)

- **D1 — Meaning:** "基于 codex" = drive the OpenAI Codex CLI/agent as the backend loop;
  Codex owns the turn loop. (Not: OpenAI Responses API; not "just OpenAI models"; not a
  2nd pluggable runtime.)
- **D2 — Depth:** Full migration plan now (not analysis-only, not a spike-only task).
- **D3 — Strategy:** **Hard cut-over** — remove pi outright; no parallel runtime
  retained. Because there is no fallback, the Phase 0 capability spike is a hard go/no-go
  gate (see R4/AC3).
- **D4 — Providers:** **OpenAI-compatible only.** Accept OpenAI + any OpenAI-compatible
  base URL (OpenRouter, Azure, Ollama-via-OpenAI-compat, custom endpoints). **Drop native
  Anthropic + Gemini** support. No wire-translation shim is built.

## Background — current runtime (from code)

- The agent loop is the pi SDK; this repo orchestrates it (does not implement the loop).
  `SessionManager` (`src/main/session/session-manager.ts`) owns session CRUD + history
  (SQLite) and drives `CoworkAgentRunner` (`src/main/agent/agent-runner.ts:555`), which
  wraps pi.
- Capabilities are `AgentRuntimeExtension`s (`src/main/extensions/`) registered in **two**
  managers (GUI `index.ts:1341`, headless `index.ts:924`): `MemoryExtension`,
  `ConfigExtension`, `SubagentExtension`, compaction.
- Provider/model routing + auth: `src/main/config/config-store.ts` (`applyToEnv`,
  `hasUsableCredentialsForActiveSet`, `ProviderType` at `:41`) and
  `src/main/agent/pi-model-resolution.ts`. Today: Anthropic, OpenAI, Gemini, OpenAI-compatible.
- Streaming output + tool traces reach the renderer as `ServerEvent`s over the typed IPC
  contract (`src/renderer/types/index.ts`).
- Subsystems on the loop: MCP tools, Skills, sandbox (Lima/WSL VM + path guards), remote
  control (Feishu/Slack), memory, schedule, permissions, headless RPC.

### Coupling map (anchors for design.md)

pi coupling is heavy but **contained in the runtime layer** — it does not leak into the
renderer, DB model, extension lifecycle, or permission/MCP decision logic.

- ~2,500–3,000 pi-specific LOC across ~7–8 files; 11 source files import pi directly.
- **Three cut seams:** (1) `createAgentSession` → `prompt()` → `subscribe()` lifecycle in
  `agent-runner.ts` (~lines 2140–3030) + the mirror child loop in `subagent-extension.ts`;
  (2) `Model<Api>` resolution in `pi-model-resolution.ts` (371 LOC, entirely pi-shaped);
  (3) the pi-event→`ServerEvent` translator (`subscribe` callback,
  `agent-runner.ts:2577-2955`) — the cleanest cut line.
- **Highest-risk coupling — pi private-API reach-ins:** `agent.setBeforeToolCall` /
  `_beforeToolCall` (permissions, `:938-1006`), `agent._onPayload` (Ollama num_ctx,
  `:2336`), `session.sendUserMessage(...,{deliverAs:'steer'})` (loop-guard, `:2431`).
- **Runtime-agnostic (reuse as-is):** renderer `ServerEvent`/`TraceStep`/`Message`
  contract; `AgentRuntimeExtension` lifecycle (only the tool _type_ alias
  `AgentRuntimeCustomTool = ToolDefinition<…>` is pi); permission decision logic
  (`permission-rules-store`); MCP call/normalize logic; history via app DB + a cold-start
  `<conversation_history>` text preamble (`agent-runner.ts:1829-1927`) — no message array
  is handed to pi; OpenAI is already a first-class provider.

## Background — Codex integration surface (from research)

Full detail: `research/codex-integration-surface.md`. **No absolute blockers.** Verdicts:

- **Embedding target = long-lived `codex app-server`** (JSON-RPC v2), not `codex exec`.
  Forced: per-tool approval + custom-tool injection exist only via app-server/mcp-server;
  `codex exec` hard-forces `--ask-for-approval never`.
- **Per-tool permission gating: SUPPORTED** (app-server `CommandExecutionApprovalDecision`
  / `FileChangeApprovalDecision`, MCP `elicitation/create`) — replaces pi's private hook.
- **Custom tools: SUPPORTED** — experimental `dynamic_tools` + MCP (stable). Memory/Config
  tools move to dynamic_tools or a bundled MCP server.
- **MCP: SUPPORTED** (client and server).
- **Sandbox: SUPPORTED + delegable** — `danger-full-access`, let the app's Lima/WSL VM
  isolate; Windows via AppContainer crate.
- **Providers: OpenAI wire only** — drives D4.
- **History: SUPPORTED** via Codex-native threads; external-transcript injection maps onto
  the app's existing `<conversation_history>` preamble.
- **Distribution: SUPPORTED** — Rust binary via `@openai/codex-{platform}` npm packages.
- Stability: `dynamic_tools` + some app-server bits are experimental → pin a codex version,
  target protocol v2.

## Requirements

- R1: `design.md` defines the target Codex-backed runtime — how Codex is driven (long-lived
  `codex app-server`, JSON-RPC v2, per-platform binary) and how each of the three seams is
  re-implemented.
- R2: `design.md` includes a capability map — for each capability (providers per D4, VM
  sandbox, MCP, Skills, subagents, memory, per-tool permissions, streaming traces, remote
  control, headless RPC, compaction, loop-guard) — with a supported/changed/dropped verdict
  and evidence (repo refs for current, research refs for target).
- R3: `design.md` states what replaces each pi private-API reach-in: permission hook →
  app-server approval events; Ollama `num_ctx` → codex provider config; loop-guard steering
  → codex turn-injection equivalent (or documented capability loss).
- R4: `implement.md` is a phased plan whose **Phase 0 is a capability-verification spike**
  (drive `codex app-server`: streaming, a dynamic tool, a per-tool approval, sandbox
  delegation) acting as the hard go/no-go gate; then seam-by-seam replacement; **pi removal
  is the last phase**, gated on parity. Includes validation commands + rollback points.
- R5: The plan explicitly scopes the D4 provider regression (Anthropic/Gemini removal):
  config/UI changes, migration for existing users on those providers.

## Acceptance criteria

- [ ] AC1: `design.md` capability map covers every capability in R2 with a verdict +
      evidence; the three seams and their Codex replacements are specified.
- [ ] AC2: `implement.md` is ordered, opens with the Phase 0 spike gate, names the risky
      files (`agent-runner.ts`, `pi-model-resolution.ts`, `subagent-extension.ts`,
      `shared-auth.ts`, `compaction-extension.ts`, `agent-runner-message-end.ts`,
      `sdk-one-shot.ts`, `windows-bash-operations.ts`) and rollback points.
- [ ] AC3: The go/no-go gate after Phase 0 is defined with concrete pass criteria (D3).
- [ ] AC4: The provider regression (D4) is addressed end-to-end (R5).
- [ ] AC5: User reviews `design.md` + `implement.md` before `task.py start`.

## Out of scope

- Executing the migration code — this task delivers the plan; implementation is a
  follow-up task (unless the user extends scope). No product code changes here.
- A wire-translation shim to retain Anthropic/Gemini (excluded by D4).
- The non-chosen "codex" interpretations (D1).
