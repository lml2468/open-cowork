# Backend Development Guidelines Index

> **Stack**: Electron main process (Node) · raw `better-sqlite3` (no ORM) ·
> embedded OpenAI Codex `app-server` agent backend · typed IPC event protocol.

## Related Guidelines

| Guideline                 | Location     | When to Read                 |
| ------------------------- | ------------ | ---------------------------- |
| **Shared Code Standards** | `../shared/` | Always - applies to all code |

## Documentation Files

| File                                               | Description                                                       | When to Read                         |
| -------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------ |
| [directory-structure.md](./directory-structure.md) | Real `src/main/` subsystem layout and what each owns              | Starting anything                    |
| [ipc-protocol.md](./ipc-protocol.md)               | The `ClientEvent`/`ServerEvent` unions, preload bridge, allowlist | Any renderer↔main feature            |
| [agent-runtime.md](./agent-runtime.md)             | SessionManager → CoworkAgentRunner → CodexRuntime execution path  | Touching the agent loop / streaming  |
| [extensions.md](./extensions.md)                   | `AgentRuntimeExtension`s + codex host `dynamic_tools`             | Adding an agent tool / prompt prefix |
| [config-providers.md](./config-providers.md)       | Encrypted config store, provider routing, `buildCodexModelConfig` | Config fields, adding a provider     |
| [database.md](./database.md)                       | Raw better-sqlite3, typed facade, `ensureColumn`, transactions    | Any persistence work                 |
| [error-handling.md](./error-handling.md)           | `catch (e: unknown)`, transaction throw, fail-closed permissions  | Handling errors                      |
| [logging.md](./logging.md)                         | Custom `utils/logger.ts` + native-module packaging                | Debugging, packaging                 |
| [type-safety.md](./type-safety.md)                 | TS strict, no `any`, discriminated unions (no Zod)                | Type decisions                       |
| [quality.md](./quality.md)                         | Import aliases, prettier, CI gate, Vite externals                 | Before committing                    |

### Subsystem Guides

| File                         | Description                                                  | When to Read                     |
| ---------------------------- | ------------------------------------------------------------ | -------------------------------- |
| [headless.md](./headless.md) | Headless `-p` / `--mode rpc` / `--mode stdio` RPC surface    | Scripting the main process       |
| [mcp.md](./mcp.md)           | MCP server lifecycle (`src/main/mcp/`), native codex wiring  | MCP servers/tools                |
| [memory.md](./memory.md)     | Agent-managed Markdown memory (`src/main/memory/`)           | Memory features                  |
| [remote.md](./remote.md)     | Feishu/Slack/WS/stdio channels + router (`src/main/remote/`) | Remote control                   |
| [sandbox.md](./sandbox.md)   | Path guards + Lima/WSL VM isolation (`src/main/sandbox/`)    | Command/file execution isolation |
| [schedule.md](./schedule.md) | Timer-based scheduled tasks (`src/main/schedule/`)           | Scheduled tasks                  |
| [skills.md](./skills.md)     | File-based skills + plugin registry (`src/main/skills/`)     | Skills / plugins                 |

## Core Rules Summary

| Rule                                                                        | Reference                                    |
| --------------------------------------------------------------------------- | -------------------------------------------- |
| Cross-boundary features extend the `ClientEvent`/`ServerEvent` unions       | [ipc-protocol.md](./ipc-protocol.md)         |
| A new `ClientEvent` type MUST be added to `ALLOWED_CLIENT_EVENTS` (preload) | [ipc-protocol.md](./ipc-protocol.md)         |
| Emit server events only via `sendToRenderer`                                | [ipc-protocol.md](./ipc-protocol.md)         |
| Keep `CodexEventTranslator` pure and Electron-free                          | [agent-runtime.md](./agent-runtime.md)       |
| Host `dynamic_tools` register at `thread/start` only                        | [agent-runtime.md](./agent-runtime.md)       |
| A new extension goes in BOTH manager lists in `index.ts`                    | [extensions.md](./extensions.md)             |
| Custom-tool `parameters` are TypeBox schemas                                | [extensions.md](./extensions.md)             |
| API keys live only in the encrypted store; env-only for codex               | [config-providers.md](./config-providers.md) |
| Round-trip config fields need a `FIELD_VALIDATORS` entry                    | [config-providers.md](./config-providers.md) |
| Providers must speak OpenAI Responses (`wire_api: 'responses'`)             | [config-providers.md](./config-providers.md) |
| No ORM/migrations; use the `db.*` facade + `ensureColumn`                   | [database.md](./database.md)                 |
| Timestamps = integer epoch ms (`Date.now()`)                                | [database.md](./database.md)                 |
| Transaction bodies must throw, not silently return                          | [error-handling.md](./error-handling.md)     |
| `catch (e: unknown)` + type guards; never `any`                             | [error-handling.md](./error-handling.md)     |
| Fail closed: unwired permission = deny                                      | [error-handling.md](./error-handling.md)     |
| No third-party log lib; use `utils/logger.ts`                               | [logging.md](./logging.md)                   |
| Discriminated unions, not Zod                                               | [type-safety.md](./type-safety.md)           |
| `electron-store`/`uuid` stay bundled; heavy CJS deps externalized           | [quality.md](./quality.md)                   |

## Reference Files

| Feature                         | Location                                                    |
| ------------------------------- | ----------------------------------------------------------- |
| IPC unions (Client/ServerEvent) | `src/renderer/types/index.ts`                               |
| Preload context bridge          | `src/preload/index.ts`                                      |
| IPC dispatch + outbound sink    | `src/main/index.ts` (`handleClientEvent`, `sendToRenderer`) |
| Session manager                 | `src/main/session/session-manager.ts`                       |
| Agent runner                    | `src/main/agent/agent-runner.ts`                            |
| Codex runtime                   | `src/main/agent/codex-runtime/`                             |
| Runtime extensions              | `src/main/extensions/`                                      |
| Config store                    | `src/main/config/config-store.ts`                           |
| Codex model config (pure)       | `src/main/agent/codex-runtime/codex-model-config.ts`        |
| Database                        | `src/main/db/database.ts`                                   |
| Logger                          | `src/main/utils/logger.ts`                                  |

---

**Language**: All documentation must be written in **English**.
