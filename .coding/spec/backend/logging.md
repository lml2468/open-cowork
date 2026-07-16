# Logging & Native-Module Packaging

> There is **no third-party logging library** (no `electron-log`). Logging is a
> small custom function-based module, `src/main/utils/logger.ts`.

## The logger — `src/main/utils/logger.ts`

Plain exported functions (there is no logger class and no `logger.scope()`):

- `log(...)`, `logWarn(...)`, `logError(...)` — write to console and to a rotated
  file (`<userData>/logs/app-*.log`, 10 MB / 5-file rotation).
- `logCtx(...)`, `logCtxWarn(...)`, `logCtxError(...)` — context-aware variants
  that prefix the line with the current session/trace id.
- `logTiming(label, startTime)` — logs an elapsed-ms measurement.

Import them directly:

```ts
import { log, logError, logCtxError } from '../utils/logger';
```

## Structured context via AsyncLocalStorage

The context prefix comes from an `AsyncLocalStorage<LogContext>`
(`logStorage`). Wrap a unit of work so all nested (including async) `logCtx*`
calls carry `sessionId`/`traceId` automatically:

```ts
import { runWithLogContext, generateTraceId } from '../utils/logger';

runWithLogContext({ sessionId, traceId: generateTraceId() }, async () => {
  // logCtx/logCtxError inside here are auto-prefixed [sid:...][tid:...]
});
```

`generateTraceId()` returns 8 hex chars. `SessionManager.processPrompt` uses
`runWithLogContext` around each turn.

## Native-module packaging

`better-sqlite3` is a native module and must be rebuilt against **Electron's
ABI** — the `npm install` postinstall / `npm run rebuild` step does this
(see CLAUDE.md). In `vite.config.ts` it is in `rollupOptions.external`
(alongside `bufferutil`, `utf-8-validate`) so Vite doesn't try to bundle the
`.node` binary.

## Anti-patterns

- Adding `electron-log` or any log library — use `src/main/utils/logger.ts`.
- `console.log` directly in main-process code (use `log`/`logCtx`).
- Calling `logCtx*` outside a `runWithLogContext` scope and expecting a context
  prefix.
- Bundling `better-sqlite3` instead of externalizing it.
