# Native Module Packaging with electron-builder + Vite

> **Severity**: P0 - App fails to start after packaging

## Problem

Development (`npm run dev`) works, but the packaged app crashes immediately with:

```
Error: Cannot find module 'better-sqlite3'
```

or a `.node` binary that can't be loaded from inside the asar archive, or a
`NODE_MODULE_VERSION` mismatch.

## Common native / binary modules in this repo

- `better-sqlite3` (SQLite — the app database)
- `bufferutil`, `utf-8-validate` (`ws` acceleration)
- `@img/*` (sharp's platform binaries)

Any module containing `.node` files is affected.

## Two independent concerns

Bundling (Vite) and packaging (electron-builder) are **separate steps**, and you
must configure BOTH:

| Concern   | Tool             | What it does                                     |
| --------- | ---------------- | ------------------------------------------------ |
| Bundling  | Vite             | Decides what to bundle vs `require()` at runtime |
| Packaging | electron-builder | Decides which files land in the app              |

If Vite externalizes a module but electron-builder doesn't ship it, you get
`Cannot find module` at runtime.

## Root cause & the three things that must line up

### 1. Vite: externalize the native module (`vite.config.ts`)

The main-process build lists native/CJS modules under
`rollupOptions.external` so they are `require()`d at runtime instead of bundled:

```
better-sqlite3, bufferutil, utf-8-validate, electron, ...
```

(ESM-only `electron-store` and `uuid` must stay **bundled** — see
`../shared/npm-electron-setup.md`.)

### 2. electron-builder: ship the module and unpack its `.node` (`electron-builder.yml`)

`files:` explicitly includes the externalized modules' `node_modules` folders:

```yaml
files:
  - dist/**/*
  - dist-electron/**/*
  - package.json
  - node_modules/@img/**/*
  - node_modules/better-sqlite3/**/*
  - node_modules/@anthropic-ai/sdk/**/*
  # ... the rest of the externalized deps
```

And `asarUnpack:` extracts the `.node` binaries — a `.node` file **cannot** be
loaded from inside an asar:

```yaml
asarUnpack:
  - node_modules/@img/**/*.node
  - node_modules/better-sqlite3/**/*.node
  - node_modules/bufferutil/**/*.node
  - node_modules/utf-8-validate/**/*.node
```

### 3. Rebuild against Electron's ABI

`electron-builder.yml` sets `npmRebuild: true`, and the `postinstall`
`npm run rebuild` builds `better-sqlite3` against Electron's headers
(`--runtime=electron --target=<version> --disturl=https://electronjs.org/headers`).
Without this: `NODE_MODULE_VERSION mismatch`.

> Tests run under **Node**, not Electron, so they need the module rebuilt for the
> Node ABI. `scripts/ensure-sqlite.js` (via `pretest` and the Vitest
> `globalSetup`) handles that flip. See `../shared/testing.md`.

## Verification

After `npm run build`, confirm the binaries were unpacked:

```bash
# macOS
ls -la "release/mac*/Open Cowork.app/Contents/Resources/app.asar.unpacked/node_modules/better-sqlite3/"
```

You should see the `.node` files under `app.asar.unpacked/`.

## Key Insight

**File externalized ≠ file shipped.** With electron-builder you configure three
things: Vite `external` (don't bundle), `files:` (include in package),
`asarUnpack:` (extract `.node`), plus `npmRebuild`/`postinstall` (correct ABI).
Miss any one and the packaged app fails at startup.

## Dependency chain

Native modules pull their own deps. If you add a new one, add it to `vite.config.ts`
`external`, `electron-builder.yml` `files:` (and `asarUnpack:` if it has `.node`),
and confirm it rebuilds for the Electron ABI. Test packaging early — see
`native-module-complex-deps.md`.
