# Database Schema Change Thinking Guide

> **Purpose**: Ensure schema changes are fully deployed — code + additive
> migration + data cleanup.
>
> **Core Principle**: Schema change = code change + migration + data verification.
>
> **This repo has no ORM and no migration framework.** The DB layer is raw
> `better-sqlite3` in `src/main/db/database.ts`. Read that file before changing
> the schema.

---

## How schema works here

`initializeSchema(database)` in `src/main/db/database.ts` runs at startup and:

1. Creates every table with **`CREATE TABLE IF NOT EXISTS`** (idempotent — safe
   to run on every launch).
2. Adds columns that were introduced after a table's original shipping via
   **`ensureColumn(database, table, column, definition)`** — an additive
   migration helper.

There is no Drizzle/Prisma, no `drizzle-kit`, no `_journal.json`, no generated
SQL migration files. The DB file lives at `<userData>/data/cowork.db`.

### `ensureColumn` — the additive migration primitive

```typescript
ensureColumn(database, 'sessions', 'model', 'model TEXT');
ensureColumn(database, 'messages', 'execution_time_ms', 'execution_time_ms INTEGER');
```

It:

- validates the table/column identifiers and the type against an allowlist
  (`ALLOWED_COLUMN_TYPES`: `TEXT`, `INTEGER`, `REAL`, `BLOB`, and the
  `... NOT NULL DEFAULT` / `INTEGER DEFAULT` forms) — a SQL-injection guard;
- checks `PRAGMA table_info(<table>)` and returns early if the column already
  exists;
- otherwise runs `ALTER TABLE <table> ADD COLUMN <definition>`.

**`ensureColumn` only adds columns.** SQLite `ADD COLUMN` cannot add a
`NOT NULL` column without a default to a non-empty table, and SQLite has no
`ALTER COLUMN` / `DROP COLUMN` (older versions). For type changes or drops you
must rebuild the table (see Patterns below).

---

## Schema Change Checklist

### 1. Adding a new column (the common case)

- [ ] Add an `ensureColumn(...)` call in `initializeSchema` (and include the
      column in the `CREATE TABLE IF NOT EXISTS` for fresh installs, so new DBs
      and upgraded DBs converge).
- [ ] Update the row interface / types in `database.ts` and the store that reads
      the table (e.g. `session-manager`, `scheduled-task-store`).
- [ ] Update every INSERT/UPDATE statement that lists columns to include the new
      one.
- [ ] Timestamps → `INTEGER` (Unix ms); booleans → `INTEGER 0/1` mapped at the
      store boundary. See `../shared/timestamp.md`.
- [ ] `npx tsc --noEmit` — catches missed read/write sites.
- [ ] Add/extend a test under `src/tests/` (see `../shared/testing.md`).

### 2. Adding a new table

- [ ] Add a `CREATE TABLE IF NOT EXISTS` block in `initializeSchema`.
- [ ] Add matching `CREATE INDEX IF NOT EXISTS` for query hot paths.
- [ ] Foreign keys with `ON DELETE CASCADE` where child rows should follow the
      parent (as `messages` / `trace_steps` reference `sessions`).

### 3. Changing a column type / dropping a column (table rebuild)

SQLite cannot alter a column type in place. Rebuild:

```sql
-- 1. New table with the desired shape
CREATE TABLE table_new ( id TEXT PRIMARY KEY, /* ... */ col INTEGER NOT NULL );
-- 2. Copy with conversion
INSERT INTO table_new (id, /* ... */ col)
SELECT id, /* ... */ CAST(col AS INTEGER) FROM table_old;
-- 3. Swap
DROP TABLE table_old;
ALTER TABLE table_new RENAME TO table_old;
-- 4. Recreate indexes
CREATE INDEX ... ON table_old (...);
```

Do this inside a transaction, guarded so it only runs when the old shape is
detected (`PRAGMA table_info`).

### 4. Clean up existing data

- [ ] If the meaning/format of data changed, write a one-off `UPDATE` and make it
      **idempotent** (guard with a `WHERE` that no-ops on already-migrated rows).
- [ ] Verify with `SELECT typeof(col), COUNT(*) FROM t GROUP BY 1;`.

---

## Timestamp / format change: check ALL output points

A format change is never DB-only. Trace the full flow:

```
1. DB Schema (database.ts) — column definition + data migration
2. Store layer — row-object mapping (e.g. enabled === 1)
3. IPC — the ServerEvent payload that carries the field to the renderer
4. Renderer/UI — display formatting
5. Types — the row interface + any shared type
```

### Search commands

```bash
rg "toISOString|created_at|updated_at|timestamp" src/ --type ts
rg "ensureColumn|CREATE TABLE" src/main/db/database.ts
```

### Common mistakes

- **Only migrated some layers** — DB updated but a store/IPC path still emits the
  old format. Check every read/write site.
- **JSON columns not migrated** — columns like `mounted_paths`, `token_usage`,
  `schedule_config` store JSON as TEXT; timestamps _inside_ that JSON need the
  same treatment. Use SQLite `json_extract` / `json_set` to migrate and verify.
- **New writes still emit old format** — data migration fixes old rows only; the
  serializer/insert must also produce the new format.

---

## Verification SQL

```sql
PRAGMA table_info(table_name);                     -- column list & types
SELECT typeof(col), COUNT(*) FROM t GROUP BY 1;    -- value type distribution
SELECT * FROM t WHERE typeof(col) != 'integer' LIMIT 10;
```

---

## Common Pitfalls

| Pitfall                                | Fix                                                  |
| -------------------------------------- | ---------------------------------------------------- |
| `ADD COLUMN ... NOT NULL` (no default) | Add nullable + backfill, or give a DEFAULT           |
| Expecting `ALTER COLUMN` to exist      | Rebuild the table (Pattern 3)                        |
| Forgot to update INSERT column list    | `tsc` won't catch raw SQL — grep the statements      |
| Prod has old-format data, dev doesn't  | Write idempotent migration that handles both formats |

---

**Core Principle**: schema change = code + additive `ensureColumn`/rebuild +
data cleanup + verification. `CREATE TABLE IF NOT EXISTS` and `ensureColumn` make
startup idempotent — keep them that way.
