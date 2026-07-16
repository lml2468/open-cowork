# Open Cowork — Frontend (Renderer) Guidelines

> Source-backed guidance for the `src/renderer/` React app of the Open Cowork
> Electron desktop agent. Every rule points at a real file + symbol.

## Tech Stack

- **Framework**: Electron + React 18 (function components + hooks only)
- **Build Tool**: Vite
- **Language**: TypeScript (strict, `no-explicit-any` = error)
- **State**: a single Zustand store (`useAppStore`) + `useShallow` selectors —
  no Redux, no React Context for shared state, no React Query
- **Styling**: Tailwind CSS only, driven by semantic CSS-variable tokens in
  `styles/globals.css` — no CSS Modules, no `cn`/`clsx`
- **Icons**: `lucide-react` only
- **i18n**: i18next (`en` + `zh`, structural parity required)
- **IPC**: typed `ClientEvent`/`ServerEvent` unions over `window.electronAPI`

---

## Documentation Files

| File                                               | Description                                                      | Priority      |
| -------------------------------------------------- | ---------------------------------------------------------------- | ------------- |
| [state-management.md](./state-management.md)       | The single Zustand store, per-session `sessionStates`, selectors | **Must Read** |
| [ipc-electron.md](./ipc-electron.md)               | `window.electronAPI`, `useIPC` single listener, RAF batching     | **Must Read** |
| [components.md](./components.md)                   | Component conventions, Tailwind tokens, lucide, `memo`, size cap | **Must Read** |
| [i18n.md](./i18n.md)                               | i18next usage + en/zh parity invariant                           | **Must Read** |
| [type-safety.md](./type-safety.md)                 | Strict TS, no `any`, discriminated unions, path aliases          | Reference     |
| [hooks.md](./hooks.md)                             | Custom hook conventions + the 8 real hooks                       | Reference     |
| [react-pitfalls.md](./react-pitfalls.md)           | React bugs that bite this stack (streaming, unmounting panels)   | Reference     |
| [directory-structure.md](./directory-structure.md) | Real `src/renderer/` layout                                      | Reference     |
| [quality.md](./quality.md)                         | CI gate, coverage exclusion, renderer quality rules              | Reference     |

---

## Core Rules Summary

| Rule                                                               | Reference                                    |
| ------------------------------------------------------------------ | -------------------------------------------- |
| **One Zustand store**; reads via `use`-prefixed selectors          | [state-management.md](./state-management.md) |
| Per-session data → `sessionStates` record + `patchSession`         | [state-management.md](./state-management.md) |
| Multi-field selectors use `useShallow`; scalars don't              | [state-management.md](./state-management.md) |
| Only the first `useIPC()` installs the `server-event` listener     | [ipc-electron.md](./ipc-electron.md)         |
| High-frequency events are RAF-batched into per-session buffers     | [ipc-electron.md](./ipc-electron.md)         |
| New `ClientEvent` type → add to `ALLOWED_CLIENT_EVENTS` in preload | [ipc-electron.md](./ipc-electron.md)         |
| Tailwind + semantic tokens only; icons from `lucide-react`         | [components.md](./components.md)             |
| Every string in BOTH `en.json` and `zh.json`                       | [i18n.md](./i18n.md)                         |
| No `any` (eslint error); narrow discriminated unions on `type`     | [type-safety.md](./type-safety.md)           |

---

## Architecture Overview

```
+-----------------------------------------------------------+
|                     Main Process (src/main)               |
|   SessionManager · CoworkAgentRunner · config · sandbox   |
+-----------------------------+-----------------------------+
                              |  ClientEvent  ^  ServerEvent
        ipcRenderer.send/invoke |            | ipcRenderer.on('server-event')
                              v  |           |
+-----------------------------+-----------------------------+
|            Preload (src/preload/index.ts)                 |
|  contextBridge.exposeInMainWorld('electronAPI', {...})    |
|  send/invoke gated by ALLOWED_CLIENT_EVENTS               |
+-----------------------------+-----------------------------+
                              |  window.electronAPI
                              v
+-----------------------------------------------------------+
|             Renderer Process (src/renderer)               |
|  useIPC (single listener + ServerEvent switch + RAF)      |
|      → useAppStore (one Zustand store, sessionStates)     |
|      → selectors.ts (useShallow)  → React components      |
+-----------------------------------------------------------+
```

The wire contract is the `ClientEvent` / `ServerEvent` discriminated unions in
`src/renderer/types/index.ts`. Extend those unions for any cross-boundary
feature — never invent a new raw IPC channel from the renderer.

---

**Language**: All documentation is written in **English**.
