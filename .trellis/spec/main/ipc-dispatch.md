# IPC Dispatch

The main process is driven by the typed event protocol (see the `shared` layer). This
file covers the main-side responsibilities.

## `handleClientEvent` is the single entry point

Every renderer→main `ClientEvent` is dispatched in `handleClientEvent` in
`src/main/index.ts`. Adding a renderer-triggered feature means:

1. Add a variant to the `ClientEvent` union in `src/renderer/types/index.ts`.
2. Add a branch for it in `handleClientEvent`.

Do not register a new `ipcMain.handle('some-channel', …)` for feature work — the app
uses exactly three channels (`client-event`, `client-invoke`, `server-event`), and
messages ride them as union members.

## Pushing to the renderer

Main → renderer updates are `ServerEvent`s sent via
`mainWindow.webContents.send('server-event', event)` (see `src/main/index.ts`, e.g. the
`navigate` and `new-session` sends). Streaming output and tool traces from the agent
also flow back as `ServerEvent`s.

## Pluggable event sender (GUI vs headless)

The event sender is pluggable: it defaults to the `mainWindow` IPC push but is swapped
for a JSONL sender in headless mode (`src/main/index.ts` around the "Pluggable event
sender" comment). When emitting `ServerEvent`s, go through the current sender rather
than referencing `mainWindow` directly, so headless mode keeps working.

## Headless / RPC surface

`src/main/index.ts` supports `--headless` (parsed in `src/main/cli/headless-io.ts` via
`parseHeadlessArgs()`) with sub-modes: `-p` one-shot JSON, `--mode rpc` (ClientEvent
JSONL loop), and `--mode stdio`. All modes gate on configured credentials before doing
work. This is the most scriptable surface for verifying main-process changes without a
display; keep it working when changing the event/dispatch path.

## Anti-patterns

- New `ipcMain.handle` / `ipcRenderer` channels for feature work.
- Emitting to the renderer by referencing `mainWindow` directly instead of the pluggable
  sender (breaks headless).
- A `ClientEvent` variant with no `handleClientEvent` branch.
