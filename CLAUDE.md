# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Open Cowork is an Electron desktop AI-agent app (Windows + macOS) that wraps multiple LLM providers (Anthropic, OpenAI, Gemini, and any OpenAI-compatible endpoint) behind a GUI, with VM-level sandbox isolation, an MCP tool layer, a Skills system, and remote control via Feishu/Slack. The agent loop itself is provided by the `@mariozechner/pi-coding-agent` / `pi-ai` SDK — this repo integrates and orchestrates it, it does not implement the LLM loop from scratch.

## Commands

Node 22 is required (`.nvmrc`, matches CI). `npm install` runs a heavy `postinstall`: `patch-package`, downloads per-platform Node runtimes into `resources/node/`, and rebuilds `better-sqlite3` against Electron's ABI.

| Task                            | Command                                                 |
| ------------------------------- | ------------------------------------------------------- |
| Dev (Vite + Electron)           | `npm run dev`                                           |
| Type-check                      | `npx tsc --noEmit` (or `npm run typecheck`)             |
| Lint                            | `npm run lint`                                          |
| Format                          | `npm run format`                                        |
| Tests (watch)                   | `npm run test`                                          |
| Tests (single run, as CI)       | `npx vitest run`                                        |
| One test file                   | `npx vitest run src/tests/remote/stdio-channel.test.ts` |
| One test by name                | `npx vitest run -t "continues an existing session"`     |
| Coverage                        | `npx vitest run --coverage`                             |
| Full production build + package | `npm run build`                                         |

CI gate before merge: `npm run lint`, `npx tsc --noEmit`, `npx vitest run` must all pass.

### Build is multi-stage — don't assume a plain `tsc && vite build` is enough

`npm run build` chains: `download:node` → `prepare:gui-tools` (bundles `cliclick`, requires it installed via Homebrew on macOS) → `prepare:python:all` (downloads standalone Python for both arches) → `build:wsl-agent` + `build:lima-agent` (separate `tsc` projects) → `build:mcp` (esbuild-bundles MCP servers into `.bundle-resources/mcp/`) → `tsc` → `vite build` → `pre-build-check.js` (validates all artifacts exist) → `electron-builder`.

To just get a runnable main process for local testing (skips sandbox/python/gui prep), `node scripts/bundle-mcp.js && npx vite build` produces `dist-electron/main/index.js`. macOS packaging (`electron-builder.yml` mac target) is `dir` + a custom LZMA DMG hook; it hard-references `resources/tools/darwin-<arch>` (cliclick) and `resources/python/darwin-<arch>`, so those prep steps must have run.

## Architecture

Electron three-process split: `src/main` (Node/main), `src/preload` (context bridge), `src/renderer` (React). Shared types in `src/shared`.

### The IPC contract is the spine

Renderer ↔ main communicate through a **single typed event protocol**, not scattered channels:

- Renderer → main: `ClientEvent` objects, sent via `window.electronAPI` (`src/preload/index.ts` exposes it over `contextBridge`). Fire-and-forget goes over `ipcRenderer.send('client-event', ...)`; request/response over `ipcRenderer.invoke('client-invoke', ...)`.
- Main → renderer: `ServerEvent` objects pushed on the `server-event` channel (streaming deltas, trace steps, session status, permission requests, etc.).
- Both unions are defined in `src/renderer/types/index.ts`. `src/main/index.ts` dispatches every `ClientEvent` in `handleClientEvent`. When adding a feature that crosses the boundary, extend these unions rather than inventing a new channel.

### Agent execution path

`SessionManager` (`src/main/session/session-manager.ts`) owns session CRUD + chat history (persisted in SQLite) and drives `CoworkAgentRunner` (`src/main/agent/agent-runner.ts`), which wraps the pi-coding-agent SDK. Provider/model routing, auth, and env-var projection live in `src/main/config/config-store.ts` (`applyToEnv`, `hasUsableCredentialsForActiveSet`) and `src/main/agent/pi-model-resolution.ts`. Streaming output and tool traces flow back out as `ServerEvent`s.

### Agent runtime extensions

