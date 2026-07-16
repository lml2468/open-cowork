# Headless / RPC Guidelines (headless surface)

> The scriptable, display-less entry into the main process. Three sub-modes share one
> startup path and one hard rule: **gate on credentials before any agent work, fail-closed,
> keep stdout pure JSONL.**

Primary files: `src/main/index.ts` (headless block, `parseHeadlessArgs().headless`),
`src/main/cli/headless-io.ts` (I/O adapter). Relevant test:
`src/tests/remote/stdio-channel.test.ts`.

---

## Entry and argument parsing

When it applies: launching with `--headless`.

The headless block in `src/main/index.ts` is entered when `parseHeadlessArgs().headless`
is true (`index.ts:891-893`) and **returns before GUI init**. `parseHeadlessArgs()`
(`headless-io.ts:301`) scans `process.argv` (no deps) into
`{ headless, prompt, cwd, autoApprove, mode }`. Flags: `--headless`, `-p`/`--prompt`,
`--cwd`, `--auto-approve`, `--mode`. Default mode is `prompt ? 'json' : 'rpc'`
(`headless-io.ts:328`).

---

## Common startup

Regardless of sub-mode (`index.ts` ~`:895` onward):

1. `redirectConsoleToStderr()` (`headless-io.ts:274`) so `console.log/warn/info/debug` go to
   stderr and **stdout stays pure JSONL** (`console.error` already writes to stderr).
2. Validate `--cwd` exists (and is a supported workspace path).
3. Build DB + `PluginRuntimeService` + `MemoryService` + a **headless**
   `AgentRuntimeExtensionManager` (`index.ts:929`) — it must MIRROR the GUI manager
   (`MemoryExtension`, `ConfigExtension`, `SubagentExtension`). Keep the two lists in sync.
4. Build `headlessSendWithPermission` (`index.ts:944`) wrapping
   `createHeadlessSendToRenderer()`, then construct `SessionManager`.

`headlessSendWithPermission` auto-answers permission requests via
`resolveHeadlessPermissionAction(event, autoApprove)` — `allow` when `--auto-approve`, else
`deny` (codex maps deny→decline). It also auto-denies `sudo.password.request`.

---

## Sub-mode (a): `-p` one-shot JSON

`index.ts:1094`. Gate `hasUsableCredentialsForActiveSet()` up front; on failure emit an
`error` with `code: 'CONFIG_REQUIRED_ACTIVE_SET'`, cleanup, `process.exit(1)`
(`:1098-1109`). Otherwise `startSession → waitForSessionCompletion(...)` (poll-based,
`:1078`) → `emitSessionEnded` → cleanup → `exit(0)`. Piped-stdin fallback (no `-p`, not rpc)
follows the same shape (`:1270`).

---

## Sub-mode (b): `--mode rpc`

`index.ts:1133`. `emitHeadlessReady()` then `startRpcLoop(handleClientEvent)`
(`headless-io.ts:222`). Each stdin line is a JSON-encoded `ClientEvent` dispatched through
the **same `handleClientEvent`** as the GUI; results come back as `rpc.result` /
`rpc.error`. GUI-only events (`folder.select`, `workdir.select`) throw (`:1140-1142`). The
credential gate is per `session.start`, inside the shared handler.

---

## Sub-mode (c): `--mode stdio`

`index.ts:1147`. Gate credentials up front (`:1151`). Wire a `stdioAgentExecutor`
(`AgentExecutor` adapter over `SessionManager`, `:1165`) + a `StdioChannel` via
`remoteManager.startStdioMode(cwd)` (`:1189`). Its wire protocol is documented at the top of
`src/main/remote/channels/stdio-channel.ts`.

`stdioEventInterceptor` (`:1220`) maps `ServerEvent`s to stdio events, but only for
`remoteManager.isRemoteSession(sessionId)`:

- `stream.partial` → `agent.text_delta`
- `trace.step` (tool_call running / completed|error) → `writeToolStart` / `writeToolEnd`
- `session.status` running → `writeSessionStarted`; idle|error → `writeSessionEnd` +
  `remoteManager.clearSessionBuffer(sessionId)` (**per-turn**, `:1254-1256`).

**CRITICAL ordering**: in `headlessSendWithPermission` the interceptor runs BEFORE
`headlessSendToRenderer` (`index.ts:964-970`). If the JSONL writer also ran for stdio
sessions, both would write to stdout and corrupt the stream. Stdio uses
`clearSessionBuffer`, NOT `removeRemoteSession` (issue #291 — see remote.md).

---

## Helper exports (`headless-io.ts`)

`resolveHeadlessPermissionAction` (pure, unit-tested, `:41`), `createHeadlessSendToRenderer`
(`:83`), `startRpcLoop` (`:222`), `redirectConsoleToStderr` (`:274`), `readStdinPrompt`
(`:199`), lifecycle emitters `emitSessionStarted`/`emitSessionEnded`/`emitHeadlessReady`.

---

## Rules and anti-patterns

Rules:

- ALL modes gate on `hasUsableCredentialsForActiveSet()` before agent work (fail-closed).
- Default permission answer is **deny**; `--auto-approve` is a loud opt-in (logged at startup).
- Keep stdout pure JSONL — route logs to stderr.
- Headless manages its own cleanup (`headlessCleanup`, SIGTERM/SIGINT handlers,
  `index.ts:1030`+); window-close cleanup is skipped since there is no window.

Anti-patterns:

- `stdioEventInterceptor` returning early / running after the JSONL writer (double-write
  corrupts stdout).
- Using `removeRemoteSession` in stdio per-turn cleanup (use `clearSessionBuffer`; issue #291).
- Letting the headless extension list drift from the GUI one.
