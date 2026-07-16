# Timestamp Precision: Seconds vs Milliseconds

> **Severity**: P1 - Data sync fails, validation errors, dates from 1970

## Problem

A timestamp is stored or sent in **seconds**, but JavaScript's `new Date(n)`
expects **milliseconds**. The value gets interpreted as a moment in 1970:

```
Received timestamp: 1749710629
Parsed as: 1970-01-21T05:41:50.629Z   // Wrong!
Expected:  2025-06-12T10:43:49.000Z   // Correct
```

The value `1749710629` is seconds; `1749710629000` is the same instant in ms.

## Symptoms

- Dates render as 1970-something in the UI.
- API/auth calls fail validation on a timestamp.
- Works in one environment, fails in another (mixed old/new data).

## Root Cause

Two systems disagree on the unit:

| Source                                             | Unit         |
| -------------------------------------------------- | ------------ |
| JavaScript `Date.now()`                            | milliseconds |
| JavaScript `new Date(n)`                           | milliseconds |
| A Unix timestamp from most APIs / `strftime('%s')` | seconds      |

This repo's convention is **milliseconds everywhere** (`../shared/timestamp.md`):
DB `INTEGER` columns hold `Date.now()`, and `better-sqlite3` returns them as
plain `number`s (there is **no ORM** doing a hidden seconds/ms conversion). The
bug appears when a _seconds_ value enters from outside — an external API, a
hand-written SQL default like `unixepoch()` (seconds!), or code that did
`Math.floor(Date.now() / 1000)`.

## The Mismatch

```typescript
// WRONG: unixepoch() returns SECONDS
db.exec(`UPDATE t SET created_at = unixepoch() WHERE id = ?`); // seconds!

// Reading it back
new Date(row.created_at); // 1970-... — WRONG
new Date(row.created_at * 1000); // correct, but now units are inconsistent
```

## Solution

### 1. Always write milliseconds

Use `Date.now()` (or `unixepoch('subsec') * 1000` / `strftime('%s') * 1000` if
you must default in SQL). Never store bare seconds.

```typescript
stmt.run({ created_at: Date.now(), updated_at: Date.now() });
```

### 2. Normalize any seconds value at the boundary

If an external source gives seconds, convert on the way in:

```typescript
const ms = raw < 1e11 ? raw * 1000 : raw; // < ~1973 in ms => it's seconds
```

### 3. One-off migration for existing seconds data (raw SQL)

There is no ORM migration tool here — write an idempotent `UPDATE` (see
`../guides/db-schema-change-guide.md`):

```sql
-- Only rows still in seconds (10-digit) get multiplied
UPDATE t SET created_at = created_at * 1000
WHERE created_at IS NOT NULL AND created_at < 10000000000;
```

## Why the guard `< 10000000000`?

```
Seconds  (2025): 1749710629      (10 digits)
Millis   (2025): 1749710629000   (13 digits)
```

A value below 10^10 is almost certainly seconds, so the migration is
**idempotent** — running it twice won't double-convert.

## Prevention

- [ ] Store `Date.now()` (ms). Never `Math.floor(Date.now() / 1000)`.
- [ ] SQL defaults: if you use `unixepoch()`/`strftime('%s')`, multiply by 1000.
- [ ] Normalize any externally-sourced timestamp to ms at the boundary.
- [ ] Add a round-trip test: write `Date.now()`, read back, assert equality
      (`../shared/testing.md`).
