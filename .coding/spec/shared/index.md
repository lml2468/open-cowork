# Shared Development Guidelines

> Cross-cutting standards for open-cowork. Every rule here points at a real
> config file or source path in this repo.

---

## Documentation Files

| File                                             | Description                                             | When to Read           |
| ------------------------------------------------ | ------------------------------------------------------- | ---------------------- |
| [code-quality.md](./code-quality.md)             | Enforced quality rules (no `any`, prettier, CI gate)    | Always                 |
| [typescript.md](./typescript.md)                 | Real tsconfig flags, no-explicit-any, alias footgun     | Type-related decisions |
| [git-conventions.md](./git-conventions.md)       | Commit types, ≤100 header, branch model, commit guards  | Before committing      |
| [timestamp.md](./timestamp.md)                   | Unix-ms integers via `Date.now()`; boolean `0`/`1`      | Date/time & DB columns |
| [npm-electron-setup.md](./npm-electron-setup.md) | npm, Node ≥22, heavy postinstall, multi-stage build     | Setup & build          |
| [testing.md](./testing.md)                       | Vitest: two roots, electron mock, styles, alias footgun | Writing any test       |

---

## Core Rules (MANDATORY)

| Rule                                        | File                                       |
| ------------------------------------------- | ------------------------------------------ |
| No `any` (`no-explicit-any` = error)        | [code-quality.md](./code-quality.md)       |
| Import via `@` in test code (not `@main`)   | [typescript.md](./typescript.md)           |
| Commit ≤100 chars, allowed type only        | [git-conventions.md](./git-conventions.md) |
| Timestamps = integer Unix ms (`Date.now()`) | [timestamp.md](./timestamp.md)             |
| Tests required for every `feat`/`fix`       | [testing.md](./testing.md)                 |

---

## Before Every Commit (CI gate)

- [ ] `npm run lint` — 0 errors (`any` fails)
- [ ] `npx tsc --noEmit` — 0 errors
- [ ] `npx vitest run` — all pass
- [ ] Commit header ≤ 100 chars, allowed type
- [ ] `package-lock.json` only staged with `package.json`

---

**Language**: All documentation must be written in **English**.
