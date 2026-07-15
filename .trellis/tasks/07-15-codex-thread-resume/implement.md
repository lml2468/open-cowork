# Implement — codex thread/resume

Order matters: the gating unknown (Q-A) is resolved before the DB/agent-runner wiring, because
if host tools don't survive resume the whole approach changes (fall back to `thread/inject_items`).

## Step 0 — resolve Q-A (host tools survive resume?) — GATE

- Add `CodexClient.threadResume(params)` (`thread/resume`) + a `ThreadResumeParams`/response type.
- Behind a temporary dev flag (or a guarded branch), make `ensureThread` resume a persisted
  threadId. Live-test against the Responses gateway: start a session, use a host tool
  (`config_read`/`spawn_subagent`) + an MCP tool, restart the app, resume, and confirm BOTH
  still work.
- If tools survive → continue to Step 1. If not → pivot design to `thread/inject_items` (keep
  thread/start + tools; seed raw Responses items) and revise design.md before proceeding.

## Step 1 — persistence

- DB: `ensureColumn(sessions, 'codex_runtime_signature', 'codex_runtime_signature TEXT')`;
  thread through session-manager like `openai_thread_id`.
- Persist the codex threadId to `session.openaiThreadId` + the runtime signature after a thread
  is created/resolved for a turn.

## Step 2 — runtime resume path

- `ensureThread`: if `options.resumeThreadId` is set, try `thread/resume` (overrides: model /
  modelProvider / cwd / config[incl. mcp_servers] / baseInstructions / developerInstructions);
  on success register maps + mark resumed; on failure `thread/start` (fresh).
- Add `runtime.ensureThreadForSession(sessionId, opts) → { threadId, resumed }` so agent-runner
  can resolve the thread BEFORE building the prompt (the preamble is part of the prompt).

## Step 3 — agent-runner cold-start decision

- On cold start: if `session.openaiThreadId` exists AND persisted signature === current
  signature → `ensureThreadForSession({ resumeThreadId })`; if `resumed`, SKIP the preamble.
- Else (no id / signature mismatch / resume failed) → build the `<conversation_history>`
  preamble (today's path) + fresh thread.
- Persist the resolved threadId + current signature afterward.

## Step 4 — keep the fallback

- Leave `serializeMessageContentForHistory` + preamble builder intact as the fallback; do not
  delete until resume is proven across restart + eviction.

## Validation

- `npx tsc --noEmit`, `npm run lint`, `npx vitest run` (add unit tests for threadResume wiring +
  the cold-start resume-vs-preamble decision).
- LIVE (required): the 5 scenarios in design.md "Verification".

## Risky points / rollback

- Step 0 is the gate; do not build Steps 1-3 until Q-A is confirmed.
- Core history path — revert the branch to restore always-preamble behavior.