Agent capabilities beyond the base tools are composed as `AgentRuntimeExtension`s registered through `AgentRuntimeExtensionManager` (`src/main/extensions/`). Current extensions: `MemoryExtension`, `ConfigExtension` (the `config_read`/`config_write` agent tools), `SubagentExtension` (in-process child sessions), `CompactionExtension`. Both the GUI path and the headless path build their own manager instances in `src/main/index.ts` — keep the two extension lists in sync when adding one.

### Headless / RPC surface

`src/main/index.ts` has a full headless mode (`--headless`) parsed in `src/main/cli/headless-io.ts`, with three sub-modes: `-p` one-shot JSON, `--mode rpc` (ClientEvent JSONL loop), and `--mode stdio` (session-oriented RPC via `RemoteManager` + `StdioChannel`, protocol documented at the top of `src/main/remote/channels/stdio-channel.ts`). All modes gate on configured credentials before doing work. This is the most scriptable surface for verifying main-process changes without a display.

### Remote control

`src/main/remote/` implements a channel abstraction (`ChannelBase`, `channels/`) feeding a `MessageRouter` and `RemoteManager`. `RemoteManager` maintains a bidirectional map between the router's `remote-*` session id and the actual `SessionManager` UUID; per-turn buffer cleanup (`clearSessionBuffer`) and persistent session teardown (`removeRemoteSession`) are deliberately separate — conflating them breaks multi-turn continuation.

### Sandbox

`src/main/sandbox/` provides layered isolation: path-based guards everywhere, plus optional VM isolation via Lima (macOS) / WSL2 (Windows). The Lima/WSL "agents" are separate TypeScript projects (`src/main/sandbox/{lima,wsl}-agent/`, each with its own `tsconfig.json`) compiled independently and bundled as resources; commands are proxied into the VM via the bridge/sync modules.

### Other main-process subsystems

`src/main/mcp/` (MCP server lifecycle over stdio/SSE/Streamable HTTP + two bundled example servers), `src/main/skills/` (skill discovery + hot-reload, backed by a plugin registry), `src/main/memory/` (multi-tier memory extraction/storage with its own LLM client), `src/main/schedule/` (cron-like tasks), `src/main/db/database.ts` (SQLite at `<userData>/data/cowork.db`), `src/main/config/config-file-watcher.ts` (bidirectional sync between the encrypted electron-store and a plaintext `config.public.json`).

### Renderer

React + Zustand (`src/renderer/store/`) + Tailwind. All user-facing strings go through i18next (`src/renderer/i18n/`, add keys to **both** `en` and `zh`).

## Conventions

- **TypeScript strict**, no `any` — use `unknown` + type guards; `catch (e: unknown)` not `catch (e: any)` (rejected in review).
- **React**: functional components + hooks only; keep component files under ~500 lines.
- **Styling**: Tailwind only. **Icons**: `lucide-react` only.
- **Commits**: Conventional Commits enforced by commitlint + husky (header ≤100 chars). Types: `feat|fix|refactor|perf|docs|test|build|chore|ci|style|revert|release|merge`. A pre-commit hook runs eslint --fix + prettier on staged files.
- **Branches**: PRs normally target `dev` (integration); `main` is for releases. `feature/<name>`, `fix/<name>`.
- **Tests** (Vitest, `vitest.config.mts`): required for every `feat`/`fix`. Place under `src/tests/` mirroring the source path (`src/main/mcp/foo.ts` → `src/tests/mcp/foo.test.ts`). `electron` is aliased to a mock (`tests/mocks/electron.ts`) so tests don't depend on the installed Electron binary; `electron-store` is inlined. Renderer code is excluded from coverage.

## Gotchas

- The repo path aliases: `@` → `src` (both vite and vitest); `@main` → `src/main`, `@renderer` → `src/renderer` (vite only).
- Large main-process deps and ESM-only packages are handled explicitly in `vite.config.ts` `rollupOptions.external` — ESM-only packages (pi-coding-agent, pi-ai, electron-store, uuid) must stay **bundled**, CJS ones are externalized. Check that list before changing an import of a heavy dependency.
- API keys live in an Electron-`safeStorage`-encrypted electron-store; only the non-sensitive subset (`EXPORTABLE_FIELDS` in `config-store.ts`) round-trips through the plaintext `config.public.json`. You cannot seed credentials by writing config files alone except for providers that allow an empty key (e.g. `ollama`).
- CONTRIBUTING.md refers to `src/main/claude/` — the directory is now `src/main/agent/`.
