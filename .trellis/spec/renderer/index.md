# Renderer Layer

> React + Zustand + Tailwind + i18next UI in `src/renderer/`.

The renderer is the Electron browser process. It talks to the main process **only**
through `window.electronAPI` and the typed IPC contract (see the `shared` layer). It
never imports from `src/main`.

## Guidelines Index

| Guide                                     | Description                                                |
| ----------------------------------------- | ---------------------------------------------------------- |
| [Components](./components.md)             | Functional components, file size, icons, structure         |
| [State Management](./state-management.md) | Zustand store + scoped selectors                           |
| [Styling & i18n](./styling-and-i18n.md)   | Tailwind-only + design tokens, lucide icons, en/zh i18n    |
| [IPC from the Renderer](./ipc.md)         | `window.electronAPI`, sending `ClientEvent`, `ServerEvent` |

## Pre-Development Checklist

- [ ] New UI file is a functional component + hooks (no classes) and will stay under
      ~500 lines. Split if larger.
- [ ] Styling uses Tailwind utilities + the theme tokens (never raw hex / inline
      colors). Icons come from `lucide-react` only.
- [ ] Every user-facing string goes through i18next with a key added to **both**
      `src/renderer/i18n/locales/en.json` and `zh.json`.
- [ ] Global/cross-view state goes in the Zustand store (`src/renderer/store/`) and is
      read via a scoped selector, not a broad `useAppStore(s => s)` subscription.
- [ ] Crossing to main uses `window.electronAPI` + a `ClientEvent` union member — no new
      IPC channel.

## Quality Check

- [ ] `npx tsc --noEmit` clean; no `any` (use `unknown` + type guards).
- [ ] `npm run lint` clean.
- [ ] New i18n keys exist in both `en.json` and `zh.json`.
- [ ] No Tailwind-arbitrary colors bypassing the token system; no icon libraries other
      than `lucide-react`.
- [ ] Store subscriptions are narrowly scoped (selectors), so streaming/tick updates
      don't re-render unrelated components.
