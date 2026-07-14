# Agent & Sessions

## Execution path

The agent loop is provided by the `@mariozechner/pi-coding-agent` / `pi-ai` SDK — this
repo integrates and orchestrates it, it does not implement the LLM loop from scratch.

- `SessionManager` (`src/main/session/session-manager.ts`) owns session CRUD + chat
  history (persisted in SQLite) and drives the runner.
- `CoworkAgentRunner` (`src/main/agent/agent-runner.ts`, class at
  `agent-runner.ts:555`) wraps the pi-coding-agent SDK and runs a turn.
- Streaming output and tool traces flow back to the renderer as `ServerEvent`s (see the
  IPC dispatch guide).

When adding agent behavior, work through `SessionManager` / `CoworkAgentRunner` and the
extension system (see runtime-extensions), not by re-implementing the loop.

## Provider / model / auth routing

All provider routing, auth, and env-var projection is centralized — put changes here,
not inline at call sites:

- `src/main/config/config-store.ts`:
  - `applyToEnv()` (`config-store.ts:1514`) — projects config into process env for the
    SDK/providers.
  - `hasUsableCredentialsForActiveSet()` (`config-store.ts:1479`) — the credential gate.
  - `EXPORTABLE_FIELDS` (`config-store.ts:181`) — the non-sensitive subset that
    round-trips to the plaintext `config.public.json`. API keys live in an
    Electron-`safeStorage`-encrypted store and are **not** exportable.
- `src/main/agent/pi-model-resolution.ts` — resolves the active provider/model to the
  pi-ai model.

## Credential gating

Every path that actually runs the agent (GUI and all headless modes) must gate on
`hasUsableCredentialsForActiveSet()` before doing work. Preserve this gate on any new
run entry point.

## Persistence

Sessions/messages persist to SQLite at `<userData>/data/cowork.db`
(`src/main/db/database.ts`). `better-sqlite3` is a native module — see the build-and-test
guide for the ABI rebuild caveat that affects running tests.

## Anti-patterns

- Re-implementing the LLM/agent loop instead of using the pi SDK via
  `CoworkAgentRunner`.
- Reading provider keys / building model configs inline instead of via `config-store` +
  `pi-model-resolution`.
- Adding a run path that skips the credential gate.
- Trying to persist API keys through `config.public.json` / `EXPORTABLE_FIELDS`.
