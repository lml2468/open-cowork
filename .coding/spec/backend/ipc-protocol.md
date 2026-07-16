# IPC Protocol — The Spine

> Renderer ↔ main communicate through **one typed event protocol**, not
> scattered `ipcRenderer.on/send` channels. Two discriminated unions define the
> whole session/UI contract. Learn this before adding any cross-boundary feature.

## The two unions

Both live in `src/renderer/types/index.ts` and are imported by the main process:

- `ClientEvent` (~L359) — renderer → main. Every variant is
  `{ type: '<ns>.<verb>'; payload: {...} }`, e.g. `session.start`,
  `session.continue`, `permission.response`, `workdir.set`.
- `ServerEvent` (~L432) — main → renderer. Same shape, e.g. `stream.message`,
  `stream.partial`, `trace.step`, `session.status`, `permission.request`,
  `error`. A few variants carry no payload (`new-session`).

## Preload bridge

`src/preload/index.ts` exposes `window.electronAPI` via `contextBridge` — the
renderer never touches `ipcRenderer` directly. Three primitives:

- `send(event)` → `ipcRenderer.send('client-event', event)` (fire-and-forget).
- `invoke(event)` → `ipcRenderer.invoke('client-invoke', event)` (request/response).
- `on(callback)` → subscribes to the `server-event` channel. It is
  **single-listener**: registering a new callback removes the previous one and
  returns a cleanup function.

### SECURITY: the outbound allowlist

`ALLOWED_CLIENT_EVENTS` (a `ReadonlySet<string>`, ~L44 in the preload) gates
**both** `send` and `invoke`. An event whose `type` is not in the set is
silently dropped (`send` warns + returns; `invoke` throws
`Unauthorized event type`). This prevents a compromised renderer from spoofing
arbitrary IPC channels — and it means **a newly added `ClientEvent` type is
silently blocked until you add it to this set.**

There is no equivalent allowlist for `ServerEvent`; the outbound path is
trusted (main → renderer).

## Main-process dispatch

- `handleClientEvent(event)` in `src/main/index.ts` (~L3172) is the central
  `switch (event.type)` dispatcher for every `ClientEvent`.
- `sendToRenderer(event)` (~L748) is the **single outbound sink** for every
  `ServerEvent`. It first inspects the event for a remote session
  (`remoteManager.isRemoteSession`) and tees relevant events to the remote
  channel, then forwards to the renderer via the active event sender /
  `webContents.send('server-event', event)`.
- `eventRequiresSessionManager(event)` in `src/main/client-event-utils.ts`
  returns `true` for session-dependent events (`session.*`,
  `permission.response`); `handleClientEvent` throws
  `Session manager not initialized` if such an event arrives before the
  `SessionManager` exists.

## THE pattern — add a `ClientEvent`

Exactly five steps (skip any and it silently breaks):

1. Add the variant to the `ClientEvent` union in `src/renderer/types/index.ts`.
2. Add its `type` string to `ALLOWED_CLIENT_EVENTS` in `src/preload/index.ts`
   — **without this the event never leaves the renderer.**
3. Add a `case` in `handleClientEvent` (`src/main/index.ts`).
4. If it needs an initialized `SessionManager`, add its `type` to
   `eventRequiresSessionManager` in `src/main/client-event-utils.ts`.
5. (Optional) Add a typed helper on `window.electronAPI` in the preload (like the
   `session.compact` / `session.getContextUsage` helpers) and declare it on the
   `global` `electronAPI` type.

## Add a `ServerEvent`

1. Add the variant to the `ServerEvent` union in `src/renderer/types/index.ts`.
2. Emit it through `sendToRenderer(...)` (never `webContents.send` directly —
   that bypasses remote-session teeing).
3. Handle it in the renderer's single `on(...)` switch. No allowlist needed.

## Non-session RPC namespaces

Config, MCP, skills, plugins, sandbox, remote, window controls, dialogs, etc.
do **not** go through the unions. They use dedicated
`ipcRenderer.invoke('<ns>.<method>', ...)` calls (grouped under
`window.electronAPI.config.*`, `.mcp.*`, `.skills.*`, `.plugins.*`,
`.sandbox.*`, …) matched by `ipcMain.handle('<ns>.<method>', ...)` in
`src/main/index.ts`. These are typed by their helper signatures, not by
`ClientEvent`. Use this style for stateless request/response APIs; use the
`ClientEvent`/`ServerEvent` unions for anything streaming or session-scoped.

## Anti-patterns

- Inventing a new raw channel (`ipcRenderer.on('my-thing')`) for something that
  belongs in `ServerEvent`.
- Calling `ipcRenderer` from the renderer instead of `window.electronAPI`.
- Adding a `ClientEvent` variant but forgetting the `ALLOWED_CLIENT_EVENTS`
  entry (symptom: event silently does nothing).
- Emitting a `ServerEvent` via `webContents.send` directly (skips remote teeing
  in `sendToRenderer`).
