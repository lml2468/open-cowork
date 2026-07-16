# Skills Guidelines (`src/main/skills/`)

> File-based skills discovered from three tiers with project override, plus a plugin registry
> that drives the `claude` CLI. Skills are NOT stored in SQLite, and the skill MCP-server
> hooks are dead stubs.

---

## Discovery and precedence

When it applies: resolving which skills are active for a session/project.

`SkillsManager.getActiveSkills(sessionId, projectPath)` (`skills-manager.ts:649`) merges
three tiers and dedupes by name:

1. **Built-in** skills (`type === 'builtin'`, enabled), loaded from `.claude/skills/`
   directories (prod: `resources/skills`).
2. **Global**: `<userData>/claude/skills/` via `getGlobalSkillsPath()` (`:223`), which also
   imports `~/.claude/skills` **read-only**.
3. **Project**: `<projectPath>` skills — highest priority. A project skill **overrides**
   a global/builtin skill with the same name by index replacement (`:668-677`).

---

## Metadata and name validation

`getSkillMetadata(skillPath)` reads the `SKILL.md` YAML front-matter (the `name` /
`description` block between `---` markers). Every skill name passes `validateSkillName`
(`skills-manager.ts:27`), which rejects path separators and `..` — always call it before
using a name in a path.

---

## Hot-reload

`startStorageWatcher()` (`skills-manager.ts:347`) uses **chokidar** to watch the global
skills path with `depth: 3` and `awaitWriteFinish` (`:353-356`). On watcher error it falls
back to `setInterval` polling (`storagePollingTimer`, `:338`). Consumers subscribe via
`onStorageChanged(callback)` (`:265`), which returns an unsubscribe function.

---

## Plugin registry / runtime / catalog

Three separate services back plugins (distinct from file-based skills):

- `plugin-registry-store.ts` — singleton `pluginRegistryStore` (`:75`), electron-store
  backed by `plugin-registry.json`. **Source of truth** for installed plugins.
- `plugin-runtime-service.ts` — drives the `claude` CLI via `execFile` (`:3`) for
  install/uninstall and manifest reads.
- `plugin-catalog-service.ts` — scrapes the marketplace (`https://claude.com/plugins`,
  `:8`) with a 60s cache (`CACHE_TTL_MS = 60_000`, `:9`).

---

## Notable dead code (do not rely on)

- `startMcpServer(skill)` (`skills-manager.ts:686`) / `stopMcpServer(skillId)` (`:712`) are
  effectively TODO stubs. Real MCP lifecycle lives in `MCPManager` (see mcp.md), not here.
- The `skills` SQLite table (`src/main/db/database.ts:306`, commented "for future use") is
  **unused** — skills are file-based on disk.

---

## Anti-patterns

- Treating skill MCP servers as functional — they are stubs; use `MCPManager`.
- Assuming skills persist in SQLite — they live in `SKILL.md` files on disk.
- Skipping `validateSkillName` before building a filesystem path from a skill name.
