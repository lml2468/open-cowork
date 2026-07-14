# IPC Contract

Renderer and main communicate through **one typed event protocol**, not scattered
`ipcRenderer` channels. This is the spine of the app; adding features that cross the
boundary means extending the protocol, not opening a new channel.

## The two unions

Both are defined in `src/renderer/types/index.ts`:

- `ClientEvent` (union starts at `src/renderer/types/index.ts:378`) — renderer → main.
- `ServerEvent` (union starts at `src/renderer/types/index.ts:451`) — main → renderer.

When you add a feature that crosses the boundary, **add a variant to the relevant
union** and handle it — do not add a bespoke channel.

## Transport (fixed — do not add channels)

Defined in `src/preload/index.ts`, exposed to the renderer over `contextBridge` as
`window.electronAPI`:

- Fire-and-forget renderer → main: `ipcRenderer.send('client-event', event)`
  (`src/preload/index.ts:89`).
- Request/response renderer → main: `ipcRenderer.invoke('client-invoke', event)`
  (`src/preload/index.ts:76`).
- Main → renderer push: `mainWindow.webContents.send('server-event', event)` (see
  `src/main/index.ts`, e.g. lines ~299/394 for `navigate` / `new-session`).

There are exactly three channels: `client-event`, `client-invoke`, `server-event`.
New message types ride these channels as new union members.

## Dispatch

Every `ClientEvent` is dispatched in `handleClientEvent` in `src/main/index.ts`. A new
`ClientEvent` variant must get a branch there. A new `ServerEvent` variant must be
consumed on the renderer side through the Zustand store (see the `renderer` layer),
never read as an untyped payload with local casts.

## Reusable shared types (`src/shared/`)

Stable data shapes that both processes use live in `src/shared/` and are imported by
both sides — examples: `src/shared/ipc-types.ts` (e.g. `McpServerStatus`),
`src/shared/schedule/`, `src/shared/api-model-presets.ts`, `src/shared/session-title.ts`,
`src/shared/workspace-path.ts`. Put a new cross-boundary data type here rather than
redefining it in each process.

## Anti-patterns

- Adding `ipcRenderer.on('my-new-channel', …)` / `ipcMain.handle('my-new-channel', …)`
  for a feature — breaks the single-protocol model. Extend the unions instead.
- Reading a `ServerEvent`/`ClientEvent` payload field via `(payload as SomeType)` at a
  call site. Type it on the union so all consumers share one definition.
- Importing Electron, React, or Node-only APIs into a `src/shared` type module.
