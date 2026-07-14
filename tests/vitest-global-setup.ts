import { execFileSync } from 'node:child_process';
import path from 'node:path';

/**
 * Vitest global setup: make sure better-sqlite3's native binary matches the
 * Node ABI the tests run under.
 *
 * The app rebuilds better-sqlite3 for Electron's ABI (see `predev` / packaging),
 * and a single compiled `better_sqlite3.node` can only satisfy one ABI at a time.
 * The `pretest` npm hook already runs `ensure-sqlite.js node`, but that hook is
 * skipped when the suite is invoked directly (e.g. `npx vitest run`), leaving the
 * binary built for Electron and every SQLite-backed test failing to load it.
 *
 * Running the same guard here covers those invocations too. `ensure-sqlite.js`
 * probes first and is a fast no-op when the binary already matches, so this adds
 * no cost on the common path.
 */
export default function setup(): void {
  const script = path.resolve(import.meta.dirname, '../scripts/ensure-sqlite.js');
  execFileSync(process.execPath, [script, 'node'], { stdio: 'inherit' });
}
