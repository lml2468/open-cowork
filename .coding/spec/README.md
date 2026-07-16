# Open Cowork — Development Spec

Project-specific development guidelines for **open-cowork**. These are not a
generic template — every rule points at a real file, config, or value in this
repository. Verify against source before trusting any claim.

## What open-cowork is

Open Cowork is an **Electron desktop AI-agent app** (Windows + macOS) that wraps
OpenAI and OpenAI-Responses-compatible endpoints behind a GUI. The agent loop
itself runs on an embedded **OpenAI Codex `app-server`** backend, orchestrated
from `src/main/agent/codex-runtime/` (this repo does not implement the LLM loop
from scratch). Around that it adds:

- an **MCP** tool layer (`src/main/mcp/`),
- a **Skills** system (`src/main/skills/`),
- optional **VM-level sandbox** isolation via Lima (macOS) / WSL2 (Windows)
  (`src/main/sandbox/`),
- **remote control** via Feishu / Slack (`src/main/remote/`),
- multi-tier **memory**, **schedule**, and **config** subsystems.

## Tech stack (real)

| Area          | Choice                                                      |
| ------------- | ----------------------------------------------------------- |
| Shell         | Electron — `src/main` (Node), `src/preload`, `src/renderer` |
| Renderer      | React 18 + Zustand + Tailwind + i18next                     |
| IPC           | Single typed protocol: `ClientEvent` / `ServerEvent` unions |
| Agent runtime | codex-runtime over a `codex app-server` child process       |
| Database      | raw **better-sqlite3** (no ORM) — `src/main/db/database.ts` |
| Build         | **Vite** (bundler) + **electron-builder** (packaging)       |
| Package mgr   | **npm**, Node ≥ 22 (`.nvmrc`)                               |
| Tests         | **Vitest** (`vitest.config.mts`)                            |

> Not used here (despite generic Electron templates): pnpm, Electron Forge,
> Drizzle/Prisma/any ORM, React Query / TanStack Query.

See CLAUDE.md at the repo root for the fuller architecture tour.

## Navigation

| Area                                     | Index                              | Covers                                                          |
| ---------------------------------------- | ---------------------------------- | --------------------------------------------------------------- |
| [Backend](./backend/index.md)            | main-process patterns              | IPC protocol, agent runtime, extensions, sandbox, DB, MCP, etc. |
| [Frontend](./frontend/index.md)          | renderer patterns                  | Zustand store, IPC hook, components, i18n, React pitfalls       |
| [Shared](./shared/index.md)              | cross-cutting standards            | code quality, TypeScript, git, timestamps, npm/build, testing   |
| [Guides](./guides/index.md)              | pre-implementation thinking guides | cross-layer, code reuse, DB schema change, transactions, etc.   |
| [Big Questions](./big-question/index.md) | known pitfalls                     | native-module packaging, IPC wiring, timestamps, transactions   |

### Shared

- [Code Quality](./shared/code-quality.md)
- [TypeScript Conventions](./shared/typescript.md)
- [Git Conventions](./shared/git-conventions.md)
- [Timestamp & Boolean Conventions](./shared/timestamp.md)
- [npm + Electron Setup](./shared/npm-electron-setup.md)
- [Testing](./shared/testing.md)

### Backend

- [Directory Structure](./backend/directory-structure.md)
- [IPC Protocol](./backend/ipc-protocol.md)
- [Database](./backend/database.md)
- [Error Handling](./backend/error-handling.md)
- [Logging](./backend/logging.md)
- [Type Safety](./backend/type-safety.md)
- [Quality](./backend/quality.md)

> The backend index (and any agent-runtime / extensions / config-providers /
> sandbox / remote / headless / mcp / skills / memory / schedule pages it links)
> is the authoritative list for the main process — start at
> [backend/index.md](./backend/index.md).

### Frontend

- [Directory Structure](./frontend/directory-structure.md)
- [State Management (Zustand)](./frontend/state-management.md)
- [IPC (electronAPI / useIPC)](./frontend/ipc-electron.md)
- [Components](./frontend/components.md)
- [Hooks](./frontend/hooks.md)
- [Type Safety](./frontend/type-safety.md)
- [React Pitfalls](./frontend/react-pitfalls.md)
- [Quality](./frontend/quality.md)

### Guides

- [Pre-Implementation Checklist](./guides/pre-implementation-checklist.md)
- [Cross-Layer Thinking Guide](./guides/cross-layer-thinking-guide.md)
- [Code Reuse Thinking Guide](./guides/code-reuse-thinking-guide.md)
- [Bug Root Cause Thinking Guide](./guides/bug-root-cause-thinking-guide.md)
- [DB Schema Change Guide](./guides/db-schema-change-guide.md)
- [Transaction Consistency Guide](./guides/transaction-consistency-guide.md)
- [Semantic Change Checklist](./guides/semantic-change-checklist.md)

### Big Questions / Pitfalls

- [Native Module Packaging](./big-question/native-module-packaging.md)
- [Native Module Complex Dependencies](./big-question/native-module-complex-deps.md)
- [IPC Event Wiring](./big-question/ipc-handler-registration.md)
- [Timestamp Precision](./big-question/timestamp-precision.md)
- [Transaction Silent Failure](./big-question/transaction-silent-failure.md)

## Before every commit (CI gate)

```bash
npm run lint        # any = failure
npx tsc --noEmit
npx vitest run
```

See [shared/git-conventions.md](./shared/git-conventions.md) for the commit
format and pre-commit guards.

---

**Language**: All documentation is written in **English**.
