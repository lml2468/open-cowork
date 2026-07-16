# B1 Visual Verification

Verified by launching `npm run dev` (Node 22), fronting the "Open Cowork" Electron
window (PID distinct from the competitor WorkBuddy Electron process), and
screenshotting each state. UI language was Chinese; theme toggled to dark for the
dark check. Screenshots in `/tmp/cowork-study/`.

| #   | Point                                                                                           | Result                                                | What I saw                                                                                                                                                                                                                                                                                                          | Evidence                                      |
| --- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| 1   | WelcomeView composer + Start button under title, above skill cards, no scroll                   | PASS                                                  | Layout top→bottom: "Open Cowork" title → subtitle → API-not-configured notice → composer ("描述你想做的事情...") with "开始 →" button → then "或从技能开始" + 6 skill cards. Composer fully visible without scrolling at default window size.                                                                       | b1-01-welcome-light.png                       |
| 2   | Sidebar empty chat-history state (icon + copy + New chat CTA); search no-results state          | PASS (empty state visible); no-results code-confirmed | Sidebar shows EmptyState: MessageSquarePlus icon + "暂无任务" title + hint copy + "+ 新对话" CTA button. Search box + no-results EmptyState only render when `sessions.length > 0` (Sidebar.tsx L353, L416-421); not reachable in fresh no-creds state, but wired correctly (SearchIcon + noResults/noResultsHint). | b1-03-sidebar-empty.png                       |
| 3   | Titlebar brand label on Welcome; breadcrumb (brand + chevron + session title) when session open | PASS (brand visible); breadcrumb code-confirmed       | Custom Titlebar renders `window.brand` ("OPEN COWORK") uppercase label — visible in every screenshot. Breadcrumb adds ChevronRight + truncated `activeSessionTitle` when a session is active (Titlebar.tsx L35-47); session unreachable without creds, so only brand state visually confirmed.                      | b1-01-welcome-light.png                       |
| 4   | Settings ▸ Schedule and Connectors empty states with CTA                                        | PASS                                                  | Schedule: calendar icon + "暂无定时任务" + "在上方创建定时任务，即可自动运行提示词。" (create form above acts as CTA). Connectors (MCP): plug icon + "未配置连接器" + "添加连接器以启用 MCP 工具" + "添加自定义连接器" button.                                                                                      | b1-07-schedule-empty.png, b1-08-mcp-empty.png |
| 5   | Settings ▸ Skills in Chinese — localized built-in skill names/descriptions                      | PASS                                                  | Built-in skills show localized names + descriptions, not raw slugs: 开发前准备 ("在编写代码前梳理并对齐需求。"), 头脑风暴, 打破循环, 检查, 流程编排 — each with a BUILTIN badge.                                                                                                                                    | b1-09-skills-zh.png                           |
| 6   | Reusable EmptyState + Skeleton; loading skeletons on skill lists                                | PASS                                                  | EmptyState.tsx + Skeleton.tsx exist. EmptyState visually confirmed (Schedule, MCP, Sidebar). Skeleton wired into skill lists: WelcomeView.tsx L538 (`Skeleton`) and settings/SettingsSkills.tsx L480 (`SkeletonCardList count={4}`). Lists loaded too fast to catch skeletons visually, but wiring is correct.      | b1-02-welcome-dark.png                        |

## Dark theme

Welcome view in dark theme retains the same layout (composer + Start button under
title, cards below); no broken layout. Theme control is a 3-state cycle
(light → system → dark) via the moon/monitor/sun icon by the Settings entry.
Evidence: b1-02-welcome-dark.png.

## Regressions / notes

- No visual regressions observed. Layouts render cleanly in both themes.
- Skills storage path still shows legacy `.../open-cowork/claude/skills` (out of B1 scope; CLAUDE.md notes the dir rename).
- Points 2 (search no-results) and 3 (session breadcrumb) could not be exercised live because no API creds are configured (no sessions can be created); both were confirmed correct by source inspection.
