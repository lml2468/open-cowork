# IPC Event Wiring Issues

> **Severity**: P1 - Feature completely broken across the renderer/main boundary

## Problem

You add a new renderer→main action, wire up the main-side logic, TypeScript
compiles, but at runtime the call does nothing — or the preload throws
`Unauthorized event type: ...`.

## This repo does NOT use per-channel `ipcMain.handle`

Unlike the classic "one `ipcMain.handle('feature:doSomething', ...)` per feature"
pattern, open-cowork routes **everything through a single typed event protocol**:

- Renderer → main: `ClientEvent` objects.
  - Fire-and-forget: `window.electronAPI.send(event)` → `ipcRenderer.send('client-event', ...)`.
  - Request/response: `window.electronAPI.invoke(event)` → `ipcRenderer.invoke('client-invoke', ...)`.
- Main → renderer: `ServerEvent` objects pushed on the `server-event` channel.
- Both unions live in `src/renderer/types/index.ts`.
- `src/main/index.ts` dispatches every incoming `ClientEvent` in
  `handleClientEvent` — a single `switch (event.type)`.

There is exactly one main-side listener each for `client-event` and
`client-invoke`; you do **not** register a new channel per feature.

## The wiring chain

```
Renderer store/component
    | window.electronAPI.send / invoke  (ClientEvent)
    v
Preload (src/preload/index.ts)
    | ALLOWED_CLIENT_EVENTS allowlist check  <-- easy to forget!
    v
ipcRenderer.send('client-event') / invoke('client-invoke')
    v
Main (src/main/index.ts)
    | handleClientEvent(event)
    v
switch (event.type) { case 'your.event': ... }   <-- must add a case
```

## Root Cause & the two easy-to-miss steps

Adding a new `ClientEvent` requires updating **both** ends plus the allowlist:

### 1. The preload allowlist (`ALLOWED_CLIENT_EVENTS`)

`src/preload/index.ts` keeps an allowlist of valid `ClientEvent['type']` values
to stop the renderer from spoofing arbitrary IPC. Both `send` and `invoke` check
it:

```typescript
const ALLOWED_CLIENT_EVENTS: ReadonlySet<string> = new Set<ClientEvent['type']>([
  'session.start',
  'session.continue',
  // ...
  'workdir.select',
]);
```

If your new event type isn't in this set, `send` silently drops it (logs
`Blocked unauthorized event type`) and `invoke` **throws**
`Unauthorized event type: <type>`. This is the #1 "my new event does nothing"
cause.

### 2. The `handleClientEvent` switch (`src/main/index.ts`)

Add a `case 'your.event':` to the `switch (event.type)` in `handleClientEvent`.
Because `tsconfig.json` sets `noFallthroughCasesInSwitch`, each case must
`return`/`break`. A missing case means the event reaches main and is ignored.

> Note the headless path also runs `handleClientEvent` (see `--headless` in
> `src/main/index.ts`), so a correct case works for both GUI and headless.

## Debugging Checklist

When a renderer→main action does nothing:

1. **Is the type in `ALLOWED_CLIENT_EVENTS`?** (preload)
   ```bash
   rg "your.event" src/preload/index.ts
   ```
2. **Is the type in both unions?** (`ClientEvent` for the request,
   `ServerEvent` for any pushed reply)
   ```bash
   rg "your.event" src/renderer/types/index.ts
   ```
3. **Is there a `case` in `handleClientEvent`?** (main)
   ```bash
   rg "case 'your.event'" src/main/index.ts
   ```
4. **Fire-and-forget vs request/response** — `send` returns nothing; use
   `invoke` if you need the result.

## Key Insight

**In a single-protocol IPC design, "adding a handler" means extending the typed
unions + the allowlist + the dispatch switch — not registering a new channel.**
Trace the chain from `window.electronAPI` through `ALLOWED_CLIENT_EVENTS` to
`handleClientEvent`; a break at any of those three points silently kills the
feature.
