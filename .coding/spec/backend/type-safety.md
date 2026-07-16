# Type Safety

> TypeScript strict throughout. The core modeling tool is the **discriminated
> union**, not Zod — this project does **not** use Zod.

## Compiler settings — `tsconfig.json`

- `strict: true`
- `noUnusedLocals: true`, `noUnusedParameters: true`
- `noFallthroughCasesInSwitch: true`

Because switch fallthrough is an error and the IPC dispatch is one big
`switch (event.type)`, every case must terminate (`return`/`break`).

## Lint rules — `.eslintrc.cjs`

- `@typescript-eslint/no-explicit-any` = **error**. Use `unknown` + type guards.
  To reach an internal in a test, use `as unknown as <T>` — never `any`.
- `@typescript-eslint/no-unused-vars` = `warn`, with `argsIgnorePattern: '^_'` —
  prefix intentionally-unused args with `_`.
- **Note:** `no-non-null-assertion` is **not** configured — `!` is not banned
  (e.g. `sessionManager!` after a guard in `handleClientEvent`). Use it
  sparingly, but it is not a rule violation.

## Discriminated unions are the pattern

The load-bearing types are discriminated unions in
`src/renderer/types/index.ts`:

- `ClientEvent` / `ServerEvent` — discriminated on `type` (see `ipc-protocol.md`).
- `ContentBlock`, `TraceStep`, and internal action unions like
  `CodexTranslatorAction` (`src/main/agent/codex-runtime/codex-event-translator.ts`)
  and `CodexModelConfigResult` (`{ supported: true } | { supported: false }`).

Narrow on the discriminant and let `noFallthroughCasesInSwitch` +
exhaustiveness keep `switch`es honest.

## No Zod

There is no `zod` dependency and no `*.safeParse()` in the codebase. Validate
inputs with hand-written type guards (`typeof`, `instanceof`, `in`, custom
`isX(...)` predicates) — e.g. `FIELD_VALIDATORS` in `config-store.ts`, or the
`isProviderType`/`isAppTheme` guards there. Do not introduce Zod for these
unions.

## Anti-patterns

- `any` anywhere (lint error) — use `unknown` + guards, `as unknown as T` in
  tests.
- Introducing Zod schemas as the "source of truth" — the unions are.
- Unused vars/params without the `_` prefix (lint warning).
- Non-terminating `switch` cases (compile error).
