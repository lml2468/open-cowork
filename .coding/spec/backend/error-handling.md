# Error Handling

> Only the rules that actually hold in this codebase. Keep it short and real.

## Catch as `unknown`, narrow with type guards

`@typescript-eslint/no-explicit-any` is an **error** (`.eslintrc.cjs`), so
`catch (e: any)` fails lint and is rejected in review. Always:

```ts
try {
  await run();
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
}
```

This is the pattern used throughout, e.g. the `processPrompt` catch in
`src/main/session/session-manager.ts` (~L774).

## Transaction bodies must throw, never silently return

Transactions run through native `db.raw.transaction(fn)()` (see `database.md`).
A failure inside the body must **throw** so better-sqlite3 rolls back — a silent
`return` leaves a partial write committed. See the transaction call sites in
`session-manager.ts:124`, `session-manager.ts:1085`, and
`trace-step-write-queue.ts:96`.

## The turn error path

`SessionManager.processPrompt` (`src/main/session/session-manager.ts`) wraps the
agent run in try/catch (~L774). On a thrown turn, unless the error is flagged
`alreadyReportedToUser`, it:

1. saves an assistant message `**Error**: <message>`,
2. emits `stream.message` for it, then
3. emits an `error` `ServerEvent`.

So a failed turn always surfaces to the user exactly once — don't double-report.

## Fail closed on permissions

The headless / remote surfaces default the permission answer to **deny**. In
`CodexPermissionBridge` (`src/main/agent/codex-runtime/codex-permission-bridge.ts`),
an `ask` verdict with **no prompt handler wired** resolves to `decline` — never
auto-allow. Preserve this: when in doubt, deny.

## Anti-patterns

- `catch (e: any)` (lint error).
- Swallowing an error silently inside a transaction and returning.
- Re-reporting an already-reported turn error.
- Auto-allowing a permission when no interactive prompt is available.
