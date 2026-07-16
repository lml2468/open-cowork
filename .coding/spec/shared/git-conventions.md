# Git Conventions

> Commit message format, branch model, and the pre-commit guards enforced in this repo.
>
> Enforced by: `commitlint.config.cjs`, `.husky/commit-msg`, `.husky/pre-commit`, `package.json` `lint-staged`.

---

## Commit Message Format

Conventional Commits, enforced by commitlint (`commitlint.config.cjs` extends
`@commitlint/config-conventional`). The `commit-msg` husky hook runs
`commitlint --edit` on every commit.

```
type(scope): description
```

### Allowed Types (hard rule — `type-enum`, level `2`/error)

Only these types are accepted (`commitlint.config.cjs`):

```
build  chore  ci  docs  feat  fix  merge  perf  refactor  release  revert  style  test
```

Anything else fails the commit. Note this list includes `merge` and `release`,
which are not in the stock config-conventional set.

### Header Length (hard rule — `header-max-length`, level `2`/error)

The header (`type(scope): description`) must be **≤ 100 characters**. Longer
headers are rejected.

### Examples

```bash
feat(memory): agent-managed Markdown memory (MEMORY.md + day/topic files)
fix(codex): make thread/resume authoritative before building the turn
refactor(memory): drop legacy core_memory.json migration
```

(These are real commits from this repo's history.)

Scope is optional but encouraged; use the affected subsystem, e.g. `codex`,
`memory`, `mcp`, `sandbox`, `remote`, `config`.

---

## Branch Model

- PRs normally target **`dev`** (the integration branch).
- **`main`** is for releases only.
- Feature branches: `feature/<name>`.
- Fix branches: `fix/<name>`.

---

## Pre-Commit Guards (`.husky/pre-commit`)

Two things run before every commit, in order:

### 1. `package-lock.json` guard

If `package-lock.json` is staged **without** `package.json`, the commit is
**blocked**. This catches accidentally committing lock churn from
`npm install` when you didn't intend to change dependencies.

- Did NOT mean to change deps: `git restore --staged package-lock.json && git restore package-lock.json && npm ci`
- DID change deps: also stage `package.json` (`git add package.json`).

See `npm-electron-setup.md` for `npm ci` vs `npm install`.

### 2. `lint-staged`

Runs on staged files only (`package.json` `lint-staged`):

| Glob                       | Commands                                |
| -------------------------- | --------------------------------------- |
| `*.{ts,tsx}`               | `eslint --fix`, then `prettier --write` |
| `*.{json,md,yml,yaml,css}` | `prettier --write`                      |

Because `eslint --fix` runs here and `@typescript-eslint/no-explicit-any` is an
**error** (see `code-quality.md`), a staged file containing `any` will fail the
commit.

---

## Pre-Commit Checklist

Before committing (mirrors the CI gate):

- [ ] `npm run lint` — 0 errors
- [ ] `npx tsc --noEmit` — 0 errors
- [ ] `npx vitest run` — all pass
- [ ] Commit header ≤ 100 chars, uses an allowed type
- [ ] `package-lock.json` only staged alongside `package.json`

---

## Summary

| Convention      | Rule                                      | Source                  |
| --------------- | ----------------------------------------- | ----------------------- |
| Commit type     | One of 13 allowed types (error if not)    | `commitlint.config.cjs` |
| Header length   | ≤ 100 chars (error)                       | `commitlint.config.cjs` |
| Branch target   | PRs → `dev`; `main` = releases            | Project convention      |
| Branch name     | `feature/<name>`, `fix/<name>`            | Project convention      |
| Lock file       | Blocked unless `package.json` also staged | `.husky/pre-commit`     |
| Staged auto-fix | eslint --fix + prettier on staged files   | `lint-staged`           |
