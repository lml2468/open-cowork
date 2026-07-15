# B3 Verify — Tabbed Workspace Panel (ContextPanel: Artifacts / Files / Changes)

Session unlocked via **ollama** provider (empty API key, model `llama3`, baseURL 127.0.0.1:11434/v1) in a throwaway config set. Agent turn errored on ollama (codex 0.142 dropped `wire_api="chat"`) as expected — ChatView + right ContextPanel rendered fine. Working dir set to this repo (`/Users/limenglin/workspace/open-cowork`), which has 150 uncommitted changed files — ideal Changes-tab data. UI locale was zh-CN.

| Check                                               | Result | Notes                                                                                                                                                                                                                                                                                                          | Evidence                                                         |
| --------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Header + segmented tab bar                          | PASS   | Header "工作空间" + collapse chevron; stats row (model `llama3`, msg count 2, tool count 0); segmented tabs 产物/文件/变更 render, active-state highlight works.                                                                                                                                               | b3-02-session-started.png                                        |
| Files tab                                           | PASS   | Dirs first (folder icon + chevron), then files with sizes (e.g. `.editorconfig 278 B`). Breadcrumb `/ > src` nav works (clicked into src → main/preload/renderer/shared/tests). Clicking `session-title.ts` shows inline monospace preview with path header, size (873 B), back arrow + reveal-in-finder icon. | b3-03-files-tab.png, b3-04-files-src.png, b3-05-file-preview.png |
| Changes tab                                         | PASS   | Header "150 个文件已变更 +20328 −549" + refresh icon; each row shows path + green +N / red −N. Expanding a file renders git-style unified diff: hunk header `@@ -0,0 +1,40 @@`, line-number gutters, `+`/`−` markers, green add / red del tinting.                                                             | b3-06-changes-tab.png, b3-07-changes-diff.png                    |
| Artifacts tab (no regression from 702→190 refactor) | PASS   | Default tab still renders 产物 (empty state "尚无产物"), 工作目录 (`~/workspace/open-cowork` w/ copy+reveal icons), MCP 连接器 ("未配置连接器"). All prior content intact.                                                                                                                                     | b3-02-session-started.png                                        |
| Dark theme                                          | PASS   | Toggled to dark; entire panel (bg, tabs, diff line numbers, +/− stats, previews) legible and consistent. No contrast/layout breakage.                                                                                                                                                                          | b3-08-dark-theme.png                                             |

No layout bugs, broken diffs, or crashes observed.

## Cleanup — DONE

- Test session ("List the files here") deleted; session list now empty.
- Throwaway config set `set-2` (b3-ollama-tmp) deleted; switched back to `default`.
- Theme restored to `light`. Final config verified identical to original snapshot: active=default, provider=openai, model=gpt-5.4, isConfigured=false, single `default` set.
- `workdir.set` was called without a sessionId (renderer UI-state only, not persisted) — nothing to restore.
- Dev server (electron + vite) killed; port 5173 free; competitor WorkBuddy left running (untouched).

## VERDICT

B3 VERIFY: PASS
