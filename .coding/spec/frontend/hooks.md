# Custom Hooks

> Custom hooks in `src/renderer/hooks/` encapsulate cross-component logic:
> read the store via `useAppStore`/selectors, derive with `useMemo`, return a
> typed object (or `null`).

---

## Hook shape

The standard shape (see `useContextUsage.ts`):

1. Subscribe to the minimum store slices via `useAppStore(...)` or a selector
   from `store/selectors.ts`.
2. Derive the result inside `useMemo(...)` keyed on those inputs.
3. Return a **typed** object, or `null` when there's nothing to show.

`useContextUsage` (`hooks/useContextUsage.ts:18`) is the model: it reads
`activeSessionId` and the session's `contextWindow` with scalar selectors, reads
messages via `useActiveSessionMessages()`, and returns
`ContextUsageInfo | null`. `useWindowSize` (`hooks/useWindowSize.ts`) shows the
local-state variant: `useState` + a RAF-throttled `resize` listener returning
`{ width, height }`.

Naming: `use`-prefixed, camelCase, one hook per file.

---

## The hooks that exist (`src/renderer/hooks/`)

| Hook                          | Purpose                                                                                                                                                                                              |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useIPC.ts`                   | Central IPC hook — see `ipc-electron.md`. Installs the single server-event listener, hosts the `ServerEvent` switch + RAF batching, and returns typed `startSession`/`continueSession`/etc. helpers. |
| `useApiConfigState.ts`        | API/provider config editing state. **Size anti-pattern** (~67 KB) — do not treat it as a template; new config logic should be decomposed.                                                            |
| `useContextUsage.ts`          | Real-time context-window usage for the active session (`ContextUsageInfo \| null`).                                                                                                                  |
| `useSubagentProgress.ts`      | Tracks subagent progress; `handleSubagentProgressEvent` is called from `useIPC`'s `subagent.progress` case.                                                                                          |
| `useCompactionHistory.ts`     | Exposes the active session's compaction event list.                                                                                                                                                  |
| `useSmoothedStreamingText.ts` | Smooths streamed partial text for display.                                                                                                                                                           |
| `useFocusTrap.ts`             | Focus-trap for modals/dialogs.                                                                                                                                                                       |
| `useWindowSize.ts`            | RAF-throttled window dimensions.                                                                                                                                                                     |

---

## Rules

- **Read state through the store, not props drilling.** Hooks that need session
  state use `useAppStore`/selectors directly (`useContextUsage`,
  `useCompactionHistory`).
- **Do not register a second `server-event` listener.** IPC listening is owned
  exclusively by `useIPC` (single-slot bridge — see `ipc-electron.md`). A hook
  that needs a server event reacts to store changes that `useIPC` already writes,
  or plugs into `useIPC`'s switch (as `useSubagentProgress` does via
  `handleSubagentProgressEvent`).
- **Memoize derived objects/arrays** so consumers don't re-render on every store
  tick — return values should be reference-stable when inputs are unchanged.
- **Return `null`, not `undefined` or a partial object, for the "nothing" case**
  (`useContextUsage` returns `null`), so call sites branch cleanly.
- **Keep hooks focused.** `useApiConfigState.ts` is the cautionary example of a
  hook that grew too large; split new logic into smaller hooks.
