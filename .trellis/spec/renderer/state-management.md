# State Management

Global renderer state is a single Zustand store; local UI state stays in `useState`.

## The store

- Store definition: `src/renderer/store/index.ts` (`useAppStore`, created with
  `create<...>()`). It holds sessions, per-session state (`sessionStates`), UI flags
  (`sidebarCollapsed`, `showSettings`, `activeView`, …), config, and actions.
- Actions live on the store and centralize state transitions. Prefer putting
  mutual-exclusion / reset logic **inside an action** rather than in each caller — e.g.
  `setActiveSession` also resets `activeView` to `'home'`, and `setActiveView` clears
  `showSettings`, so no component has to remember to reset siblings.

## Read through scoped selectors

Selectors live in `src/renderer/store/selectors.ts`. Subscribe to the narrowest slice a
component needs so unrelated updates (especially streaming ticks) don't re-render it:

- Single scalar: `useActiveView()`, `useActiveSessionId()` — `useAppStore(s => s.x)`.
- Grouped slice: use `useShallow` to return an object without re-render churn, e.g.
  `useLayoutState`, `useSettingsState`.

Do not subscribe with a broad `useAppStore(s => s)` or select an object literal without
`useShallow` — both cause excessive re-renders. There is a real regression guarded by
`src/tests/renderer/sidebar-session-click.test.ts` where an over-broad dependency caused
a React "Maximum update depth exceeded" loop; read state at call-time via
`useAppStore.getState()` inside callbacks instead of subscribing where you only need a
snapshot.

## Local vs global

- Ephemeral, view-local UI state (a collapsed set, a search box, select-mode) →
  `useState` in the component. Example: session group collapse + `isSelectMode` in
  `components/Sidebar.tsx`.
- Anything shared across views or persisted across a session → the store.

## Per-session state

Per-session data (messages, partials, turns, traces) lives under
`sessionStates[sessionId]` and is patched immutably. When you need current session data
inside a callback without subscribing, read `useAppStore.getState().sessionStates`.

## Anti-patterns

- Broad store subscriptions (`useAppStore(s => s)`), or object-returning selectors
  without `useShallow`.
- Duplicating reset logic in every caller instead of centralizing it in the action.
- Putting genuinely global state in component `useState` and prop-drilling it.
