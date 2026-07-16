# Code Quality & Imports

> Import path rules, formatting, the pre-commit gate, and the Vite externals list.

## Import path aliases

Aliases differ between the build and the tests — this trips people up:

- **Main-process source** (`vite.config.ts`): relative imports, or the aliases
  `@` → `src`, `@main` → `src/main`, `@renderer` → `src/renderer`.
- **Tests** (`vitest.config.mts`): vitest defines **only** `@` → `src`. So in
  tests use `@`, `@/main/...`, `@/renderer/...` — `@main`/`@renderer` are **not**
  available under vitest.

`tsconfig.json` `paths` declares `@/*`, `@main/*`, `@renderer/*` for the type
checker.

## Formatting — `.prettierrc`

`semi: true`, `singleQuote: true`, `tabWidth: 2`, `trailingComma: 'es5'`,
`printWidth: 100`. A pre-commit hook runs eslint --fix + prettier on staged
files.

## Pre-commit / CI gate

All three must pass before merge (see CLAUDE.md):

1. `npm run lint` (0 errors)
2. `npx tsc --noEmit`
3. `npx vitest run`

## Vite externals — `vite.config.ts`

Heavy **CJS-compatible** main-process deps are externalized in
`rollupOptions.external` (not bundled): `better-sqlite3`, `@anthropic-ai/sdk`,
`openai`, `@modelcontextprotocol/sdk`, `@larksuiteoapi/node-sdk`,
`@slack/bolt`, `@slack/web-api`, `ws`, `chokidar`, `archiver`, `ngrok`, `glob`,
`dotenv`, `electron-updater`, plus Node builtins and `electron`.

**ESM-only packages `electron-store` and `uuid` MUST stay bundled** — CJS
`require()` can't load them. Do not add them to `external`.

## Anti-patterns

- Using `@main` / `@renderer` aliases in a test file (only `@` resolves under
  vitest).
- Moving an externalized runtime dep to `devDependencies` (it must ship).
- Adding `electron-store` or `uuid` to `rollupOptions.external`.
- Committing without running lint + tsc + vitest.
