# Components

> Renderer components: functional + hooks only, Tailwind-only styling with the
> project's semantic design tokens, `lucide-react` icons, and `memo`/`useMemo`
> to keep re-renders cheap.

---

## Shape: functional components + local Props interface

Every component is a function component using hooks. Props are typed with a
**local `interface XxxProps`** declared just above the component and destructured
in the signature. Canonical example `src/renderer/components/MessageCard.tsx`:

```tsx
interface MessageCardProps {
  message: Message;
  isStreaming?: boolean;
}

export const MessageCard = memo(function MessageCard({ message, isStreaming }: MessageCardProps) {
  ...
});
```

No class components (the one exception is error boundaries — `ErrorBoundary.tsx`
/ `PanelErrorBoundary.tsx` — which React requires to be classes).

---

## `memo` + `useMemo` to stabilize child refs

Hot-path components are wrapped in `memo()` and derive stable values with
`useMemo`. In `MessageCard.tsx` (`:14`, `:22`, `:32`) the content blocks and
merged result ids are memoized specifically so they don't hand fresh array
references to memoized children (`ContentBlockView`), which would defeat the
child `memo()`. Follow this when a component maps over data and renders memoized
list items.

`App.tsx` lazy-loads heavy panels with `React.lazy` + `Suspense`
(`App.tsx:30-44`: `ChatView`, `ContextPanel`, `ConfigModal`, `SettingsPanel`,
`NavPageRouter`) and wraps each in a `PanelErrorBoundary`. Keep large, rarely-
first-painted panels lazy.

---

## Styling: Tailwind only, with semantic tokens

- **Tailwind utility classes only.** There is no `cn` / `clsx` / `tailwind-merge`
  helper in this repo (verified: no such import exists). Conditional classes are
  written as plain template literals:

  ```tsx
  className={`icon-btn w-9 h-9 ${isActive ? 'bg-accent/10 text-text-primary' : ''}`}
  ```

  (`Sidebar.tsx:286`). Do not introduce a class-merge utility or CSS Modules.

- **Use the semantic design tokens** from `tailwind.config.js`, not raw color
  literals. The theme extends color families driven by CSS variables (defined in
  `src/renderer/styles/globals.css`): `background`, `surface`
  (`surface-hover/active/muted`), `border` (`border-muted/subtle`), `accent`
  (`accent-hover/muted`), `on-accent`, `text` (`text-primary/secondary/muted`),
  `success`/`warning`/`error`, `mcp`, `scrim`. It also defines a named type scale
  (`text-display/title/heading/body/body-sm/label/caption`), shell widths
  (`w-sidebar`, `w-sidebar-collapsed`, `w-context`), `h-header`, reading widths
  (`max-w-content`), and an extended radius scale (`rounded-4xl`, `rounded-5xl`).

  Use `text-text-muted`, `bg-surface-muted`, `border-border-subtle`, `w-context`,
  `rounded-4xl`, etc. (all used in `App.tsx:48-60`). **Anti-pattern:** raw colors
  like `text-gray-500`, `bg-[#17181b]`, hard-coded pixel widths.

- **Dark/light theme** is toggled by adding/removing the `light` class on
  `document.documentElement` (`App.tsx:104-113`); `darkMode: 'class'` in the
  Tailwind config. Tokens flip via CSS variables in `globals.css` — never
  hard-code per-theme colors in a component.

---

## Icons: `lucide-react` only

Import icons as named imports from `lucide-react` and size them with Tailwind
(`w-3 h-3`, `w-4 h-4`), e.g. `import { Copy, Check, Clock, XCircle } from
'lucide-react';` (`MessageCard.tsx:5`). The `LucideIcon` type is used where icons
are passed as data (`Sidebar.tsx:24`). No other icon library, no inline SVG icon
sets.

---

## Shared settings primitives

Settings tabs share primitives from `src/renderer/components/settings/shared.tsx`
(e.g. `SettingsContentSection`, localized-banner and schedule helpers). Reuse
these in new settings panels instead of re-implementing section chrome.

---

## Directory layout of components

`src/renderer/components/` holds ~60 `.tsx` files plus subfolders:
`message/` (content-block renderers), `nav/` (full-width nav destinations +
`NavPageRouter`), `remote/` (remote-control config steps), `settings/` (settings
tabs + `shared.tsx`). `index.ts` re-exports common components.

---

## The ~500-line cap

CLAUDE.md sets a soft cap of ~500 lines per component file. Several existing files
already exceed it and should be treated as **refactor targets, not templates to
copy**:

| File                                         | Lines |
| -------------------------------------------- | ----- |
| `components/settings/SettingsSchedule.tsx`   | 1123  |
| `components/settings/SettingsConnectors.tsx` | 921   |
| `components/settings/SettingsSkills.tsx`     | 827   |
| `components/ChatView.tsx`                    | 793   |
| `components/WelcomeView.tsx`                 | 737   |
| `components/ContextPanel.tsx`                | 702   |

When a new component approaches ~500 lines, split it (extract subcomponents into
the relevant subfolder, hoist shared logic into a hook). Do not add to the files
above.

---

## Quick reference

| Rule                         | Where                                          |
| ---------------------------- | ---------------------------------------------- |
| Local `interface XxxProps`   | `MessageCard.tsx:9`                            |
| `memo` + `useMemo` hot paths | `MessageCard.tsx:14,22,32`                     |
| Lazy heavy panels            | `App.tsx:30-44`                                |
| Tailwind + semantic tokens   | `tailwind.config.js`, `App.tsx:48-60`          |
| Conditional classes          | Template literal (`Sidebar.tsx:286`) — no `cn` |
| Icons                        | `lucide-react` named imports, Tailwind sizes   |
| Shared settings chrome       | `components/settings/shared.tsx`               |
| ~500-line cap                | split before you hit it                        |
