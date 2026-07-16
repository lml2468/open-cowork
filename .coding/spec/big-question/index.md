# Open Cowork Common Pitfalls

> Documented pitfalls for building/packaging open-cowork (Electron + Vite +
> React + raw better-sqlite3). Each entry points at real files in this repo.

## Severity Levels

| Level | Description                                   |
| ----- | --------------------------------------------- |
| P0    | App crashes or fails to start                 |
| P1    | Feature completely broken, data loss possible |
| P2    | Degraded experience, workaround exists        |

---

## By Category

### Packaging (Most Critical)

| Document                                                         | Severity | Summary                                       |
| ---------------------------------------------------------------- | -------- | --------------------------------------------- |
| [native-module-packaging.md](./native-module-packaging.md)       | P0       | Native modules missing after packaging        |
| [native-module-complex-deps.md](./native-module-complex-deps.md) | P0       | Native modules with many JS dependencies fail |

### IPC Communication

| Document                                                     | Severity | Summary                                            |
| ------------------------------------------------------------ | -------- | -------------------------------------------------- |
| [ipc-handler-registration.md](./ipc-handler-registration.md) | P1       | New ClientEvent not in allowlist / dispatch switch |

### Database

| Document                                                         | Severity | Summary                                                |
| ---------------------------------------------------------------- | -------- | ------------------------------------------------------ |
| [timestamp-precision.md](./timestamp-precision.md)               | P1       | Timestamp precision mismatch (seconds vs milliseconds) |
| [transaction-silent-failure.md](./transaction-silent-failure.md) | P1       | Transaction helper functions fail silently             |

---

## Quick Debugging Checklist

### App Crashes on Startup (P0)

1. `Cannot find module` / missing `.node` → [native-module-packaging.md](./native-module-packaging.md)
2. Native module has many JS deps → [native-module-complex-deps.md](./native-module-complex-deps.md)
3. `NODE_MODULE_VERSION` mismatch → rebuild for the right ABI (see
   `../shared/npm-electron-setup.md`)

### Renderer Action Does Nothing (P1)

1. Is the `ClientEvent` type in `ALLOWED_CLIENT_EVENTS`? → [ipc-handler-registration.md](./ipc-handler-registration.md)
2. Is there a `case` in `handleClientEvent` (`src/main/index.ts`)?
3. Is the type in the `ClientEvent`/`ServerEvent` unions (`src/renderer/types/index.ts`)?

### Data Not Persisting / Wrong Dates (P1)

1. Timestamp in seconds vs milliseconds → [timestamp-precision.md](./timestamp-precision.md)
2. Transaction helper returns silently on error → [transaction-silent-failure.md](./transaction-silent-failure.md)

---

## Technology Stack Coverage

These pitfalls were found while building open-cowork with:

- **Electron** + **electron-builder** (packaging via `electron-builder.yml`)
- **Vite** as bundler (`vite.config.ts`)
- **React 18** + **Zustand** + **Tailwind** for the renderer
- **better-sqlite3** for the local database (raw SQL, no ORM —
  `src/main/db/database.ts`)
- **TypeScript** throughout (strict; see `../shared/typescript.md`)
