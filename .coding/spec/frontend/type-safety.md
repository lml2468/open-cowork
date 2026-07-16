# Type Safety

> TypeScript strict, no `any`, discriminated unions for the IPC protocol, and
> the repo's path aliases.

---

## Strict TypeScript, no `any`

- The project compiles under **TypeScript strict** (`npx tsc --noEmit` is a CI
  gate). Renderer code is part of the root `tsc` project.
- **`any` is a lint error**, not a warning: `.eslintrc.cjs:22` sets
  `'@typescript-eslint/no-explicit-any': 'error'`. Use `unknown` + type guards
  instead, and `catch (e: unknown)` (never `catch (e: any)` — rejected in
  review). Unused vars are a warning with an `^_` ignore pattern
  (`.eslintrc.cjs:21`).
- ESLint also enforces `react-hooks/rules-of-hooks` (error) and
  `react-hooks/exhaustive-deps` (warn).

---

## Discriminated unions are the type backbone

The core protocol/data types in `src/renderer/types/index.ts` are **discriminated
unions keyed on a literal `type` field** — switch/narrow on `type`, don't cast:

- `ContentBlock` (`types/index.ts:43`): `TextContent | ImageContent |
FileAttachmentContent | ToolUseContent | ToolResultContent | ThinkingContent`,
  each with a `type: '...'` literal.
- `ClientEvent` (`types/index.ts:359`) and `ServerEvent` (`types/index.ts:432`):
  the IPC unions, each variant `{ type: '...'; payload: {...} }`.
- `TraceStepType` / `TraceStepStatus` are string-literal unions
  (`types/index.ts:118`).

`useIPC`'s `switch (event.type)` (`useIPC.ts:135`) relies on this discrimination
for exhaustive, type-safe handling — the store actions receive already-narrowed
payloads. When you add a variant, add it to the union so the switch and all
consumers get compile-time coverage.

The preload re-declares the `Window['electronAPI']` shape (bottom of
`preload/index.ts`) so the renderer sees `window.electronAPI` fully typed. Keep
that declaration in sync with the runtime object.

---

## Path aliases

| Alias       | Resolves to    | Where                                                              |
| ----------- | -------------- | ------------------------------------------------------------------ |
| `@`         | `src`          | vite (`vite.config.ts:80`) **and** vitest (`vitest.config.mts:51`) |
| `@main`     | `src/main`     | vite only (`vite.config.ts:81`)                                    |
| `@renderer` | `src/renderer` | vite only (`vite.config.ts:82`)                                    |

Implication: **tests (`src/tests/`) can only use `@`**, not `@main`/`@renderer`,
because the vitest config defines only the `@` alias. In app code, prefer these
aliases over long relative chains; within the renderer, short relative imports
(`../store`, `../types`) are the prevailing style and are fine.

---

## Quick reference

| Rule                         | Where                                       |
| ---------------------------- | ------------------------------------------- |
| No `any` (error)             | `.eslintrc.cjs:22` — use `unknown` + guards |
| `catch (e: unknown)`         | not `any`                                   |
| Narrow on `type`, don't cast | `ContentBlock`/`ClientEvent`/`ServerEvent`  |
| Extend the IPC unions        | `src/renderer/types/index.ts`               |
| App-code aliases             | `@`, `@main`, `@renderer` (vite)            |
| Test-code alias              | `@` only (vitest)                           |
