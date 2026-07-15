# Bootstrap / Refresh Project Development Guidelines

**You (the AI) are running this task. The developer does not read this file.**

## Goal

Rewrite `.coding/spec/` so it describes the **open-cowork** codebase as it
actually exists today, replacing the generic Electron template boilerplate the
scaffolding shipped with.

## Why this is a rewrite, not a fill-in

The pre-existing spec tree was copied from an unrelated Electron project and
does **not** match this repo. Verified mismatches:

| Old spec claimed | Reality in this repo |
|---|---|
| Drizzle ORM + migrations | Raw `better-sqlite3` at `src/main/db/database.ts` |
| TanStack / React Query | Zustand (`src/renderer/store/`) |
| `src/main/services/{domain}/` | Real layout: `agent/`, `config/`, `mcp/`, `memory/`, `remote/`, `sandbox/`, `extensions/`, `session/`, `skills/`, `schedule/` |
| `src/shared/constants/channels.ts` IPC | Typed `ClientEvent`/`ServerEvent` unions in `src/renderer/types/index.ts` |
| `window.api`, Electron Forge, `forge.config.ts` | `window.electronAPI`, electron-builder |
| pnpm | npm (Node 22, `.nvmrc`) |

The whole product spine was undocumented: the **codex-runtime** agent loop
(`codex app-server` child), the ClientEvent/ServerEvent IPC protocol,
`AgentRuntimeExtension`s, VM sandbox (Lima/WSL), remote channels (Feishu/Slack),
headless RPC modes, the MCP layer, and Skills.

## Scope

- Spec directory: `.coding/spec/` (all of backend, frontend, shared, guides, big-question, README).
- Source inspected: `src/main/**`, `src/renderer/**`, `src/preload/**`, `src/shared/**`, build/test config.
- Out of scope: modifying product source code.

## Method

1. Read existing `.coding/spec/` + `CLAUDE.md` / `AGENTS.md`.
2. Fan out read-only analysis across the real subsystems (IPC+agent spine,
   config/codex/extensions, renderer, sandbox/remote/headless, mcp/skills/memory/db,
   conventions/tests/build).
3. Rewrite spec files from real source — every important rule points at a real
   file path and names the symbol or pattern.
4. Delete template-only files that don't apply; add files for real local
   patterns the template missed; make each `index.md` match the final file set.
5. Final pass: no placeholders, no stale refs (Drizzle/Forge/pnpm/React Query),
   links resolve.

## Acceptance Criteria

- [ ] Specs describe open-cowork as it exists now, backed by real file paths.
- [ ] No placeholder text and no stale-stack references remain.
- [ ] Every `index.md` matches the actual spec files present.
- [ ] Product source code is unchanged.

## Completion

```bash
python3 ./.coding/scripts/task.py finish
python3 ./.coding/scripts/task.py archive 00-bootstrap-guidelines
```
