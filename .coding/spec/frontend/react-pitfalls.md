# React Pitfalls

> React patterns that cause real bugs in this renderer. Only rules that apply to
> this codebase's stack (React 18 + Zustand + IPC streaming) are kept.

---

## Reference stability for hook dependencies and memoized children

React compares dependencies and props by reference (`===`). A value created fresh
each render (an object/array literal, `new Date()`, a `.map()` result) changes
identity every render and defeats `useMemo`/`memo`/effect deps.

- Wrap derived objects/arrays in `useMemo`. `MessageCard.tsx:22,32` memoizes its
  content blocks and merged result ids **specifically so the memoized child
  `ContentBlockView` isn't re-rendered every tick**.
- The same rule is why store selectors that return an object literal must use
  `useShallow` (see `state-management.md`) — otherwise the component re-renders on
  every store change because the selected object is a new reference each time.

**Symptoms:** endless re-renders / sluggish UI; memoized children re-rendering on
unrelated updates.

---

## Storing a function in `useState`

`useState`'s setter treats a function argument as an updater and **calls it
immediately**. To store a function as a value, wrap it:

```tsx
// WRONG — myFn(prevState) runs now
setHandler(myFn);
// CORRECT — stores the function
setHandler(() => myFn);
```

Symptoms: state appears to reset right after you set it; the stored function runs
at the wrong time. (For cross-component callbacks, prefer a store action or a
`useRef` over stashing functions in state.)

---

## State in a component that unmounts

This app conditionally renders and **lazy-loads** the main panels — `ChatView`,
`ContextPanel`, `SettingsPanel`, `NavPageRouter` mount/unmount as `activeView` /
`showSettings` / `activeSessionId` change (`App.tsx:188-234`). Any `useState`
inside a panel is lost when that panel unmounts.

Rule: state that must survive navigation between panels belongs in the Zustand
store (`useAppStore`), not in component `useState`. That is exactly why
per-session data (messages, partials, traces, scroll-relevant flags) lives in
`sessionStates` keyed by session id, not in `ChatView` local state. Reserve
`useState` for genuinely ephemeral, component-local UI (input text, an open/closed
toggle that need not persist).

---

## `exhaustive-deps` is a warning — do not silence it blindly

`react-hooks/exhaustive-deps` is enabled (warn) in `.eslintrc.cjs`. The
`useEffect(..., [])`-run-once effects in this repo (`App.tsx:93` init,
`useIPC.ts:30` listener install) intentionally use an empty dep array and are
guarded by refs / module-level flags. When you add an effect, either include all
deps or, if you deliberately want run-once, use a ref/flag guard and an explicit
`// eslint-disable-next-line react-hooks/exhaustive-deps` with a reason — as
`App.tsx:130` does — rather than leaving a silent stale-closure bug.

---

## IPC listener lifecycle (see `ipc-electron.md`)

The preload's `on()` is a single-slot bridge; only the first `useIPC()` caller
may install the listener (module-level `ipcListenerInstalled` guard,
`useIPC.ts:25`). Re-registering or letting a secondary `useIPC` unmount tear it
down silently drops all subsequent server events. Never call
`window.electronAPI.on(...)` from a component; never add a second listener.

---

## Summary

| Pitfall                          | Fix                                                        |
| -------------------------------- | ---------------------------------------------------------- |
| Fresh object/array in deps/props | `useMemo`; selectors return objects only via `useShallow`  |
| Function in `useState`           | Wrap with `() =>`, or use a store action / ref             |
| State in an unmounting panel     | Lift to `useAppStore` (per-session → `sessionStates`)      |
| Empty/partial effect deps        | Ref-guard run-once effects; disable the rule with a reason |
| Extra IPC listener               | Only `useIPC`'s single install path may call `on()`        |
