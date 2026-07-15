# Design — codex thread/resume vs the `<conversation_history>` preamble

## Mechanism

Persist the codex `threadId` + the runtime signature per session; on a cold start (in-memory
`sessionToThread` empty — always true after an app restart), `thread/resume` the persisted
thread instead of `thread/start` + rebuilding the `<conversation_history>` preamble. codex
restores server-side history (text + reasoning + tool calls) natively. Keep the preamble as a
fallback.

## Facts (verified)

- `sessions.openai_thread_id` column already exists and round-trips through session-manager
  (`Session.openaiThreadId`), but nothing writes the codex threadId today (always null).
- `thread/resume` (`ThreadResumeParams`): resume **by threadId** ("load from disk … prefer
  thread_id"), accepts overrides: model / modelProvider / cwd / config / baseInstructions /
  developerInstructions. Returns the `Thread` + resolved model/cwd.
- Runtime tracks `sessionToThread`/`threadToSession` **in-memory only** (lost on restart) and
  currently only calls `thread/start` in `ensureThread`. `CodexClient` has `threadStart`,
  `turnStart`, `injectItems` — **no `threadResume` yet** (must add).

## CRITICAL open question (verify FIRST — gates the whole approach)

- **Q-A: Do host `dynamic_tools` survive `thread/resume`?** `ThreadResumeParams` has NO
  `dynamicTools` field (only `config`). If resumed threads lose the memory/config/subagent
  host tools, resume regresses tool availability. Must verify live: resume a thread, then
  check whether the model can still call `spawn_subagent`/`config_read`/`memory_search`. If
  tools are dropped, find the re-registration path (another RPC? re-`thread/start` semantics?)
  or abandon resume in favor of `thread/inject_items` (which keeps thread/start + tools and
  just seeds history items — but requires building raw Responses API items).
- **Q-B: cwd/provider/model change** — resume accepts overrides, but a cwd change means the
  thread's history references old paths. v1: only resume when the persisted runtime signature
  matches the current one; on mismatch, `thread/start` fresh + preamble (today's behavior).
- **Q-C: thread eviction** — how long does codex keep threads on disk (rollout/state DB)?
  Resume-miss must fall back cleanly.

## Design (assuming Q-A resolves favorably)

1. `CodexClient.threadResume(params)` → `thread/resume`.
2. DB: persist the runtime signature too (add `codex_runtime_signature TEXT` via `ensureColumn`),
   alongside the existing `openai_thread_id`.
3. Runtime: `ensureThread` gains a resume branch — if the caller supplies `resumeThreadId`, try
   `thread/resume` (with current overrides + re-passed `config` incl. `mcp_servers`); on success
   register the maps with the resumed id; on failure fall back to `thread/start`. Expose whether
   it resumed (so the caller skips the preamble). Because the preamble is part of the prompt
   built BEFORE the turn, add `runtime.ensureThreadForSession(sessionId, opts) → {threadId,
resumed}` that agent-runner calls first, then `runTurn` reuses the resolved thread.
4. agent-runner cold-start: read `session.openaiThreadId` + persisted signature; if signature
   matches → ensureThreadForSession with resumeThreadId → if `resumed`, SKIP the preamble; else
   build the preamble (fallback). After thread creation, persist the (new or resumed) threadId +
   current signature to the session.
5. Keep `serializeMessageContentForHistory` + the preamble as the fallback path (do NOT delete
   until resume is proven across restart + eviction).

## Verification (LIVE — required, not just unit tests)

- Multi-turn conversation continues after an app restart via resume (no preamble in the prompt).
- Host tools (memory/config/spawn_subagent) still callable after resume (Q-A).
- cwd / provider / model switch → correct fresh-vs-resume; no lost history.
- Thinking + tool-call replay preserved across cold start (#162 no regression).
- Resume-miss (evicted / deleted thread) falls back to preamble with full history.

## Rollback

Each piece is additive + guarded; the preamble remains the default fallback. Revert the branch
to restore today's always-preamble behavior.
