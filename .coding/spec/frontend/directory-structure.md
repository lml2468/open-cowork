# Directory Structure (renderer)

> The real layout of `src/renderer/`. Electron three-process split:
> `src/main` (Node/main), `src/preload` (context bridge), `src/renderer` (React),
> `src/shared` (types shared across processes).

---

## `src/renderer/` layout

```
src/renderer/
├── App.tsx              # Root component: wires selector hooks + useIPC,
│                        #   lazy-loads heavy panels, applies theme, owns overlays
├── main.tsx            # ReactDOM.createRoot entry; imports globals.css +
│                        #   i18n/config side effect; installs renderer diagnostics
├── vite-env.d.ts       # Vite/renderer ambient types
├── assets/             # Static assets
├── components/         # ~60 .tsx components (see below)
│   ├── message/        # Content-block renderers (ContentBlockView, ToolUseBlock, …)
│   ├── nav/            # Full-width nav destinations + NavPageRouter
│   ├── remote/         # Remote-control config steps
│   ├── settings/       # Settings tabs + shared.tsx primitives
│   └── index.ts        # Re-exports
├── hooks/              # 8 custom hooks (useIPC, useApiConfigState, …)
├── i18n/               # config.ts (i18next init) + locales/{en,zh}.json
├── store/              # index.ts (the single Zustand store) + selectors.ts
├── styles/             # globals.css (Tailwind directives + CSS-var tokens)
├── types/              # index.ts — ClientEvent/ServerEvent + all renderer types
└── utils/              # Pure helpers (session-update, artifact-path, i18n-format, …)
```

---

## Where things live

| You need…                            | Location                                        |
| ------------------------------------ | ----------------------------------------------- |
| Root wiring / overlays / theme       | `App.tsx`                                       |
| React entry / bootstrap side effects | `main.tsx`                                      |
| Client state + actions               | `store/index.ts` (`useAppStore`)                |
| Read hooks for state                 | `store/selectors.ts`                            |
| A UI component                       | `components/` (or the matching subfolder)       |
| A settings tab                       | `components/settings/` (+ `shared.tsx`)         |
| A full-width nav page                | `components/nav/` (register in `NavPageRouter`) |
| Cross-component logic                | `hooks/`                                        |
| The IPC event unions / shared types  | `types/index.ts`                                |
| A pure helper                        | `utils/`                                        |
| Strings                              | `i18n/locales/{en,zh}.json`                     |
| Global styles / design tokens        | `styles/globals.css`                            |

---

## Conventions

- **Components:** PascalCase files (`ChatView.tsx`). One primary component per
  file. Keep files under ~500 lines (see `components.md`).
- **Hooks:** camelCase, `use`-prefixed, one per file (`useContextUsage.ts`).
- **Utils:** camelCase, pure functions, no React (`session-update.ts`).
- **Styling:** Tailwind only; the single stylesheet is `styles/globals.css`
  (imported once in `main.tsx`). There is no per-component CSS / CSS Modules
  directory.
- **Cross-process types:** renderer-facing types in `src/renderer/types/`;
  types shared with main live in `src/shared/` (e.g. `src/shared/ipc-types`,
  imported by the preload).

---

## Related processes (context)

- `src/preload/index.ts` — exposes `window.electronAPI` and re-declares its type
  on `Window`. The renderer never imports from `src/main` at runtime; it only
  talks through `window.electronAPI` (see `ipc-electron.md`).
- Path aliases: `@` → `src` (vite + vitest), `@main`/`@renderer` → those dirs
  (vite only). See `type-safety.md`.
