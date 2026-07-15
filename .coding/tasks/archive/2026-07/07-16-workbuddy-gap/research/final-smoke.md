# Final Integration Smoke Test — open-cowork (post B1–B6 merge to main)

Date: 2026-07-16 · Branch: chore/remove-trellis · App v3.3.1 · Driven via CDP (port 9223), node@22.

## Per-check results

1. **Welcome (no creds)** — PASS. Composer above the fold; scenario chips (全部/日常办公/编程开发/设计创意) + skills gallery (或从技能开始) + inspiration (获取灵感) + experts (邀请一位专家) all render together, no overlap. Toggling 编程开发 filtered galleries 22→14 items, composer stayed above fold. Evidence: final-01-welcome.png, final-01b-welcome-scrolled.png, final-01c-scenario-dev.png.
2. **Nav** — PASS. Rail = 技能/任务/连接 only; NO Experts/Files dead-ends (verified in DOM). Skills = storage dir + built-in list w/ toggles; Tasks = B6 automation templates (每日晨报…) + scheduler form; Connect = MCP connectors + presets. ⌘K palette opens (searches conversations + skills). Evidence: final-02a-skills.png, final-02b-tasks.png, final-02c-connect.png, final-02d-cmdk.png.
3. **Settings** — PASS. Exactly 6 tabs: API设置 / 安全中心 / 记忆 / 远程控制 / 日志 / 通用. No duplicate skills/connectors/schedule tabs. Security Center opens with deletion-protection toggle (破坏性删除前始终确认, ON) + always-on path/command guard badges. Evidence: final-03a-settings.png, final-03b-security.png.
4. **In-session (ollama/llama3)** — PASS (layout); PARTIAL (Changes-with-diff). Created throwaway ollama set (empty key, model=llama3) → isConfigured:true. Started session: ChatView renders WITH composer pills (llama3/技能/连接/执行) AND right ContextPanel (产物/文件/变更 tabs) AND header breadcrumb (🏠 > default_working_dir > hello) — all three columns coexist, no collision. Changes(变更) tab opens and works, but showed "不是 Git 仓库" because session cwd = userData default_working_dir (empty); could not repoint cwd to the repo — it uses an OS folder dialog undrivable via CDP, and the symlink workaround was out of scope. ollama returned expected "Provider not supported (codex 0.142 dropped wire_api=chat)". Evidence: final-04i-insession.png, final-04j-changes-tab.png.
5. **Dark + light** — PASS. Both themes render cleanly across welcome galleries and in-session 3-column layout; no broken contrast/overlap. Evidence: final-01\*.png (dark), final-05a-light-insession.png, final-05b-light-welcome.png.
6. **Console/runtime** — PASS. No Vite error overlay, no uncaught JS exceptions, no React crash during navigation. Only expected log noise: missing .env, and ECONNREFUSED / "Provider not supported" from the non-running ollama.

## Cross-batch integration

No regressions. B6 galleries do NOT push the composer below the fold (composer stays above; galleries scroll in the inner <main>). B4 breadcrumb + B3 panel toggle + B2 composer pills coexist without collision in-session. Scenario-chip filtering (B6) works without disturbing composer (B1).

## Cleanup

Killed dev server (no lingering open-cowork procs; WorkBuddy competitor left running). Restored config.json, config.public.json, and cowork.db byte-identical to start (md5 verified); theme back to dark, active set back to openai/gpt-5.4; throwaway ollama set + test session removed; default_working_dir untouched.

VERDICT: FINAL SMOKE: PASS

- One caveat only: Changes tab could not be exercised against a real git repo (cwd unsettable via CDP OS dialog); tab itself renders + handles non-git dir correctly.
