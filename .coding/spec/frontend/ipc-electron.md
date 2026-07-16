# IPC & Electron (renderer side)

> How the renderer talks to the main process. The wire contract is a single
> typed event protocol — extend the unions, never invent channels.

---

## The contract lives in `types/index.ts`

Renderer ↔ main communicate through two discriminated unions in
`src/renderer/types/index.ts`:

- `ClientEvent` (`types/index.ts:359`) — renderer → main (`session.start`,
  `session.continue`, `settings.update`, `permission.response`, …).
- `ServerEvent` (`types/index.ts:432`) — main → renderer (`stream.partial`,
  `trace.step`, `session.status`, `permission.request`, `config.status`, …).

When you add a feature that crosses the boundary, **extend these unions** and
handle the new case in `useIPC`'s switch. Do not add ad-hoc `ipcRenderer`
channels from the renderer — the renderer has no direct access to `ipcRenderer`
(context isolation); it only sees `window.electronAPI`.

---

## `window.electronAPI` and the `isElectron` guard

The preload (`src/preload/index.ts`) exposes `window.electronAPI` via
`contextBridge.exposeInMainWorld`. Because the same code can run under the Vite
dev server without a preload, every entry point guards on it:

```ts
const isElectron = typeof window !== 'undefined' && window.electronAPI !== undefined;
```

This exact guard is defined at `useIPC.ts:17` and repeated in `store/index.ts`
(`updateSettings`) and `App.tsx` (`handleConfigSave`). Any code that calls
`window.electronAPI` directly must guard first and provide a browser-mode
fallback (see the mock branches throughout `useIPC.ts`).

### Two low-level send paths (both gated by an allowlist)

`window.electronAPI` exposes:

- `send(event: ClientEvent): void` — one-way, no response (`ipcRenderer.send`).
- `invoke<T>(event: ClientEvent): Promise<T>` — request/response
  (`ipcRenderer.invoke`).

Both are gated in the preload by `ALLOWED_CLIENT_EVENTS`
(`preload/index.ts:44`), a `ReadonlySet` of valid `ClientEvent['type']` strings.
An event whose type is not in the set is **dropped** (`send`) or **rejected**
(`invoke` throws `Unauthorized event type`). **When you add a new `ClientEvent`
type you MUST also add it to `ALLOWED_CLIENT_EVENTS`**, or the renderer's call is
silently blocked.

### Namespaced convenience APIs

Beyond the generic `send`/`invoke`, the preload exposes typed namespaces that map
onto their own `ipcRenderer.invoke` channels (not the `ClientEvent` union):
`electronAPI.config.*`, `.mcp.*`, `.skills.*`, `.plugins.*`, `.remote.*`,
`.schedule.*`, `.memory.*`, `.sandbox.*`, `.artifacts.*`, `.window.*`,
`.logs.*`, plus `getSystemTheme`, `getVersion`, `openExternal`, `selectFiles`.
Use these directly (e.g. `window.electronAPI.config.save(...)` in
`App.tsx:141`, `window.electronAPI.mcp.getServerStatus()` in `useIPC.ts:812`).
Their full types are the `Window['electronAPI']` declaration at the bottom of
`preload/index.ts`.

---

## `useIPC`: the single listener + the ServerEvent switch

`src/renderer/hooks/useIPC.ts` is the central IPC hook. Two things make it
special:

### 1. Single-listener singleton

The preload's `on()` is a **single-slot bridge**: calling it again removes the
previous `server-event` listener (`preload/index.ts:91`). So `useIPC` guards
registration with a **module-level** `let ipcListenerInstalled = false`
(`useIPC.ts:25`). Only the FIRST `useIPC()` caller installs the listener; later
callers (PermissionDialog, Sidebar, ChatView, …) get the callback API but return
no cleanup, so unmounting them does not tear down the shared listener
(`useIPC.ts:36-41`).

**Anti-patterns:** calling `window.electronAPI.on(...)` from any component other
than the one shared `useIPC` install path; adding a second independent listener;
removing the `ipcListenerInstalled` guard. Any of these silently drops events
after the first re-register.

### 2. One big `switch (event.type)`

All incoming `ServerEvent`s are handled in a single `switch` inside the `on`
callback (`useIPC.ts:135`). Each case reads `useAppStore.getState()` and calls
store actions. A new `ServerEvent` type gets a new `case` here; the `default`
branch just logs unknown events (`useIPC.ts:345`).

---

## RAF-batching for high-frequency events

Three event types arrive many times per second and are **batched with
`requestAnimationFrame`** before touching the store, so React re-renders at most
once per frame:

- `stream.partial` → `bufferPartial` (`useIPC.ts:65`) → `flushPartials`
- `stream.thinking` → `bufferThinking` (`useIPC.ts:85`) → `flushThinking`
- `trace.step` / `trace.update` → `bufferTrace` (`useIPC.ts:112`) → `flushTraces`

Each buffer keys chunks per session, schedules a single RAF, and flushes into the
store in one pass. On unmount the cleanup cancels pending RAFs but flushes first
so no update is lost (`useIPC.ts:390-411`). When a final `stream.message`
arrives, its case deletes the pending partial/thinking buffers to avoid appending
stale chunks (`useIPC.ts:165`).

**Rule:** any new high-frequency streaming event you add MUST follow this
RAF-batching pattern, not call a store action directly on every event.

---

## Typed helpers returned by `useIPC`

Components should not call `send`/`invoke` with raw event objects when a helper
exists. `useIPC` returns typed wrappers (`useIPC.ts:815`): `startSession`,
`continueSession`, `stopSession`, `deleteSession`, `batchDeleteSessions`,
`listSessions`, `getSessionMessages`, `getSessionTraceSteps`,
`respondToPermission`, `respondToSudoPassword`, `selectFolder`, `getWorkingDir`,
`changeWorkingDir`, `getMCPServers`, plus the raw `send`/`invoke` and the
`isElectron` flag. Each helper handles the browser-mode mock and the optimistic
UI update (e.g. `startSession` adds the user message and activates the turn
before the backend responds).

---

## Adding a cross-boundary feature (renderer checklist)

1. Add the new `ClientEvent` and/or `ServerEvent` variant to
   `src/renderer/types/index.ts`.
2. If it's a `ClientEvent` sent via `send`/`invoke`, add its `type` to
   `ALLOWED_CLIENT_EVENTS` in `preload/index.ts`.
3. If it's a `ServerEvent`, add a `case` to the switch in `useIPC.ts`; if
   high-frequency, add a RAF buffer for it.
4. Expose a typed helper from `useIPC` (or a preload namespace method) rather
   than having components construct raw event objects.
