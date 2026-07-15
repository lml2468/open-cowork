# PRD — Agent-managed Markdown memory

## Goal

Replace the JSON core-memory system (LLM extractor + `memory_search`/`memory_read` custom
tools + `core_memory.json`) with **agent-managed Markdown files** the model reads/writes via
its own Read/Write/Edit tools — the Claude Code MEMORY.md model. Simpler, transparent,
user-editable, and no bespoke memory tools or extractor LLM pass.

## Decisions (confirmed with user)

- **Agent-managed only.** Drop the LLM extractor, the `memory_search`/`memory_read` tools, and
  the JSON store. The agent decides when to write memory, guided by memory instructions in the
  system prompt. No automatic post-session extraction pass.
- **Both global and per-project memory.**
  - Global: `<userData>/memory/` — persists across all sessions/workspaces.
  - Project: `<cwd>/memory/` (per-workspace).
- **Structure** (each scope): `MEMORY.md` (always-loaded index of durable facts + pointers),
  `mem-YYYY-MM-DD.md` (per-day notes), `topic-<slug>.md` (per-topic). Cross-link with `[[name]]`.

## Requirements

- R1: On each session, inject the global `MEMORY.md` and (if present) the project `MEMORY.md`
  into context (like CLAUDE.md loading) — a compact, budgeted preamble, not the whole tree.
- R2: Add memory instructions to the system prompt: the paths, that MEMORY.md is the loaded
  index, when to Write/Edit `mem-<date>.md` / `topic-*.md`, the `[[name]]` linking convention,
  and to keep MEMORY.md a one-line-per-entry index.
- R3: The agent must be able to Read/Write/Edit both memory dirs via its file tools:
  - Project memory (cwd) — already accessible.
  - Global memory (`<userData>/memory`) — expose to the agent's filesystem. When the sandbox
    is OFF (default), ensure it's within allowed path guards. When ON (Lima/WSL), sync it in/out
    like skills (`~/.claude/skills` precedent via SandboxSync).
- R4: Migration: convert an existing `core_memory.json` into `MEMORY.md` on first run (don't
  lose durable facts users already have).
- R5: Remove the now-dead pieces: `memory_search`/`memory_read` tools, `CoreMemoryExtractor`,
  `MemoryLLMClient`, `CoreMemoryStore` (JSON), `MemoryIngestionQueue`, extraction in
  `afterSessionRun`. Keep `MemoryExtension` for context injection (now reads MEMORY.md).

## Acceptance criteria

- [ ] A fresh session loads global + project MEMORY.md into context.
- [ ] The agent can create/append `mem-YYYY-MM-DD.md` and `topic-*.md` and edit `MEMORY.md`
      via its file tools, in both scopes.
- [ ] Existing `core_memory.json` is migrated into `MEMORY.md` (no data loss).
- [ ] Memory toggle + storage-root config still work; the memory Settings view reflects Markdown.
- [ ] Dead JSON/extractor/tool code removed; tsc/lint/vitest green.
- [ ] Live: across a restart, the agent recalls memory from MEMORY.md and can update it.

## Open questions

- Q1: Sandbox-ON global-memory access — sync-in/out vs a mounted path. Resolve during design.
- Q2: Context-injection budget + which day/topic files (if any) to auto-include beyond
  MEMORY.md (default: only MEMORY.md; agent Reads day/topic files on demand).
- Q3: Project memory dir name: `memory/` vs `.cowork/memory/` (avoid cluttering repos).

## Out of scope

- The codex thread/resume spike (separate task, parked on its gate test).
