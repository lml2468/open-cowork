# IPC from the Renderer

The renderer reaches the main process **only** through `window.electronAPI` (exposed by
`src/preload/index.ts` over `contextBridge`) and the typed event protocol. It never
imports `src/main`.

## Sending to main

- Prefer the `useIPC` hook (`src/renderer/hooks/useIPC.ts`) for renderer→main calls; it
  wraps `window.electronAPI` and centralizes the send/invoke logic.
- Under the hood: fire-and-forget goes over `client-event`, request/response over
  `client-invoke` (see `src/preload/index.ts`). Do not call `ipcRenderer` directly or
  add a new channel.
- New renderer→main messages are added as `ClientEvent` variants in
  `src/renderer/types/index.ts` and handled in `src/main/index.ts` `handleClientEvent`
  (see the `shared` layer for the contract).

## Receiving from main

`ServerEvent`s (streaming deltas, session status, permission requests, `navigate`,
`new-session`, MCP status, …) arrive on the `server-event` channel. Consume them by
updating the Zustand store, then render from store state via selectors. Do not read a
`ServerEvent` payload with a local cast at a component; type it on the `ServerEvent`
union so all consumers share the definition.

## `isElectron` guard

The renderer can run in a plain browser (no `window.electronAPI`). Guard IPC-dependent
code with the `isElectron` check and provide a browser fallback, as `useIPC` and
`WelcomeView` do (e.g. skills fetch falls back to `[]` when not in Electron). New IPC
calls must degrade gracefully when `window.electronAPI` is undefined.

## Anti-patterns

- Importing anything from `src/main` into renderer code.
- Calling `window.electronAPI`/`ipcRenderer` for a new feature without a corresponding
  `ClientEvent`/`ServerEvent` union member.
- Assuming `window.electronAPI` exists without an `isElectron` guard.
