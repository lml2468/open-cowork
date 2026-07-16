# Code Quality

> The gates and standards that apply to renderer code before it merges.

---

## CI gate (must all pass)

Per CLAUDE.md, the pre-merge gate is:

```bash
npm run lint          # eslint
npx tsc --noEmit      # type-check (renderer is part of the root tsc project)
npx vitest run        # tests (single run, as CI)
```

Run these before committing. A pre-commit husky hook also runs `eslint --fix` +
prettier on staged files, and commitlint enforces Conventional Commits.

---

## Lint / type rules that bite the renderer

- **No `any`** — `@typescript-eslint/no-explicit-any` is an **error**
  (`.eslintrc.cjs:22`). Use `unknown` + type guards; `catch (e: unknown)`.
- **Hooks rules** — `react-hooks/rules-of-hooks` (error),
  `react-hooks/exhaustive-deps` (warn). Don't blanket-disable exhaustive-deps;
  guard run-once effects with refs/flags and disable with a stated reason
  (`App.tsx:130`).
- **Strict TS** — no implicit `any`, no unchecked nulls. See `type-safety.md`.

---

## Testing & coverage

- Tests use **Vitest** and live under `src/tests/` mirroring the source path
  (`vitest.config.mts`). `electron` is aliased to a mock so tests don't need the
  Electron binary.
- **The renderer is excluded from coverage.** `vitest.config.mts:28` lists
  `'src/renderer/'` in `coverage.exclude`. So renderer components/hooks are not
  measured by the coverage thresholds — but logic worth testing (pure utils in
  `src/renderer/utils/`, store reducers) can still have tests; they just won't
  count toward coverage. Note tests can only use the `@` alias (not
  `@renderer`/`@main`).
- CLAUDE.md requires tests for every `feat`/`fix`. For renderer-only changes with
  no headless surface, put the testable logic in a pure util or the store and test
  that.

---

## Renderer-specific quality rules

- **Tailwind only** — no `cn`/`clsx`/`tailwind-merge`, no CSS Modules. Use the
  semantic design tokens from `tailwind.config.js` (see `components.md`), not raw
  colors.
- **i18n both locales** — every user-facing string added to BOTH `en.json` and
  `zh.json` at the same key path (see `i18n.md`). No hard-coded UI strings.
- **One store, selectors for reads** — no second store / Context; multi-field
  selectors use `useShallow` (see `state-management.md`).
- **One IPC listener** — never register a second `server-event` listener (see
  `ipc-electron.md`).
- **Extend the typed unions** in `types/index.ts` for cross-boundary features;
  add new `ClientEvent` types to `ALLOWED_CLIENT_EVENTS` in the preload.

---

## Quick reference

| Before commit     | Command / rule                           |
| ----------------- | ---------------------------------------- |
| Lint              | `npm run lint` (no `any`)                |
| Type-check        | `npx tsc --noEmit`                       |
| Tests             | `npx vitest run`                         |
| Renderer coverage | Excluded — test pure utils/store instead |
| Strings           | Both `en.json` + `zh.json`               |
| Styling           | Tailwind tokens only                     |
