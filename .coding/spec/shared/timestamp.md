# Timestamp & Boolean Conventions

> **Rule**: Timestamps are **integer Unix milliseconds** via `Date.now()`,
> everywhere. Booleans are stored as **INTEGER `0`/`1`**.
>
> Sources: `src/main/db/database.ts`, `src/main/schedule/*`.

---

## Timestamps: integer Unix ms via `Date.now()`

There is **no ORM** in this repo — the DB layer is raw `better-sqlite3`
(`src/main/db/database.ts`). Timestamp columns are declared `INTEGER` and hold
JavaScript's `Date.now()` value (milliseconds since epoch) directly. There is no
`Date` <-> column conversion layer to worry about.

Real schema (`src/main/db/database.ts`):

```sql
CREATE TABLE IF NOT EXISTS sessions (
  ...
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS scheduled_tasks (
  ...
  run_at        INTEGER NOT NULL,
  next_run_at   INTEGER,        -- nullable
  last_run_at   INTEGER,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
```

Values are produced with `Date.now()` (e.g.
`src/main/schedule/scheduled-task-store.ts`: `const now = Date.now();`). The
scheduler injects a `now` function for testability
(`this.now = options.now ?? (() => Date.now())` in
`scheduled-task-manager.ts`) — same millisecond unit.

In TypeScript, these columns are typed `number` (see the row interfaces in
`database.ts`, e.g. `created_at: number; updated_at: number;`).

### Full-stack flow

```
Date.now()  ->  INTEGER column (better-sqlite3)  ->  number in row object
            ->  number in ServerEvent payload (IPC)  ->  number in renderer
            ->  formatted string ONLY at display time
```

---

## Rules

- **Store `Date.now()`** — integer milliseconds. Never seconds.
- **Never mix units.** `Math.floor(Date.now() / 1000)` (seconds) mixed with
  `Date.now()` (ms) produces off-by-1000x dates (`1970-…`). See
  `../big-question/timestamp-precision.md`.
- **IPC payloads carry the number**, not an ISO string. Do not
  `.toISOString()` into a `ServerEvent`; convert to a display string in the
  renderer.
- **Format only at the UI edge** — `new Date(ms).toLocaleString()`.

### Allowed non-numeric use

| Scenario   | Format     | Why            |
| ---------- | ---------- | -------------- |
| Log output | ISO string | Human-readable |
| UI display | Formatted  | User-facing    |

---

## Booleans: INTEGER `0`/`1`

SQLite has no boolean type; the repo stores booleans as `INTEGER` and maps at
the store boundary.

Schema (`database.ts`): `memory_enabled INTEGER NOT NULL DEFAULT 0`,
`enabled INTEGER NOT NULL DEFAULT 1`, `is_error INTEGER`.

Mapping (`src/main/schedule/scheduled-task-store.ts`):

```typescript
// read: INTEGER -> boolean
enabled: row.enabled === 1,

// write: boolean -> INTEGER
if (updates.enabled !== undefined) mapped.enabled = updates.enabled ? 1 : 0;
```

Do the `=== 1` / `? 1 : 0` conversion in the store layer so the rest of the code
works with real `boolean`s.

---

## Checklist for new timestamp/boolean columns

- [ ] Column declared `INTEGER` (add with `ensureColumn` if additive — see
      `../guides/db-schema-change-guide.md`).
- [ ] Written via `Date.now()` (or the injected `now`), in **milliseconds**.
- [ ] Row interface types it as `number` (timestamp) / mapped to `boolean`.
- [ ] IPC payload passes the raw `number`; formatting happens in the renderer.
- [ ] Boolean columns convert `=== 1` on read, `? 1 : 0` on write.

---

## Summary

| Concern    | Storage         | In TS     | Producer        |
| ---------- | --------------- | --------- | --------------- |
| Timestamp  | INTEGER (ms)    | `number`  | `Date.now()`    |
| Boolean    | INTEGER `0`/`1` | `boolean` | `? 1 : 0`       |
| UI display | —               | string    | `new Date(ms)…` |
