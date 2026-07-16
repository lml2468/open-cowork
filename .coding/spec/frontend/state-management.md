# State Management

> The renderer's client state lives in a **single Zustand store**. This is the
> most important frontend contract — read it before touching any renderer state.

---

## The one store: `useAppStore`

There is exactly ONE Zustand store in the renderer:
`src/renderer/store/index.ts` → `export const useAppStore = create<AppState>((set) => ({ ... }))`.

Facts to respect:

- **No middleware.** No `persist`, no `immer`, no `devtools`. State is updated
  with plain immutable spreads inside `set((state) => ({ ... }))`.
- The full state shape is the `AppState` interface (`store/index.ts:104`). It
  holds session lists, per-session state, UI flags, config/auth, settings,
  sandbox status, and all the actions.
- Server-driven mutations are applied by `useIPC` (see `ipc-electron.md`), which
  calls `useAppStore.getState()` and invokes actions imperatively outside React.

**Anti-pattern:** creating a second Zustand store, a React Context provider for
shared state, or `useState` lifted to the top of `App.tsx` for cross-component
state. Everything cross-component goes through `useAppStore`.

---

## Per-session state: one record, not parallel maps

Per-session data (messages, streaming partials, turns, traces, context window,
compaction history) lives in a single map:

```ts
sessionStates: Record<string, SessionState>; // keyed by sessionId
```

`SessionState` and `DEFAULT_SESSION_STATE` are defined at `store/index.ts:62`
and `:74`. This deliberately **replaced 8 parallel `xxxBySession` Maps** — do not
reintroduce a separate `Record`/`Map` for a new per-session field. Add the field
to `SessionState` + `DEFAULT_SESSION_STATE` instead.

Two helpers enforce safe, immutable updates — always use them in actions:

- `patchSession(states, sessionId, updates)` (`store/index.ts:87`) — immutably
  merges `updates` into one session's state, falling back to
  `DEFAULT_SESSION_STATE` when the session isn't present yet.
- `getSession(states, sessionId)` (`store/index.ts:100`) — reads one session's
  state with the safe default.

Every per-session action follows this pattern (e.g. `setPartialMessage`,
`addTraceStep`, `setSessionContextWindow`):

```ts
setSessionContextWindow: (sessionId, contextWindow) =>
  set((state) => ({
    sessionStates: patchSession(state.sessionStates, sessionId, { contextWindow }),
  })),
```

When a session is removed (`removeSession` / `removeSessions`, `store/index.ts:298`)
its entry is stripped out of `sessionStates` so the record does not leak.

**Anti-pattern:** mutating `state.sessionStates[id]` in place, or spreading the
whole record by hand when `patchSession` already does it correctly.

---

## Selectors: read via `store/selectors.ts`, never inline everywhere

All read access from components goes through the `use`-prefixed selector hooks in
`src/renderer/store/selectors.ts`. The rules that file enforces (see its header
comment):

1. **Every selector is `use`-prefixed** and returns a typed value.
2. **Per-session derived selectors always fall back to safe empty values** so
   callers never guard `undefined`. Example `useActiveSessionMessages`
   (`selectors.ts:77`) returns `[]` when there's no active session;
   `useActiveTraceSteps`, `usePendingTurns`, `useActiveCompactionHistory` do the same.
3. **Multi-field selections use `useShallow`** from `zustand/react/shallow`
   (imported at `selectors.ts:17`) so the component re-renders only when one of
   the selected values actually changes. Examples: `useLayoutState`
   (`selectors.ts:201`), `useConfigModalState` (`selectors.ts:243`),
   `useActiveSessionExecution` (`selectors.ts:144`), `usePendingDialogs`
   (`selectors.ts:310`), `useSandboxSetupState` (`selectors.ts:286`).
4. **Scalar selectors do NOT use `useShallow`** — a single primitive selector
   (`useActiveSessionId`, `selectors.ts:32`; `useThemeSetting`, `:267`) already
   compares by value.

Prefer a narrow scalar selector to subscribing to a whole array. Compare
`useActiveSessionCwd` (`selectors.ts:63`), which returns a single string and its
doc comment explicitly explains why it beats subscribing to the whole `sessions`
array (which flips on every status change).

**Anti-patterns:**

- Returning a fresh object/array literal from a selector **without** `useShallow`
  (`useAppStore((s) => ({ a: s.a, b: s.b }))`) — this re-renders on every store
  change because the object identity is always new.
- Subscribing to a whole array (`useSessions()`) when a scalar selector already
  exists for what you need.
- Duplicating selector logic inline in a component instead of adding/using a
  hook in `selectors.ts`.

---

## Actions: pulled directly, not through selectors.ts

Selectors are for **state reads**. Actions are pulled straight from the store by
reference, since action identities are stable for the store's lifetime:

```ts
const setShowConfigModal = useAppStore((s) => s.setShowConfigModal);
```

`App.tsx:79-86` is the canonical example: it reads state via selector hooks
(`useActiveSessionId`, `useConfigModalState`, …) but pulls every action
(`setShowConfigModal`, `setSidebarCollapsed`, …) directly with
`useAppStore((s) => s.someAction)`. Follow this split. Outside React (e.g. in
`useIPC`'s event switch), call `useAppStore.getState().someAction(...)`.

---

## `settings.update` writes through to main

Two settings actions exist (`store/index.ts:593`): `setSettings` updates only the
local store; `updateSettings` **also** fires `window.electronAPI.send({ type:
'settings.update', ... })` to persist to main. Use `updateSettings` for
user-driven changes that must survive a restart; use `setSettings` for applying a
snapshot that already came from main (as `useIPC`'s `applyConfigSnapshot` does).

---

## Navigation state

Top-level view is `activeView: ActiveView` plus the `showSettings` overlay flag
(`store/index.ts:24`, `NAV_VIEWS` at `:27`). `setActiveSession` resets
`activeView` to `'home'`; `setActiveView` closes Settings but preserves
`activeSessionId` (see the comments at `store/index.ts:324` and `:582`). A
CLI-driven navigation bridge (`window.__navigate` / `window.__getNavStatus`,
`store/index.ts:655`) is attached for remote UI control — do not remove it.

---

## Quick reference

| Need                            | Do this                                                             |
| ------------------------------- | ------------------------------------------------------------------- |
| Read one scalar of state        | Add/use a scalar selector in `selectors.ts` (no `useShallow`)       |
| Read several fields at once     | Selector returning an object wrapped in `useShallow`                |
| Read per-session data           | Selector with a safe empty fallback                                 |
| Add a new per-session field     | Extend `SessionState` + `DEFAULT_SESSION_STATE`, use `patchSession` |
| Mutate a session in an action   | `patchSession(state.sessionStates, id, updates)`                    |
| Call an action from a component | `useAppStore((s) => s.action)`                                      |
| Call an action outside React    | `useAppStore.getState().action(...)`                                |
| Persist a user setting          | `updateSettings(...)` (writes through to main)                      |
