# Components

## Functional components only

All renderer UI is functional components with hooks — there are no class components.
Components live in `src/renderer/components/`, with feature groups in subfolders
(`components/settings/`, `components/message/`, `components/remote/`, `components/nav/`).

## Keep files under ~500 lines

When a component grows past ~500 lines, split it. Real examples of the split pattern:

- `SettingsPanel.tsx` delegates each tab to a `settings/Settings*.tsx` component.
- `components/nav/` splits a shell (`NavPageShell.tsx`) from a router
  (`NavPageRouter.tsx`) and per-destination pages.
- Message rendering is decomposed under `components/message/` (`ContentBlockView`,
  `ToolUseBlock`, `ThinkingBlock`, …).

## Icons: `lucide-react` only

Import icons from `lucide-react` and nothing else. Size them with Tailwind
(`className="w-4 h-4"`). See any component header, e.g. `components/Sidebar.tsx`,
`components/WelcomeView.tsx`. Do not add other icon packs or inline SVG icon sets.

## Lazy-load heavy panels

Large top-level views are `React.lazy` + `Suspense` behind a `PanelErrorBoundary`, so
one panel crashing doesn't take down the shell. See `src/renderer/App.tsx` (`ChatView`,
`ContextPanel`, `SettingsPanel`, `NavPageRouter` are all lazy). Follow this for new
top-level views.

## Reuse feature components across surfaces

A feature component that reads its own data (store/IPC) and takes a minimal prop can be
mounted in more than one place. Example: `settings/SettingsSkills`,
`SettingsConnectors`, `SettingsSchedule` take only `{ isActive }` and are reused both in
`SettingsPanel` and as standalone nav pages under `components/nav/`. Prefer reusing such
a component over duplicating its UI.

## Anti-patterns

- Class components.
- Files that keep growing past ~500 lines instead of splitting.
- Icons from anywhere but `lucide-react`.
- A new top-level view added eagerly (not lazy) or without a `PanelErrorBoundary`.
