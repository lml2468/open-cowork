# Implement: Codex Runtime Migration

Phased, ordered execution plan. Strategy is **hard cut-over** (D3): pi is removed only in
the final phase, gated on parity demonstrated in Phase 0. All work on a feature branch
(e.g. `feature/codex-runtime`); do not merge until Phase 6 passes.

Validation baseline (run after every phase): `npm run lint && npx tsc --noEmit && npx
vitest run` (see `.trellis/spec/guides/build-and-test.md` — note the better-sqlite3 ABI
rebuild is auto-handled by the vitest globalSetup).

## Phase 0 — Capability-verification spike (HARD GO/NO-GO GATE)

Goal: prove Codex can cover the must-keep capabilities before touching pi. Throwaway code
in a scratch dir; not wired into the app.

- [ ] Bundle + launch a `codex app-server` child from Node; establish JSON-RPC v2 over
      stdio; `thread/start` + a simple turn; stream assistant text + `reasoning` deltas.
- [ ] Register one `dynamic_tools` function tool; confirm host `execute` is invoked and the
      result feeds back into the turn. (If unstable → validate the bundled-MCP-server
      fallback instead.)
- [ ] Intercept one `command_execution` approval request and answer it programmatically
      (deny + allow paths).
- [ ] Point `model_providers` at an OpenAI-compatible base URL with an API key; confirm a
      non-OpenAI-hosted, OpenAI-wire endpoint works.
- [ ] Confirm `danger-full-access` disables codex's own sandbox (so the app's Lima/WSL VM
      owns isolation), on macOS and Windows.

**Gate:** every box above must pass. Any failure → stop; report to the user; do not
proceed to Phase 1. Record spike results in `research/phase0-spike-results.md`.

## Phase 1 — Runtime scaffolding (additive, pi still live)

- [ ] Add `@openai/codex-*` per-platform packages; extend the build/resource-prep +
      `pre-build-check.js` so the binary ships (mirror existing per-platform prep).
- [ ] `src/main/agent/codex-runtime/codex-client.ts` — spawn/supervise the app-server
      child (start, health, restart-on-crash, dispose), JSON-RPC transport.
- [ ] `src/main/agent/codex-model-config.ts` — map config-store fields → codex
      provider/model config + auth (replaces `pi-model-resolution.ts`, not yet deleted).
- [ ] Unit tests for the JSON-RPC transport + model-config mapping (`src/tests/agent/`).

## Phase 2 — Event translation on Codex (Seam 3 first — lowest risk)

- [ ] Build the codex-event → `ServerEvent`/`TraceStep`/`Message` translator feeding the
      existing `sendPartial` / `sendToRenderer` / `sendTraceStep` / `sendMessage` emitters.
- [ ] Rewrite `agent-runner-message-end.ts` to assemble the final `Message` from codex's
      final item payload.
- [ ] Tests asserting representative codex events produce the correct emitter calls.

## Phase 3 — Lifecycle + tools + permissions (Seam 1)

- [ ] `CodexRuntime`: `thread/start` (cwd, model, `dynamicTools`, MCP servers,
      `danger-full-access`) → turn send → event stream → thread dispose; app-server kept
      warm.
- [ ] Retarget `AgentRuntimeCustomTool` off pi `ToolDefinition` to the Phase 0-chosen
      mechanism; port `MemoryExtension` + `ConfigExtension` tools (`memory-types.ts`,
      `config-extension.ts`, `memory-extension.ts`).
- [ ] Wire app-server approval events → `decidePermission` / `rememberAlwaysAllow`
      (removes `agent.setBeforeToolCall` reach-in).
- [ ] Re-target/drop the `createCodingTools` sudo/timeout/Windows wrappers
      (`windows-bash-operations.ts`).
- [ ] Loop-guard steering → codex turn-injection or documented change.

## Phase 4 — Subagents + one-shots + compaction (Seam 1 cont.)

- [ ] `SubagentExtension` → child codex threads (replace the nested pi loop,
      `subagent-extension.ts:252-370`).
- [ ] `sdk-one-shot.ts` (title gen, API connectivity test) → codex one-shot turn or a
      direct OpenAI-compatible call.
- [ ] Compaction: replace the pi `ExtensionFactory` (`compaction-extension.ts`) with
      codex-native compaction mapped to `compaction.result`.

## Phase 5 — Wire CoworkAgentRunner to CodexRuntime; provider regression (D4)

- [ ] Swap the pi call sites in `agent-runner.ts` (~2140–3030) to `CodexRuntime`; register
      the extension list against it in **both** managers (GUI `index.ts:1341`, headless
      `:924`).
- [ ] `config-store.ts:41` `ProviderType`: remove `anthropic` / `gemini`; update presets
      (`:315-354`); renderer settings/API UI drops those providers + adds the D4 migration
      notice for existing users (non-destructive; keys retained).
- [ ] Verify all headless modes (`-p`, `--mode rpc`, `--mode stdio`) drive Codex and still
      gate on credentials + app-server readiness.
- [ ] Drive the app end-to-end (see the `run` skill): streaming, a tool call + permission
      prompt, a subagent, an OpenAI-compatible provider, light + dark unaffected.

## Phase 6 — Remove pi (last; only after parity)

- [ ] Delete `pi-model-resolution.ts`, `shared-auth.ts`, pi usage in `agent-runner.ts` /
      `subagent-extension.ts` / `compaction-extension.ts` / `agent-runner-message-end.ts`;
      drop `@mariozechner/pi-*` from `package.json` + the `vite.config.ts` bundling note.
- [ ] Full CI gate green; end-to-end drive again; update `.trellis/spec/main/*` (agent +
      runtime-extensions docs) to describe the Codex runtime.

## Risky files / rollback points

`agent-runner.ts` (biggest), `pi-model-resolution.ts`, `subagent-extension.ts`,
`shared-auth.ts`, `compaction-extension.ts`, `agent-runner-message-end.ts`,
`sdk-one-shot.ts`, `windows-bash-operations.ts`, `config-store.ts`. Rollback = per-phase
commits on the branch; pi removal (Phase 6) is the point of no easy return, so it is last
and gated. If Phase 0 fails, nothing in the app changes.
