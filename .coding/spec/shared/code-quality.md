# Code Quality

> Mandatory, machine-enforced quality rules for open-cowork.
>
> Sources: `.eslintrc.cjs`, `.prettierrc`, `.editorconfig`, `package.json`.

---

## No `any` (Error)

`@typescript-eslint/no-explicit-any` is `'error'` in `.eslintrc.cjs`. `any`
breaks `npm run lint` and the pre-commit `eslint --fix` step. Use `unknown` +
type guards, or precise types. In `catch`, use `catch (e: unknown)`, never
`catch (e: any)`. See `typescript.md` for detail.

---

## Unused Variables

- **Locals**: `tsconfig.json` `noUnusedLocals` makes any unused local a **type
  error** (`tsc --noEmit` fails).
- **Function args**: `.eslintrc.cjs` sets
  `@typescript-eslint/no-unused-vars: ['warn', { argsIgnorePattern: '^_' }]`.
  Intentionally-unused parameters must be `_`-prefixed:

```typescript
// GOOD — leading arg unused on purpose
app.on('window-all-closed', (_event) => quit());
```

`react-hooks/exhaustive-deps` is a **warn**; `react-hooks/rules-of-hooks` is an
**error**.

---

## Formatting (`.prettierrc`)

Prettier owns formatting. Exact config:

```jsonc
{
  "semi": true, // semicolons required
  "singleQuote": true, // 'single' quotes
  "tabWidth": 2, // 2-space indent
  "trailingComma": "es5", // trailing commas where ES5 allows (arrays/objects)
  "printWidth": 100, // wrap at 100 cols
  "endOfLine": "auto", // keep the file's existing EOL
}
```

`.editorconfig` reinforces: UTF-8, LF line endings, 2-space indent,
`insert_final_newline = true`, `trim_trailing_whitespace = true` — **except**
`*.md` (trailing whitespace preserved for hard line breaks).

Format everything with `npm run format`
(`prettier --write "src/**/*.{ts,tsx,css}"`). On commit, `lint-staged` runs
`prettier --write` on staged `*.{ts,tsx,json,md,yml,yaml,css}` automatically.

---

## Before-Commit Checklist (CI gate)

CI requires all three to pass before merge:

```bash
npm run lint        # eslint src --ext .ts,.tsx  (any = failure)
npx tsc --noEmit    # or: npm run typecheck
npx vitest run      # single-run test pass
```

The pre-commit hook (`.husky/pre-commit`) additionally runs `lint-staged`
(`eslint --fix` + `prettier --write`) and blocks lone `package-lock.json`
changes — see `git-conventions.md`.

Tests are **required for every `feat` / `fix`** — see `testing.md`.

---

## Naming Conventions

| Type            | Convention                | Example                              |
| --------------- | ------------------------- | ------------------------------------ |
| React component | PascalCase                | `SessionView.tsx`                    |
| Hook            | camelCase, `use` prefix   | `useSessionStore.ts`                 |
| Utility / other | kebab-case file           | `config-store.ts`, `agent-runner.ts` |
| Test file       | mirror source + `.test`   | `tool-executor-fs.test.ts`           |
| Variable / fn   | camelCase                 | `sessionManager`, `buildTurn`        |
| Constant        | SCREAMING_SNAKE_CASE      | `ALLOWED_CLIENT_EVENTS`              |
| Type / class    | PascalCase                | `CoworkAgentRunner`, `ClientEvent`   |
| Boolean         | `is`/`has`/`should`/`can` | `isLoading`, `hasUsableCredentials`  |

---

## Error Handling

- Never swallow errors. Log with context and rethrow or return a typed error.
  See `../backend/error-handling.md` for the main-process patterns and
  `../big-question/transaction-silent-failure.md` for the transaction-specific
  trap.
- `catch (e: unknown)` and narrow before use.

---

## Summary

| Rule                         | Level   | Source            |
| ---------------------------- | ------- | ----------------- |
| No `any`                     | error   | `.eslintrc.cjs`   |
| No unused locals             | error   | `tsconfig.json`   |
| Unused args must be `_`-pref | warn    | `.eslintrc.cjs`   |
| rules-of-hooks               | error   | `.eslintrc.cjs`   |
| Prettier formatting          | auto    | `.prettierrc`     |
| lint + typecheck + test pass | CI gate | `package.json`/CI |
