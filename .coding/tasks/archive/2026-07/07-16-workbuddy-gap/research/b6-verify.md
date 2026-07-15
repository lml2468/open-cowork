# B6 Verify — Activation & galleries

Driven via CDP on the open-cowork Electron window (port 9223; title "Open Cowork",
distinct from competitor WorkBuddy). UI locale zh-CN, no credentials configured —
all B6 surfaces reachable. Screenshots in `/tmp/cowork-study/`.

| #   | Point                                  | Result | Evidence                                              |
| --- | -------------------------------------- | ------ | ----------------------------------------------------- |
| 1   | Welcome layout intact + new sections   | PASS   | b6-01-welcome-full.png, b6-02-galleries.png           |
| 2   | Scenario chips re-filter galleries     | PASS   | b6-03-coding-filter.png                               |
| 3   | Inspiration card seeds composer        | PASS   | b6-04-inspiration-seed.png                            |
| 4   | Expert card seeds composer             | PASS   | b6-05-expert-seed.png                                 |
| 5   | Automation templates gallery + prefill | PASS   | b6-06-tasks-templates.png, b6-07-template-prefill.png |
| 6   | Dark theme                             | PASS   | b6-08-welcome-light.png, b6-09-welcome-dark.png       |

1. **Layout**: order is title → API-not-configured hint → composer (above the fold,
   unchanged from B1) → scenario chips (全部/日常办公/编程开发/设计创意) → skill cards →
   获取灵感 Inspiration gallery (6 cards) → 邀请一位专家 Experts gallery (6 personas).
   No overlap/break. Composer stays above the fold.
2. **Filter**: clicking 编程开发 (Coding) shrank Inspiration to 数据看板 + API 参考文档 and
   Experts to 代码审查员 + 重构向导; 全部 restored all 6+6. Quick-tag chips are replaced by
   installed skill cards (skills present), so re-filter is visible on the two galleries.
3. **Inspiration seed**: 工作周报 filled textarea with its weekly-report prompt; textarea
   focused, caret at end. Not sent.
4. **Expert seed**: 代码审查员 filled composer with persona framing
   "请作为严谨的代码审查员，审查以下改动…"; textarea focused.
5. **Automation**: Tasks (任务) page shows "从模板开始" gallery (5 templates) ABOVE the create
   form. Clicking 每周复盘 prefilled prompt + 执行模式=每周 + 执行星期=周一 + 执行时段=09:00
   (next run 2026-07-20 09:00), matching the template definition.
6. **Theme**: toggle (切换主题) cycles dark↔light↔system; dark is the default (no `.light`
   class). Both themes render all B6 sections cleanly.

No layout regression, broken filtering, or seed failure observed.

VERDICT: B6 VERIFY: PASS
