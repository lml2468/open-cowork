# Build & Test Guide

Project-specific build, test, and tooling facts that trip up generic assumptions.
Requires Node 22 (`.nvmrc`, matches CI).

## CI gate (run before every merge)

All three must pass — this is the merge gate:

```bash
npm run lint
npx tsc --noEmit      # or: npm run typecheck
npx vitest run
```

## Tests: Vitest, mirrored under `src/tests/`

- Config: `vitest.config.mts`.
- Place a test at the source's mirror path: `src/main/mcp/foo.ts` →
  `src/tests/mcp/foo.test.ts`. A test is required for every `feat` / `fix`.
- `electron` is aliased to a mock (`tests/mocks/electron.ts`) so tests don't need the
  Electron binary; `electron-store` is inlined. Renderer code is excluded from coverage.
- Store tests reset with `useAppStore.setState(useAppStore.getInitialState())` in
  `beforeEach` (see `src/tests/store/*.test.ts`).
- One file: `npx vitest run src/tests/remote/stdio-channel.test.ts`; one test:
  `npx vitest run -t "name"`.

## better-sqlite3 ABI (why tests can fail to load)

`better-sqlite3` is a native module. The app rebuilds it for **Electron's** ABI, but
tests run under plain **Node** — a single compiled binary matches only one ABI at a
time. The guard is `scripts/ensure-sqlite.js`:

- `pretest` (npm hook) runs `ensure-sqlite.js node`, and a vitest `globalSetup`
  (`tests/vitest-global-setup.ts`) runs the same probe so direct `npx vitest run` also
  self-heals. It is a fast no-op when the binary already matches.
- After tests, `npm run dev`'s `predev` hook rebuilds it back for Electron. This
  Node↔Electron rebuild churn is expected.
- If you ever see `NODE_MODULE_VERSION ... requires ...`, it's this ABI mismatch — run
  `node scripts/ensure-sqlite.js node` (tests) or `... electron` (app).

## Build is multi-stage — not `tsc && vite build`

`npm run build` chains many steps (download Node runtimes, prepare gui-tools + Python,
build the WSL/Lima agents as separate `tsc` projects, esbuild-bundle MCP servers, then
`tsc` → `vite build` → `pre-build-check.js` → `electron-builder`). Don't assume a plain
build. For a quick runnable main process locally: `node scripts/bundle-mcp.js && npx
vite build`.

## Vite externalization (ESM vs CJS)

`vite.config.ts` `rollupOptions.external` decides what stays bundled: **ESM-only**
packages (`@mariozechner/pi-coding-agent`, `pi-ai`, `electron-store`, `uuid`) must stay
**bundled**; CJS ones are externalized. Check that list before changing an import of a
heavy main-process dependency.

## Path aliases

- `@` → `src` (both vite and vitest).
- `@main` → `src/main`, `@renderer` → `src/renderer` (**vite only**, not vitest).

Use `@` in test imports; `@main`/`@renderer` won't resolve under vitest.

## Commits

Conventional Commits, enforced by commitlint + husky (header ≤100 chars, **body lines
≤100 chars**). Types: `feat|fix|refactor|perf|docs|test|build|chore|ci|style|revert|
merge`. A pre-commit hook runs `eslint --fix` + prettier on staged files. Branches:
`feature/<name>`, `fix/<name>`.
