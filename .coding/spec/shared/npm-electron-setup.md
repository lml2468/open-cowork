# npm + Electron Setup

> How open-cowork is installed, developed, and packaged. This project uses
> **npm** (not pnpm/yarn) and **electron-builder** (not Electron Forge).
>
> Sources: `package.json`, `.nvmrc`, `electron-builder.yml`, `vite.config.ts`,
> `scripts/`.

---

## Node & Package Manager

- **Node ≥ 22** — `package.json` `engines: { "node": ">=22" }`, and `.nvmrc`
  pins `22` (matches CI). Use `nvm use` before working.
- **npm** — the lockfile is `package-lock.json`. There is no `pnpm-lock.yaml` /
  `pnpm-workspace.yaml`; this is a single package, not a monorepo.

---

## `npm ci` vs `npm install`

- **`npm ci`** — clean, lockfile-exact install. Use this normally, and always in
  CI. It does not modify `package-lock.json`.
- **`npm install`** — only when intentionally adding/updating a dependency (it
  rewrites the lockfile).

The pre-commit hook **blocks committing `package-lock.json` without a matching
`package.json` change** (`.husky/pre-commit`) precisely to catch stray lock
churn from an accidental `npm install`. See `git-conventions.md`.

---

## The Heavy `postinstall`

`npm install` / `npm ci` runs `postinstall`
(`patch-package && node scripts/download-node.js && npm run rebuild`), which:

1. **`patch-package`** — applies patches under `patches/` to dependencies.
2. **`download:node`** (`scripts/download-node.js`) — downloads per-platform
   standalone Node runtimes into `resources/node/` (bundled so sandboxed/child
   processes have a Node to run).
3. **`rebuild`** — rebuilds **`better-sqlite3` against Electron's ABI**:
   `npm rebuild better-sqlite3 --runtime=electron --target=<electron version>
--disturl=https://electronjs.org/headers`. Without this you get
   `NODE_MODULE_VERSION` mismatch at runtime.

So a fresh install is slow and network-dependent — that is expected.

> Tests need `better-sqlite3` built for **Node** (not Electron). `scripts/
ensure-sqlite.js` rebuilds it for the right ABI; it runs via `pretest` and via
> the Vitest `globalSetup`. See `testing.md`.

---

## Key Scripts (`package.json`)

| Task           | Command             | Notes                                                   |
| -------------- | ------------------- | ------------------------------------------------------- |
| Dev            | `npm run dev`       | download node + build sandbox agents + MCP, then `vite` |
| Type-check     | `npm run typecheck` | `tsc --noEmit`                                          |
| Lint           | `npm run lint`      | `eslint src --ext .ts,.tsx`                             |
| Format         | `npm run format`    | `prettier --write "src/**/*.{ts,tsx,css}"`              |
| Test (watch)   | `npm run test`      | `vitest`                                                |
| Test (CI)      | `npx vitest run`    | single run                                              |
| Full build     | `npm run build`     | full multi-stage build + package (below)                |
| Rebuild sqlite | `npm run rebuild`   | better-sqlite3 for Electron ABI                         |

---

## The Multi-Stage Build Chain

`npm run build` is **not** a plain `tsc && vite build`. It chains
(`package.json` `build`):

```
download:node
  -> prepare:gui-tools        (bundles cliclick; needs it installed via Homebrew on macOS)
  -> prepare:python:all       (downloads standalone Python for both arches)
  -> build:wsl-agent          (tsc -p src/main/sandbox/wsl-agent/tsconfig.json)
  -> build:lima-agent         (tsc -p src/main/sandbox/lima-agent/tsconfig.json)
  -> build:mcp                (node scripts/bundle-mcp.js — esbuild-bundles MCP servers
                               into .bundle-resources/mcp/)
  -> tsc                      (type-check)
  -> vite build               (main + preload + renderer)
  -> node scripts/pre-build-check.js  (validates all artifacts exist)
  -> electron-builder         (package per electron-builder.yml)
```

The WSL and Lima sandbox agents are **separate TypeScript projects**, each with
its own `tsconfig.json`, compiled independently.

### Quick local main build (skips sandbox/python/gui prep)

To just produce a runnable main process for local testing:

```bash
node scripts/bundle-mcp.js && npx vite build
# -> dist-electron/main/index.js
```

---

## Vite Externalization (`vite.config.ts`)

The main-process bundle externalizes heavy **CJS-compatible** deps (they are
`require()`d at runtime, and `electron-builder.yml` `files:` ships them from
`node_modules/`):

```
better-sqlite3, bufferutil, utf-8-validate, electron,
@anthropic-ai/sdk, @larksuiteoapi/node-sdk, openai,
@modelcontextprotocol/sdk, electron-updater, chokidar,
archiver, ngrok, ws, glob, dotenv, @slack/bolt, @slack/web-api
```

**Do not externalize `electron-store` or `uuid`** — they are ESM-only and
`require()` cannot load them, so they **must stay bundled**. Check this list
before changing an import of a heavy dependency.

---

## Packaging (`electron-builder.yml`, NOT Electron Forge)

- `npmRebuild: true`, `afterPack: ./scripts/after-pack.js`,
  `afterAllArtifactBuild: ./scripts/compress-dmg.js`.
- `files:` explicitly lists the externalized native/CJS `node_modules` to ship
  (e.g. `node_modules/better-sqlite3/**/*`).
- `asarUnpack:` extracts `.node` binaries (`better-sqlite3`, `bufferutil`,
  `utf-8-validate`, `@img`) — `.node` files cannot be loaded from inside an asar.
  See `../big-question/native-module-packaging.md`.
- macOS packaging hard-references `resources/tools/darwin-<arch>` (cliclick) and
  `resources/python/darwin-<arch>`, so the prep steps must have run.

---

## Summary

| Fact             | Value                                           |
| ---------------- | ----------------------------------------------- |
| Package manager  | npm (`package-lock.json`)                       |
| Node             | ≥ 22 (`.nvmrc` = 22)                            |
| Native module    | better-sqlite3, rebuilt for Electron ABI        |
| Packager         | electron-builder (`electron-builder.yml`)       |
| Bundled (ESM)    | electron-store, uuid — must NOT be externalized |
| Quick main build | `node scripts/bundle-mcp.js && npx vite build`  |
