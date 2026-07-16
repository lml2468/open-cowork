# Testing

> How tests are structured and run in open-cowork. Tests are **required for every
> `feat` and `fix`** (CI gate: `npx vitest run` must pass).
>
> Sources: `vitest.config.mts`, `tests/vitest-global-setup.ts`,
> `tests/mocks/electron.ts`, `scripts/ensure-sqlite.js`, `package.json`.

---

## Runner & Config (`vitest.config.mts`)

- **Vitest**, `globals: true` (use `describe`/`it`/`expect` without importing —
  though most files import them explicitly anyway), `environment: 'node'`.
- `mockReset: true` and `restoreMocks: true` — mocks/spies auto-reset between
  tests; don't hand-roll teardown for them.

### Commands

| Task             | Command                                                 |
| ---------------- | ------------------------------------------------------- |
| Watch            | `npm run test`                                          |
| Single run (CI)  | `npx vitest run`                                        |
| One file         | `npx vitest run src/tests/remote/stdio-channel.test.ts` |
| One test by name | `npx vitest run -t "continues an existing session"`     |
| Coverage         | `npx vitest run --coverage`                             |

---

## Two Test Roots

`include: ['src/**/*.{test,spec}.{js,ts}', 'tests/**/*.{test,spec}.{js,ts}']`
matches **both** roots:

- **`src/tests/`** — mirrors the source path. `src/main/mcp/foo.ts` →
  `src/tests/mcp/foo.test.ts`. **New tests go here.**
- **`tests/`** (top-level) — a large existing flat set of tests, plus the
  fixtures (`tests/mocks/`, `tests/support/`) and `tests/vitest-global-setup.ts`.

Both run. Place new tests under `src/tests/` mirroring the source.

---

## Electron & electron-store handling

- **`electron` is aliased to a mock**:
  `alias: { electron: './tests/mocks/electron.ts' }`. Tests never depend on the
  installed Electron binary or the postinstall-generated `electron/path.txt`.
- **`electron-store` is inlined**: `server.deps.inline: ['electron-store']`
  (it's ESM-only and must be transformed for the test runtime).

If your code imports from `electron`, the test sees the mock — extend
`tests/mocks/electron.ts` if you need an API it doesn't yet stub.

---

## better-sqlite3 ABI (globalSetup)

The app rebuilds `better-sqlite3` for **Electron's** ABI, but tests run under
**Node**, and one compiled `.node` can only satisfy one ABI at a time.

- `globalSetup: ['./tests/vitest-global-setup.ts']` runs
  `scripts/ensure-sqlite.js node`, rebuilding better-sqlite3 for Node if needed
  (fast no-op when it already matches). This covers direct invocations like
  `npx vitest run` that skip the `pretest` npm hook.
- If a SQLite-backed test fails to load the native binary, this is why — re-run
  and let globalSetup fix the ABI.

---

## The Alias Footgun (read this)

Vitest aliases **only `@` → `src`** (`vitest.config.mts` `resolve.alias`). The
`@main` and `@renderer` aliases (valid in `tsconfig.json` + `vite.config.ts`) do
**not** exist under Vitest. In test code and anything it imports, use `@/main/…`,
`@/renderer/…`, or relative paths — never `@main/…`. See `typescript.md`.

---

## The Three Test Styles (real examples)

### 1. Pure-function unit test

`src/tests/config/auth-utils.test.ts` — imports a pure function relative
(`../../main/config/auth-utils`) and asserts input/output. No mocks, no fs.

```typescript
import { describe, it, expect } from 'vitest';
import { normalizeOpenAICompatibleBaseUrl } from '../../main/config/auth-utils';

describe('normalizeOpenAICompatibleBaseUrl', () => {
  it('returns undefined for empty string', () => {
    expect(normalizeOpenAICompatibleBaseUrl('')).toBeUndefined();
  });
});
```

### 2. Real-filesystem integration test

`src/tests/tools/tool-executor-fs.test.ts` — imports via **`@/main/…`**, creates
a real tmpdir in `beforeEach`, exercises the code, cleans up in `afterEach`.

```typescript
import { ToolExecutor } from '@/main/tools/tool-executor';
import { PathResolver } from '@/main/sandbox/path-resolver';

beforeEach(() => {
  tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cowork-tool-')));
  // ... register session, construct executor
});
afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
```

### 3. Module-mock test

`src/tests/mcp/mcp-manager.test.ts` — `vi.mock(...)` for `electron`, the logger,
and other deps; then reaches into private state via
`as unknown as <Type>` (**never** `as any` — that fails lint):

```typescript
vi.mock('electron', () => ({ app: { isPackaged: false, getPath: () => '/tmp/...' } }));
vi.mock('../../main/utils/logger', () => ({ log: vi.fn(), logError: vi.fn() /* ... */ }));

const internals = manager as unknown as TestManagerInternals;
```

---

## Coverage (v8)

- Provider `v8`. **`src/renderer/` is excluded** from coverage (also excluded:
  `src/tests/`, `tests/`, `dist*`, `*.d.ts`, `*.config.*`).
- Thresholds: **lines 30, functions 35, branches 28, statements 30**.

---

## Rules

- **Every `feat`/`fix` ships tests.** Mirror the source path under `src/tests/`.
- Import via `@/…` or relative paths in tests (not `@main`/`@renderer`).
- Cast to internals with `as unknown as <Type>`, not `as any`.
- Prefer real tmpdirs for fs work; rely on `mockReset`/`restoreMocks` for
  cleanup of mocks.
- `npx vitest run` must be green before merge.
