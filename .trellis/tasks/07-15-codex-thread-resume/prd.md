# PRD — Replace the `<conversation_history>` preamble with codex `thread/resume`

## Goal

Stop hand-rebuilding conversation history into a text preamble on cold-start; instead use
codex's native thread persistence (`thread/resume`) so codex restores full server-side
history (text + reasoning + tool calls) itself. This is the last major "多此一举" adapter
identified in the codex-runtime audit — the biggest one after the MCP-native migration.

## Background / evidence

- Today (`agent-runner.ts` ~1684-1752 + helpers): on a cold codex thread (new session, or
  thread disposed on cwd/runtime-signature change) the app rebuilds prior turns from SQLite
  into a hand-serialized `<conversation_history>` XML blob (`serializeMessageContentForHistory`,
  `escapeXmlAttr/Text`, `estimateCharsPerToken`, CJK-aware token budgeting) and prepends it
  to the prompt. This re-implements what codex owns natively.
- **Codex-native mechanisms (verified via `codex app-server generate-ts`):**
  - `thread/resume` exists (`ThreadResumeParams`/`ThreadResumeResponse`/
    `ThreadResumeInitialTurnsPageParams`) — codex persists threads server-side (rollout/state
    DB) and can restore one by id.
  - `thread/inject_items` (`{ threadId, items: JsonValue[] }`, items = "Raw Responses API
    items") — lower-level manual seeding; already declared in `codex-client.ts` (currently
    dead, kept for this task).
  - `ThreadStartParams` has no resume field — resume is its own RPC.

## Requirements (draft)

- R1: Persist the codex `threadId` per session (DB) so it survives app restarts.
- R2: On cold-start, if a persisted threadId exists and is resumable, `thread/resume` it
  instead of building the `<conversation_history>` preamble.
- R3: Fall back to the existing DB-replay preamble when resume is unavailable (thread evicted,
  different app-server, resume error) — do NOT lose history.
- R4: Correctly decide resume-vs-new-thread when cwd/provider/model change (today these
  invalidate the runtime signature and dispose the thread).
- R5: Preserve reasoning/tool-call replay fidelity (issue #162, Bug B) — resume should do this
  natively; verify it actually does.

## Acceptance criteria

- [ ] Multi-turn conversation continues correctly after an app restart via resume (no preamble).
- [ ] cwd / provider / model switch still works (new thread or correct resume).
- [ ] Thinking + tool-call history is preserved across a cold-start (parity with or better
      than the preamble; #162 does not regress).
- [ ] Resume failure falls back to the preamble with no lost history.
- [ ] tsc / lint / vitest green; live-verified across the scenarios above.

## Risk / notes

- Highest-risk change in the codebase (core context/history path). Needs live multi-scenario
  verification, not just unit tests.
- The `<conversation_history>` apparatus should be KEPT as the fallback, not deleted outright,
  until resume is proven across restart/eviction.
- Depends on understanding codex thread persistence lifetime + eviction (rollout/state DB).

## Out of scope

- The doc-comment sweep (stale "Seam/Phase/mirrors pi" framing) — separate low-risk follow-up.
