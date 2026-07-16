# Directory Structure

> The real layout of the Open Cowork Electron main process. There is **no**
> `services/{domain}/`, no `ipc/` handler folder, no Drizzle `db/schema.ts`.
> Code is organized by **subsystem**, each owning a coherent slice of behavior.

Electron three-process split lives under `src/`:

- `src/main/` — Node/main process (everything below).
- `src/preload/` — the context bridge (`src/preload/index.ts`).
- `src/renderer/` — React UI. The IPC type unions also live here
  (`src/renderer/types/index.ts`) and are imported by the main process.
- `src/shared/` — types/helpers shared by main + renderer (`ipc-types.ts`,
  `workspace-path.ts`, `local-file-path.ts`, `session-title.ts`, presets, etc.).

## Top-level main-process files

| File                            | Owns                                                                                                                                                                                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts`                      | App bootstrap, window lifecycle, **all IPC wiring**. `handleClientEvent` (the `ClientEvent` dispatcher, ~L3172) and `sendToRenderer` (the outbound sink, ~L748) live here. Builds the two `AgentRuntimeExtensionManager`s (GUI + headless). |
| `client-event-utils.ts`         | `eventRequiresSessionManager(event)` — gates which `ClientEvent`s require an initialized `SessionManager`.                                                                                                                                  |
| `nav-server.ts`                 | CLI-driven UI navigation server (emits `navigate.to` server events).                                                                                                                                                                        |
| `preflight.ts`                  | Packaged-mode startup check that bundled resources (node/python/mcp) exist (`app.isPackaged` only).                                                                                                                                         |
| `workspace-path-constraints.ts` | `getWorkspacePathUnsupportedReason(cwd)` — platform/sandbox workspace path validation used by `session.start`.                                                                                                                              |

## Subsystem directories

| Dir                                         | Owns                                                                                                                                                                                                                                                                                  |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agent/`                                    | The agent execution path. `agent-runner.ts` (`CoworkAgentRunner`), `subagent-extension.ts`, loop guard, message-end assembly, think-tag parser. See `agent-runtime.md`.                                                                                                               |
| `agent/codex-runtime/`                      | Integration with the embedded `codex app-server`: `codex-client.ts` (process supervisor + JSON-RPC), `codex-runtime.ts` (session↔thread + turns), `codex-event-translator.ts` (pure transform), permission/tool bridges, adapters, `codex-model-config.ts`, `codex-shared-client.ts`. |
| `config/`                                   | `config-store.ts` (encrypted store, `AppConfig`, `configStore`), `config-extension.ts` (agent config tools), `config-file-watcher.ts` (plaintext round-trip), API diagnostics, auth utils, permission-rules store. See `config-providers.md`.                                         |
| `db/`                                       | `database.ts` — the **entire** persistence layer (raw `better-sqlite3`, typed facade). No ORM, no migrations dir. See `database.md`.                                                                                                                                                  |
| `extensions/`                               | `AgentRuntimeExtension` interfaces + `AgentRuntimeExtensionManager`. See `extensions.md`.                                                                                                                                                                                             |
| `mcp/`                                      | MCP server lifecycle (`mcp-manager.ts`) over stdio/SSE/Streamable HTTP + OAuth + two bundled example servers.                                                                                                                                                                         |
| `memory/`                                   | Agent-managed Markdown memory: `memory-service.ts`, `markdown-memory.ts`, `memory-extension.ts`.                                                                                                                                                                                      |
| `remote/`                                   | Remote control. `RemoteManager`, `MessageRouter`, `channels/` (`channel-base.ts`, `stdio-channel.ts`, `feishu/`, `slack/`), tunnel/gateway. See CLAUDE.md.                                                                                                                            |
| `sandbox/`                                  | Layered isolation: `path-guard.ts`, `path-resolver.ts`, native executor, plus VM bridges (`lima-bridge.ts`/`wsl-bridge.ts`) and sync.                                                                                                                                                 |
| `sandbox/lima-agent/`, `sandbox/wsl-agent/` | **Standalone TypeScript projects** (each has its own `tsconfig.json`), compiled independently and bundled as resources — do not import them from the main bundle.                                                                                                                     |
| `session/`                                  | `session-manager.ts` (`SessionManager`: CRUD, prompt queue, persistence), `trace-step-write-queue.ts`, session-title flow. See `agent-runtime.md`.                                                                                                                                    |
| `skills/`                                   | Skill discovery/hot-reload + plugin registry/catalog/runtime services.                                                                                                                                                                                                                |
| `schedule/`                                 | Cron-like scheduled tasks (`scheduled-task-manager.ts`, `scheduled-task-store.ts`).                                                                                                                                                                                                   |
| `system/`                                   | System probes (`gpu-detection.ts`).                                                                                                                                                                                                                                                   |
| `tools/`                                    | Built-in tool execution + path containment (`tool-executor.ts`, `sandbox-tool-executor.ts`, `path-containment.ts`).                                                                                                                                                                   |
| `cli/`                                      | `headless-io.ts` — headless-mode argv parsing.                                                                                                                                                                                                                                        |
| `utils/`                                    | Cross-cutting helpers: `logger.ts` (see `logging.md`), `store-encryption.ts`.                                                                                                                                                                                                         |

## When adding code

- New behavior on an existing concept → extend the owning subsystem dir.
- New cross-boundary feature → extend the IPC unions first (see `ipc-protocol.md`).
- A genuinely new subsystem → new dir under `src/main/`, keep the boundary
  clean (e.g. the codex translator stays Electron-free — see `agent-runtime.md`).

## Anti-patterns

- Recreating a `services/{domain}/procedures/` tree — this repo does not use it.
- Adding a `db/schema.ts` / migrations folder (see `database.md`).
- Importing `sandbox/lima-agent` or `sandbox/wsl-agent` from the main bundle;
  they are separate compilation units shipped as resources.
