# B4 Verify — IA Consolidation & Orientation

Live-driven via CDP (remote-debugging port 9223) against `npm run dev` Electron (Open Cowork, zh-CN, dark theme as-found). Part B unlocked via throwaway config set: provider=ollama, empty key, baseURL localhost:11434/v1, model=llama3. Turn errored on ollama (codex 0.142 dropped wire_api="chat") as expected — ChatView rendered fine.

| #   | Check                      | Result | Notes                                                                                                                                                                                                                                 | Evidence                   |
| --- | -------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| 1   | Nav rail no dead-ends      | PASS   | Nav shows only 技能/任务/连接. Each lands on real feature content: Skills (storage dir + builtin skill toggles), Tasks (schedule creation form), Connect (MCP connectors + presets). No Experts/Files/coming-soon.                    | b4-01, b4-02, b4-03, b4-04 |
| 2   | ⌘K command palette         | PASS   | Cmd+K opens overlay; enabled skills listed as results with zero sessions; typing "check" filters; Enter on a skill navigated from Connect→Skills page. Sidebar 搜索 (⌘K) trigger fires same `setShowGlobalSearch` (source-confirmed). | b4-05, b4-06, b4-07        |
| 3   | Settings de-duplication    | PASS   | Settings shows exactly 6 config tabs: API/沙盒/记忆/远程控制/日志/通用. No Skills/Connectors/Schedule tabs. Those features intact only in nav rail (point 1).                                                                         | b4-08                      |
| 4   | Dark theme                 | PASS   | App as-found already dark (config.public.json theme=dark); all views legible/consistent.                                                                                                                                              | b4-01…b4-21                |
| 5   | ChatView header breadcrumb | PASS   | Header: 🏠Home › default_working_dir › "hello test" (3-part). Right actions: search + 切换工作区面板 toggle (titles confirmed). MCP pill correctly hidden at 0 connectors (conditional). Toggle hides/shows right workspace panel.    | b4-16, b4-17               |

Regressions: none. No stranded features, no broken nav.

Part-B caveat: cwd shown as `default_working_dir` not the repo — the native folder picker / Zustand store aren't scriptable via CDP. Breadcrumb structure, actions, and panel toggle fully exercised; ChatView.tsx (L598-666) confirms crumb = `activeCwd` basename.

## Cleanup — DONE

- Test session "hello test" deleted (select-mode batch delete). Session list empty.
- Throwaway config set "新方案" deleted; active back to 默认方案(default).
- config.public.json verified identical to original: theme=dark, provider=openai, model=gpt-5.4.
- Dev server killed (no open-cowork electron/vite; port 5173 free). WorkBuddy left running.

## VERDICT

B4 VERIFY: PASS
