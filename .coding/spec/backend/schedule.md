# Schedule Guidelines (`src/main/schedule/`)

> A **timer-based** scheduled-task engine (NOT a cron parser). Tasks fire discrete times /
> weekdays / intervals; execution is delegated to an injected callback so the manager never
> knows about sessions.

---

## Types

Defined in `scheduled-task-manager.ts`:

- `ScheduleRepeatUnit = 'minute' | 'hour' | 'day'` (`:20`).
- `ScheduledTaskWeekday = 0..6` (`:21`).
- `ScheduledTaskScheduleConfig` (`:34`) is a union: daily `{ times[] }` or
  weekly `{ weekdays[], times[] }`.
- `ScheduledTask` (`:44`+): `nextRunAt`, `scheduleConfig`, `repeatUnit`, `repeatEvery`,
  `enabled`, timestamps.

Times are validated against `^([01]\d|2[0-3]):([0-5]\d)$` (`:475`).

---

## Store

`createScheduledTaskStore(db)` (`scheduled-task-store.ts:10`) is a facade over
`db.scheduledTasks.*` (SQLite). It maps snake_case rows ↔ camelCase objects
(`mapRowToTask`, `:62`), JSON-stringifies `scheduleConfig` into `schedule_config`
(`:26`, `:82`), stores `enabled` as `0/1` (`:29`, `:86`), and timestamps as epoch-ms.
`parseScheduleConfig` (`:93`) reverses the JSON.

---

## Engine — timers, not cron

When it applies: any change to when/how tasks fire.

`ScheduledTaskManager` (`scheduled-task-manager.ts:110`):

- `scheduleTask(task)` (`:270`) arms a `setTimeout` for `nextRunAt - now()`, clamped to
  `MAX_TIMER_DELAY_MS = 2_147_483_647` (~24.8d, the 32-bit limit; `:95`, `:276`). If
  clamped, it re-arms on the next trigger.
- `handleTrigger(taskId)` (`:286`) re-checks `nextRunAt` (re-arms if still in the future)
  and guards re-entrancy via the `executingTasks` Set (`:116`, `:295`).
- `prepareExecution(task)` (`:323`) computes + persists the next run for repeating tasks, or
  disables one-time tasks.
- Execution is **DELEGATED** through the injected `executeTask(task)` callback (`:105`,
  `:112`) — the manager knows nothing about sessions. `src/main/index.ts` wires
  `executeTask` to the session manager (`index.ts:1000`, `:1444`).
- `now()` is injectable (`:123`) for deterministic tests.

`computeNextRunAt` (`:447`) uses `findNextScheduledSlot` (`:513`) for `scheduleConfig` — it
scans up to 14 days ahead in **LOCAL** time (`:525`, `new Date(...)`/`setHours`) — otherwise
falls back to interval math via `getIntervalMs` (`:460`).

CRUD: `create` / `update` / `delete` / `toggle` (refuses to enable an overdue one-time task,
`:239-240`) / `runNow` (`:251`).

---

## Anti-patterns

- Adding a cron-expression parser — the model is discrete times / weekdays / intervals, not
  cron strings.
- Running execution logic inside the manager instead of the injected `executeTask` callback.
- Forgetting the 32-bit `MAX_TIMER_DELAY_MS` clamp for far-future runs.
- Computing schedule slots in UTC — scheduling is **local time**.
