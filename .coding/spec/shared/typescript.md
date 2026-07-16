# TypeScript Conventions

> The real TypeScript configuration for open-cowork, plus the alias footgun that
> bites tests.
>
> Sources: `tsconfig.json`, `.eslintrc.cjs`, `vite.config.ts`, `vitest.config.mts`.

---

## Strict Mode Is On (and then some)

`tsconfig.json` `compilerOptions`:

```jsonc
{
  "target": "ES2022",
  "module": "ESNext",
  "moduleResolution": "bundler",
  "strict": true,
  "noUnusedLocals": true,
  "noUnusedParameters": true,
  "noFallthroughCasesInSwitch": true,
  "isolatedModules": true,
  "allowImportingTsExtensions": true,
  "noEmit": true,
  "jsx": "react-jsx",
}
```

Practical consequences:

- **`strict: true`** — `strictNullChecks`, `noImplicitAny`, etc. all active.
  Narrow before you dereference.
- **`noUnusedLocals` / `noUnusedParameters`** — unused locals/params are a
  **type error** (`tsc --noEmit` fails). For intentionally-unused function
  parameters, prefix with `_` (see `code-quality.md`; matches ESLint's
  `argsIgnorePattern: '^_'`).
- **`noFallthroughCasesInSwitch`** — every `case` must `break`/`return`/`throw`.
  Relevant: `handleClientEvent` in `src/main/index.ts` is a large `switch` over
  `event.type`.
- **`isolatedModules`** — each file must be transpilable alone. Re-exporting a
  type needs `export type { ... }`.
- **`allowImportingTsExtensions`** — `.ts` import specifiers are allowed (paired
  with `noEmit`; Vite/esbuild does the actual bundling).

Type-check with `npx tsc --noEmit` (or `npm run typecheck`). This is part of the
CI gate.

---

## `no-explicit-any` Is an Error

`.eslintrc.cjs` sets `@typescript-eslint/no-explicit-any: 'error'`. `any` is
**build-breaking** — it fails `npm run lint` and the `eslint --fix` step in the
pre-commit hook.

Use `unknown` + a type guard, or a precise type:

```typescript
// BAD — fails lint
function parse(data: any) { ... }

// GOOD
function parse(data: unknown): Parsed {
  if (!isParsed(data)) throw new Error('bad input');
  return data;
}

// catch clauses
try {
  await run();
} catch (e: unknown) {          // not `catch (e: any)`
  logger.error('run failed', { error: e });
}
```

For casting to internals in tests, prefer `as unknown as <Type>` over `as any`
(see `testing.md`).

> Note: this repo does **not** configure `@typescript-eslint/no-non-null-assertion`.
> The `!` non-null assertion is not lint-banned, and the codebase uses it
> deliberately in a few narrowed spots (e.g. `sessionManager!` after a guard in
> `src/main/index.ts`). Prefer explicit narrowing, but `!` is allowed.

---

## Path Aliases — the #1 Footgun

Three aliases are configured for **source/build** (`tsconfig.json` `paths` and
`vite.config.ts` `resolve.alias`):

| Alias         | Resolves to      |
| ------------- | ---------------- |
| `@/*`         | `src/*`          |
| `@main/*`     | `src/main/*`     |
| `@renderer/*` | `src/renderer/*` |

**But Vitest defines only `@` → `src`** (`vitest.config.mts` `resolve.alias`).
`@main` and `@renderer` do **not** exist under Vitest.

Therefore, in code that runs under tests (anything imported by a `*.test.ts`),
import via `@` or a relative path:

```typescript
// Works in tsc, vite, AND vitest
import { toolExecutor } from '@/main/tools/tool-executor';
import { authUtil } from '@/main/config/auth-utils';

// Works in tsc + vite, but BREAKS under vitest ("cannot resolve @main/...")
import { toolExecutor } from '@main/tools/tool-executor';
```

Real test files use `@/main/...` (e.g. `src/tests/tools/tool-executor-fs.test.ts`).
If a test fails to resolve an import, this alias mismatch is the first thing to
check.

---

## Type Imports & Discriminated Unions

- Use `import type { ... }` for type-only imports (required by `isolatedModules`
  for re-exports).
- The IPC contract is two discriminated unions — `ClientEvent` and `ServerEvent`
  in `src/renderer/types/index.ts` — keyed on `type`. Narrow on `event.type`;
  the `noFallthroughCasesInSwitch` rule keeps the dispatch switch honest.

```typescript
switch (event.type) {
  case 'session.start':
    return sm.startSession(/* ... */); // event.payload narrowed here
  case 'session.stop':
    return sm.stopSession(event.payload.sessionId);
  // every case returns/breaks
}
```

---

## Summary

| Rule                        | Enforced by                          |
| --------------------------- | ------------------------------------ |
| `strict` null/any checks    | `tsconfig.json`                      |
| No unused locals/params     | `tsconfig.json` (`_`-prefix params)  |
| No switch fallthrough       | `tsconfig.json`                      |
| `any` forbidden             | `.eslintrc.cjs` (error)              |
| Import via `@` in test code | `vitest.config.mts` only aliases `@` |
