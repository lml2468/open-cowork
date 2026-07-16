# Agent Runtime — Execution Path

> How a user prompt becomes streamed output. The chain is
> `SessionManager` → `CoworkAgentRunner` → `CodexRuntime` → `CodexClient`
> (a `codex app-server` child) and back out as `ServerEvent`s. This repo does
> **not** implement the LLM loop; it orchestrates the embedded Codex backend.

## SessionManager — `src/main/session/session-manager.ts`

Owns session CRUD, SQLite persistence, and the per-session prompt queue.

- **Prompt queue**: `enqueuePrompt(session, prompt, content)` appends; if the
  session isn't already active, `processQueue(session)` drains it. One
  `AbortController` per session in `activeSessions: Map<string, AbortController>`
  guarantees a single in-flight turn per session and lets `stopSession` cancel.
- **Persistence tee**: the constructor wraps the injected `sendToRenderer` so
  that `trace.step` and `trace.update` events are also pushed into a
  `TraceStepWriteQueue` (`src/main/session/trace-step-write-queue.ts`) for
  async, batched, transactional SQLite persistence — see `database.md`.
- **AI delegation**: it talks to the runner only through the narrow local
  `AgentRunner` interface (~L67): `run` / `cancel` / optional `compact` /
  `getContextUsage` / `clearSdkSession(s)`. Concrete impl is
  `CoworkAgentRunner`, built in `createCoworkAgentRunner()`.
- **Error path**: in `processPrompt`, a thrown turn is caught (~L775): unless the
  error is flagged `alreadyReportedToUser`, it saves an assistant message
  `**Error**: <msg>`, emits `stream.message`, then emits an `error` ServerEvent.

## CoworkAgentRunner — `src/main/agent/agent-runner.ts`

- Owns a **lazy, long-lived** `CodexRuntime` (`ensureCodexRuntime()`, ~L826).
  The underlying `codex app-server` child is **kept warm** across turns.
- `run(session, prompt, existingMessages)` (~L1067) assembles the turn and calls
  `runtime.runTurn({...})`.
- **Env-signature respawn** (~L1514): before each turn it computes
  `JSON.stringify(modelConfig.env)`. If it differs from
  `codexClientEnvSignature`, the runtime is torn down and respawned — the
  app-server captures env **at spawn**, so a credential/model change requires a
  fresh child.
- **Watchdog** (~L2091): `PROMPT_TIMEOUT_MS = 5 * 60 * 1000`; a turn with no
  activity for 5 minutes is interrupted.
- `buildCodexEmitters()` (~L919) builds the `CodexRuntimeEmitters` the runtime
  dispatches into (see flow below).

## codex-runtime/ internals

### CodexClient — `codex-client.ts`

Spawns and supervises the `codex app-server` child, speaking
**newline-delimited JSON-RPC v2** (one JSON object per line). State machine
`CodexClientState = 'idle' | 'starting' | 'ready' | 'crashed' | 'stopped'` with
bounded **auto-restart** on crash. The spawn function is injectable (for tests).
`onNotification(cb)` fans out server notifications.

### CodexRuntime — `codex-runtime.ts`

Maps app `sessionId` ↔ codex `threadId` and turns notifications into emitter
calls.

- `runTurn(options)` (~L188): rejects if a turn is already active for the
  session, then `ensureThread(options)` resolves the thread. Thread resolution
  order (`ensureThread` / `resolveThread`): **reuse** a live in-memory thread →
  `thread/resume` a persisted `resumeThreadId` (codex restores server-side
  history) → `thread/start` a fresh thread (with history preamble). A fresh
  translator is created per turn (one turn per session at a time).
- `handleNotification(n)` (~L449) → the session's `CodexEventTranslator` →
  `dispatchAction(action)` (~L468) → the matching emitter.
- **`thread/start` is the only place host `dynamic_tools` are registered**
  (`startThreadInternal` calls `toolBridge.buildDynamicToolSpecs()`).
  `thread/resume` has no field for host tools, so resumed threads run without
  freshly-registered host tools.

### CodexEventTranslator — `codex-event-translator.ts`

A **pure, Electron-free, unit-tested** transform: `handleNotification` switches
on the codex `method` and returns zero or more `CodexTranslatorAction[]`. The
action union (~L42):
`partial | thinking | traceStep | traceUpdate | message | compaction | tokenUsage | error`.
`assembleFinalMessage(turn)` builds **one** assistant `Message` per turn
(thinking + text + tool_use blocks combined). It never imports Electron and
never calls emitters — that separation is what keeps it testable.

### Bridges

- `CodexPermissionBridge` (`codex-permission-bridge.ts`): maps codex approval
  **server-requests** to a decision. `allow → accept`, `deny → decline`,
  `always → acceptForSession`. When the verdict is `ask` and **no prompt handler
  is wired**, it conservatively returns `decline` (never auto-allow).
- `CodexToolBridge` (`codex-tool-bridge.ts`): holds the host `dynamic_tools`.
  `setTools(...)` replaces them; `buildDynamicToolSpecs()` produces the codex
  registration specs consumed at `thread/start`. On an unknown tool or a thrown
  `execute`, it returns a `success: false` result — **not** a JSON-RPC error —
  so the model sees a normal tool failure.

### codex-shared-client.ts

A process-wide **singleton** `CodexClient` for one-shot utility calls
(session-title generation, config connectivity tests). It respawns when the
one-shot model env signature changes. Separate from the per-runner warm client.

## Streaming flow, end to end

```
codex app-server stdout (JSON-RPC line)
  → CodexClient.onNotification
  → CodexRuntime.handleNotification
  → CodexEventTranslator (pure)  → CodexTranslatorAction[]
  → CodexRuntime.dispatchAction
  → CoworkAgentRunner emitters (buildCodexEmitters)
  → send* helpers
  → SessionManager.sendToRenderer  (tees trace.step/trace.update → TraceStepWriteQueue)
  → main index.ts sendToRenderer
  → webContents.send('server-event', ...)
```

## Patterns

- **New codex notification** → add a `case` in `CodexEventTranslator` returning
  the appropriate existing action.
- **New kind of action** → add a variant to the `CodexTranslatorAction` union,
  a `case` in `dispatchAction`, and a new emitter in
  `CodexRuntimeEmitters` / `buildCodexEmitters`.
- Keep `CodexEventTranslator` pure and Electron-free so its unit tests stay
  valid.

## Anti-patterns

- Relying on `thread/resume` to (re)register host `dynamic_tools` — they are
  only sent at `thread/start`.
- Mutating credentials/model without accounting for the env-signature respawn —
  the running app-server won't pick up env changes.
- Importing Electron (or calling `sendToRenderer`) from the translator.
- Turning an unknown/failed host tool into a JSON-RPC error instead of a
  `success: false` tool result.
