# Shared Layer

> Cross-process types and the IPC contract that binds `main` ↔ `renderer`.

The shared layer is the **source of truth for anything that crosses the Electron
process boundary**. Code here is imported by both `src/main` and `src/renderer`, so
it must stay framework-free (no Electron, React, or Node-only APIs in the type
definitions themselves).

## Guidelines Index

| Guide                             | Description                                                     |
| --------------------------------- | --------------------------------------------------------------- |
| [IPC Contract](./ipc-contract.md) | The `ClientEvent` / `ServerEvent` unions and `src/shared` types |

## Pre-Development Checklist

Before adding or changing anything that crosses the process boundary:

- [ ] Are you adding a renderer→main message or main→renderer push? Extend the
      `ClientEvent` / `ServerEvent` unions in `src/renderer/types/index.ts` — do
      **not** invent a new `ipcRenderer` channel.
- [ ] Is the payload a stable, reusable shape (schedule task, MCP status, provider
      preset)? Put the type in `src/shared/` and import it from both sides, rather
      than redefining it per process.
- [ ] Does a similar type already exist in `src/shared/` or `src/renderer/types`?
      Reuse it instead of adding a parallel definition.

## Quality Check

- [ ] New cross-boundary message is a member of `ClientEvent` or `ServerEvent`,
      handled in `src/main/index.ts` `handleClientEvent`, and (if renderer-bound)
      consumed via the store, not read as an untyped payload.
- [ ] No `any`; payload fields are typed. Consumers do not cast raw payloads.
- [ ] Shared modules have no `import 'electron'` / React / DOM dependencies.
