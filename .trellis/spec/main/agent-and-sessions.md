# Agent & Sessions

## Execution path

The agent loop runs on an embedded **OpenAI Codex `app-server`** backend (Codex CLI's
JSON-RPC `codex app-server`), driven from `src/main/agent/codex-runtime/`. This repo
integrates and orchestrates that backend; it does not implement the LLM loop from
scratch. (The former `@mariozechner/pi-coding-agent` / `pi-ai` SDK was removed in the
codex-runtime migration.)

- `SessionManager` (`src/main/session/session-manager.ts`) owns session CRUD + chat
  history (persisted in SQLite) and drives the runner.
- `CoworkAgentRunner` (`src/main/agent/agent-runner.ts`) owns a long-lived `CodexRuntime`
  (`codex-runtime/codex-runtime.ts`) via `ensureCodexRuntime()` and runs each turn with
  `runtime.runTurn({...})`. The runtime wraps a `CodexClient` (JSON-RPC over the
  app-server child), a `CodexEventTranslator` (codex events → `ServerEvent`s), a
  `CodexPermissionBridge` (per-tool approval), and a `CodexToolBridge` (extension + MCP
  host `dynamic_tools`).
- Streaming output and tool traces flow back to the renderer as `ServerEvent`s (see the
  IPC dispatch guide).

When adding agent behavior, work through `SessionManager` / `CoworkAgentRunner` and the
extension system (see runtime-extensions), not by re-implementing the loop.

## Provider / model / auth routing

All provider routing, auth, and env-var projection is centralized — put changes here,
not inline at call sites:

- `src/main/config/config-store.ts`:
  - `applyToEnv()` — projects config into process env for the app-server/providers.
  - `hasUsableCredentialsForActiveSet()` — the credential gate.
  - `EXPORTABLE_FIELDS` — the non-sensitive subset that round-trips to the plaintext
    `config.public.json`. API keys live in an Electron-`safeStorage`-encrypted store and
    are **not** exportable.
- `src/main/agent/codex-runtime/codex-model-config.ts` — `buildCodexModelConfig()` maps
  the active app config to a codex model/provider config (`model`, `modelProvider`,
  `configOverrides`, and the env vars codex reads the key from). Under the
  OpenAI-Responses-only constraint, unsupported providers fail closed with a user-facing
  configuration error (no silent fallback). One-shot utility calls (title-gen,
  connectivity probe, memory LLM) resolve via `codex-one-shot-config.ts` and share the
  process-wide client from `codex-shared-client.ts`.

## Credential gating

Every path that actually runs the agent (GUI and all headless modes) must gate on
`hasUsableCredentialsForActiveSet()` before doing work. Preserve this gate on any new
run entry point.

## Persistence

Sessions/messages persist to SQLite at `<userData>/data/cowork.db`
(`src/main/db/database.ts`). `better-sqlite3` is a native module — see the build-and-test
guide for the ABI rebuild caveat that affects running tests.

## Anti-patterns

- Re-implementing the LLM/agent loop instead of using the codex runtime via
  `CoworkAgentRunner` / `CodexRuntime`.
- Reading provider keys / building model configs inline instead of via `config-store` +
  `codex-runtime/codex-model-config`.
- Adding a run path that skips the credential gate.
- Trying to persist API keys through `config.public.json` / `EXPORTABLE_FIELDS`.
