# Database

> Raw `better-sqlite3` in a **single file**, `src/main/db/database.ts`. There is
> **no ORM, no Drizzle, no migrations directory, no `schema.ts`.** All access
> goes through a typed facade returned by `initDatabase()`.

## Initialization

- `initDatabase()` (~L405) is singleton-guarded (returns the existing instance on
  re-entry). It opens `<userData>/data/cowork.db` (`getDatabasePath()`, ~L202)
  and returns a `DatabaseInstance`.
- Pragmas set at init: `journal_mode = WAL`, `synchronous = NORMAL`
  (`initializeSchema`, ~L223/L226), and `foreign_keys = ON` (~L420).
- `getDatabasePath` also self-heals a userData layout where the `data` dir or db
  file was clobbered by a file/dir of the wrong type.

## Schema management — no migration framework

On every startup:

- Tables are (re)created with idempotent `CREATE TABLE IF NOT EXISTS`:
  `sessions`, `messages`, `trace_steps`, `scheduled_tasks` (plus an unused
  `skills` table).
- New columns on existing tables are added with the hand-rolled
  `ensureColumn(db, table, col, definition)` (~L366): it reads
  `PRAGMA table_info(<table>)` and `ALTER TABLE ... ADD COLUMN` **only if the
  column is missing** (e.g. `openai_thread_id`, `codex_runtime_signature`,
  `model`, `execution_time_ms`, `schedule_config`).
- `ensureColumn` validates the table/column via `validateIdentifier` and checks
  the type against the `ALLOWED_COLUMN_TYPES` allowlist — no free-form DDL.

## Query pattern — the typed facade, not raw SQL

- Prepared statements are created **once** at init and reused.
- Consumers use the facade: `db.sessions.*`, `db.messages.*`, `db.traceSteps.*`,
  `db.scheduledTasks.*` — **not** raw SQL. (`db.raw`, `db.prepare`, `db.exec`
  exist for advanced/transaction use.)
- Dynamic `update` methods build `SET col = ?` clauses from `Object.entries`;
  **every column name passes through `validateIdentifier`** (regex
  `^[a-zA-Z_][a-zA-Z0-9_]*$`, ~L350). `IMMUTABLE_COLUMNS = {id, created_at}` are
  skipped (~L528); `updated_at` is always set to `Date.now()`.

## Transactions

Use the native better-sqlite3 transaction via `db.raw.transaction(fn)()`:

- `session-manager.ts:124` (the `TraceStepWriteQueue` sink) and
  `session-manager.ts:1085`.
- `trace-step-write-queue.ts:96` runs a whole flush batch in one transaction.

A transaction body must **throw** on failure to trigger rollback — never
silently `return` (see `error-handling.md`).

## Value conventions

- **Timestamps** = integer Unix epoch **milliseconds** via `Date.now()`. Never
  `CURRENT_TIMESTAMP`, ISO strings, or `Date` objects.
- **Booleans** = `INTEGER` `0`/`1` (e.g. `memory_enabled`, `enabled`, `is_error`).
- **Structured data** = JSON strings in `TEXT` columns (e.g. `content`,
  `mounted_paths`, `allowed_tools`, `token_usage`, `tool_input`).

## Anti-patterns

- Introducing an ORM (Drizzle) or a `drizzle/` migrations directory.
- Interpolating SQL with an unvalidated identifier (always `validateIdentifier`).
- Storing timestamps as ISO strings or `Date` objects, or using
  `CURRENT_TIMESTAMP`.
- Reaching around the facade with ad-hoc `db.prepare(...)` for routine CRUD.
