# WorkBuddy — UI / UX & Feature Teardown

Clean-room study via rendered-UI screenshots only (no source inspection). App version shown in-app: **WorkBuddy v5.2.6**, macOS Electron desktop app. UI language: **Chinese (Simplified)**. Study shots live in `/tmp/workbuddy-study/`.

> Note on windows: WorkBuddy is a single ~1200×800 **rounded floating window** with its own in-window title bar (traffic lights + toolbar row). During the study another AI app (**Poe**) was open behind it; two shots (13, 14) captured Poe by mistake and are excluded from this analysis.

---

## Overview

WorkBuddy is a consumer/prosumer **AI "work superpower" agent app** ("你的职场超能力" = _your workplace superpower_). It is far broader than a single chat window — it bundles:

- a multi-model chat/agent runtime (credits-metered, many Chinese LLMs),
- a **marketplace triad**: Experts (agent personas) · Skills (tools/plugins) · Connectors (MCP-style app integrations),
- **Projects** (collaborative multi-person workspaces with templates),
- **Automation** (cron-like scheduled tasks),
- an **Inspiration** gallery of clonable rich-HTML deliverable templates,
- knowledge bases / file surfaces,
- a per-conversation **workspace side-panel** (artifacts / files / git-style diffs),
- a comprehensive **sandbox + data Security Center**,
- gamified credits/rewards economy.

**Layout paradigm:** a single window with a **left primary nav rail (text labels, not just icons)** + main content pane + an on-demand **right workspace panel**. It reads like "Notion/Linear sidebar meets ChatGPT composer meets a coding-agent's file/diff panel." Density is comfortable-to-airy, rounded, very light, heavily card-based.

---

## Information Architecture (navigation map)

Left sidebar (top → bottom), header shows `WorkBuddy v5.2.6`:

- **新建任务** (New Task) → home / launcher (scenario chips + big composer). _Shot 01_
- **助理** (Assistant) → a persistent "local assistant" chat, can be **connected to a WeChat mini-program**. _Shot 02_
- **项目** (Projects) → collaborative workspaces + project templates. _Shot 03_
- **专家·技能·连接器** (Experts · Skills · Connectors) → 3-tab marketplace. _Shots 04–07_
  - 专家 (Experts): agent personas + expert teams. _Shot 05_
  - 技能 (Skills): tools/plugins (installable). _Shot 06_
  - 连接器 (Connectors): app integrations. _Shot 07_
- **自动化** (Automation) → scheduled tasks + run history + template gallery. _Shot 08_
- **更多** (More: 资料库·灵感) → popover: 我的文件 / 腾讯文档 / ima知识库 / 乐享知识库 / **灵感** (Inspiration). _Shots 09–10_
- **空间 (Spaces, 3)** → workspaces/projects (`test`, `项目新手指引`, `RD`), each expands to its **session list** (with relative timestamps + `…` row menu). _Shot 01, 16_
- **Account footer** (avatar "Merlin" + bell + mini-program link) → account/credits/theme/settings popover. _Shot 27_

A conversation opens in the main pane with a **breadcrumb** (`项目 / test / <session>`), header actions (search, sync, share/add-people, right-panel toggle), and can reveal the **right workspace panel** (产物 / 工作空间文件 / 变更). _Shots 16, 23–26_

Global **Settings** (modal, 11 categories) reached from account popover → 设置. _Shots 28–32_

---

## Per-Surface Teardown

### 1. Home / New Task launcher — _Shot 01_

- **Purpose:** zero-state entry to start any task.
- **Layout:** big serif-ish wordmark "WorkBuddy / 你的职场超能力", a segmented scenario switcher (**日常办公 / 代码开发 / 设计创意** = daily office / coding / design), a row of quick-action chips (文档处理, 金融服务, 数据分析及可视化, 更多), then a large rounded **composer** ("今天帮你做些什么？@引用对话文件，/调用技能与指令" = _reference files with @, invoke skills/commands with /_).
- **Components:** composer footer with `+`, model selector "Auto", mic, circular send; sub-row "选择工作空间" (choose workspace) + "默认权限" (default permissions). A promo pill top-right: "做任务赢积分好礼" (earn credits by doing tasks). A cute cat-robot mascot peeks over the composer.
- **Visual style:** near-white, generous whitespace, dark pill for the active segment; friendly, mascot-driven.

### 2. Assistant (助理) — _Shot 02_

- **Purpose:** a standing "local assistant" chat separate from project sessions.
- **Notable:** header "本地助理 · 已连接：微信小程序" (connected to a WeChat mini-program) with a gear. Footer disclaimer "内容由 AI 生成，请核实重要信息."
- Same composer pattern as home.

### 3. Projects (项目) — _Shot 03_

- **Purpose:** "多人协同，打造超级团队" — collaborative multi-person workspaces.
- **Layout:** hero illustration (line-art team), primary **+ 新建项目**, "我的项目" grid of project cards (icon, name, "added N ago", `…` menu) + a search box, then **从模版创建** (create from template): 产品需求全流程 / 市场调研与竞品分析 / 团队知识库 / 项目交付.
- **Style:** clean cards, subtle borders, playful hero art.

### 4. Experts marketplace (专家) — _Shots 04–05_

- **Purpose:** browse/install **agent personas** ("experts") and **expert teams** (专家团).
- **Layout:** top tabs 专家/技能/连接器 + search + "我的专家". **精选场景** (featured scenarios) as 4 image-topped cards (内容创作 / 投资分析 / 法律咨询 / 小微企业), each listing member experts. Then 专家/专家团 toggle, 最热/最新 sort, a **category chip row** (全部, OPC·一人公司, 腾讯专家, 产品设计, 技术工程, 金融投资, 全球发展, 游戏空间, 数据智能, 营销增长, 内容创作), then a **3-col card grid** — each card = avatar, name, subtitle/author, description, and **tag chips**.
- **Loading:** skeleton placeholder cards while fetching (_Shot 04_).

### 5. Skills marketplace (技能) — _Shot 06_

- **Purpose:** install **tools/plugins** the agent can call.
- **Layout:** "我安装的 1" (installed count) + **添加技能**. **精选技能** with a **换一换** (shuffle) affordance; cards each have a **`+` install** button. Sub-tabs 推荐 / SkillHub / 套件 (bundles), same category chip row. Examples seen: MarkItDown (doc→Markdown, PDF/Word/PPT/OCR/audio/web), Excel/Word gen, **Web Access (CDP direct-to-local-Chrome, parallel batch)**, financial data, Tencent Maps/Survey/Weiyun.

### 6. Connectors marketplace (连接器) — _Shot 07_

- **Purpose:** **MCP-style integrations** to real apps. "自定义连接器" (add custom).
- **Content:** heavy Tencent ecosystem (通达信, 腾讯自选股, QQ邮箱, 腾讯文档, 腾讯会议, 企业微信, 微云, 腾讯问卷) plus **飞书/Lark, 钉钉/DingTalk, TAPD, CNB, ima/乐享知识库**. Each card = icon, name, natural-language capability blurb, `+` add.

### 7. Automation (自动化) — _Shot 08_

- **Purpose:** cron-like scheduled agent tasks.
- **Layout:** tabs 定时任务 / 运行记录 (run history). Friendly **empty state** (alarm-clock glyph, "开启你的第一个自动化任务吧" + **+ 添加自动化**). **自动化任务模版** grid: daily AI news, 5 English words/day, kids bedtime story, weekly work report (repo PR/Issue summary), classic-movie rec, this-day-in-history, daily "why", **call-your-parents reminder**, health-checkup reminder, interview-prep, meeting-prep, cute-pet wallpaper.

### 8. More → Inspiration (灵感) — _Shots 09–11_

- **Popover (Shot 09):** 我的文件 / 腾讯文档 / ima知识库 / 乐享知识库 / 灵感.
- **Inspiration gallery (Shot 10):** "常见工作流沉淀成可复用的任务起点" (workflows distilled into reusable starting points). "我的收藏" + search + category chips. Cards are **visual thumbnails of generated artifacts** (mostly interactive **HTML**): team OKR radar chart, today's AI daily report, real-time collaboration whiteboard, Dali guesthouse recommendation page, interactive 2025 annual report, OpenAI 7-day tracker. Each card: "官方" (official) badge + heart (favorite).
- **Inspiration detail modal (Shot 11):** left = **live interactive preview** (e.g., a working Miro-like Whiteboard with select/rect/pen/line/move tools, color swatches, thickness slider); right = title, **tag categories** (HTML, 协作白板, Canvas交互, 原型设计, 团队协作), **使用的工具集** = which **Skills** produced it (前端开发, 高品质前端设计 — i.e., provenance!), description, and top actions **+ 做同款** (make one like this), favorite, fullscreen, close.

### 9. Conversation view — _Shots 16–17_

- **Purpose:** the actual chat/agent thread inside a project.
- **Header:** breadcrumb `项目 / test / 制定代码审查标准和流程`; right icons = search, sync/refresh, share (add-people), right-panel toggle.
- **Message rendering:** rich Markdown — **tables** (bordered, header row), headings, bullets, **inline code** chips (`needs-human-triage`, `<details>`). Assistant messages end with **artifact/file cards** (M-badge icon, filename, size, open-arrow), a summary row **查看所有产物 (2)** / **查看所有变更 (2)**, and an action row **copy / 👍 / 👎 / …**.
- **Composer (rich):** placeholder "今天帮你做些什么？@引用对话文件，/调用技能与指令"; pill row = **Expert/Mode selector** (代码审查专家) · **Model picker** (Hy3) · **技能** (Skills) · **连接器** (Connectors) · `+` attach · mic · send. Footer disclaimer.

### 10. Model picker — _Shot 19_

- Dropdown with a **"Max 模式" toggle** at top (heavier/agentic mode), then models each with a **credit-cost multiplier**: Auto · **Hy3 [限时免费] 0.00×** (selected, promo) · GLM-5.2 [夜间折扣 night discount] 0.79× · GLM-5.1 0.79× · GLM-5v-Turbo 0.95× · MiniMax-M3 0.25× · Kimi-K2.7-Code 0.57× · Kimi-K2.6 0.52× · Deepseek-V4-Flash 0.06× · Deepseek-V4-Pro 0.16×. (All Chinese-ecosystem models; promo badges.)

### 11. Expert / Mode picker — _Shot 20_

- Combines **operating modes** (**Craft**, **Plan** — each with an info tooltip) with the selected **Expert persona** (代码审查专家, "以鹰眼标准检查每行代码…", avatar, expandable `>`). One control = "how it works" (plan vs execute) + "who it acts as".

### 12. Composer Skills / Attach / @-mention — _Shots 21–22, 35_

- **技能 dropdown (21):** searchable skill picker + **上传技能** (upload custom skill); "未找到技能" when none attached.
- **`+` attach (22):** 本地文件 (local file) · 项目资产 (project assets).
- **@-mention (35):** typing a filename auto-surfaces a **file-reference suggestion chip** (green) to attach that workspace file inline.

### 13. Right workspace panel — _Shots 23–26_

- Tabs: **产物** (Artifacts) · **工作空间文件** (Workspace files) · **变更** (Changes).
- **变更 (24):** git-style **diff stats** header "文件变更 +1403 -0" and per-file rows (`code-review-standards.md +389`, `issue-triage-loop-engineering.md +1014`, additions green).
- **Diff viewer (25):** line-numbered, syntax-highlighted, all-green additions, copy/download.
- **工作空间文件 (26):** file dropdown + preview area (a mini file browser/previewer).

### 14. Account / credits popover — _Shot 27_

- Username + copy; **体验版** (free tier) + **升级**; a gamified **"Buddy加油站"** rewards card (season "4期·7/22结束", "每日可领 100 通用积分", claimed today, cumulative); **积分余额 4,105.89**; **成长计划** (login-streak merch draw); **设置**; **外观** Light/Dark toggle; 帮助与反馈; 检查更新; 退出登录.

### 15. Settings modal — _Shots 28–32_

11 left categories: 账户管理 / 系统设置 / 智能体设置 / 快捷键 / 记忆 / 模型 / 助理设置 / 个性化 / 数据管理 / 安全中心 / 帮助与反馈.

- **系统设置 (28):** display language, **font-size slider** (小–默认–大), skill auto-update, auto-install non-high-risk skills (with security scan), **锁屏远程** (keep Mac awake for phone remote-control + automations), **默认工作空间存储路径** `~/WorkBuddy`, telemetry (体验优化计划).
- **模型 (29):** add **custom/BYO models** written to local `~/.workbuddy/models.json`, surfaced under a "Custom models" group in the chat model dropdown.
- **智能体设置 (30):** 禁用全部插件 (kill-switch for all Skills/MCP/plugins), 禁用智能体团队 (disable auto-forming **multi-agent teams**; expert-teams still enable it), **本地技能与记忆沉淀** (auto-log local memory/work-logs and **auto-distill & optimize Skills**, stored locally).
- **记忆 (31):** ChatGPT-style **memory** (生成对话记忆) with an **editable extracted user-profile card** ("memory from conversations", "updated 77 days ago"), plus **从其他AI导入记忆** (import memory from other AI apps).
- **安全中心 (32):** the standout. **沙箱安全** (sandbox: file whitelist/blacklist, command ask/allow-lists by prefix, network URL/domain rules); **数据安全** (安全网关 security gateway on, 传输加密 E2E on, 删除保护 → trash first, **批量删除审批** threshold 50); **内置运行时** (bundled Python / Node.js / Git Bash, per-tool toggles). "安全能力由本地运行时提供."

### 16. Dark theme — _Shots 33–34_

- Full, consistent dark mode: near-black surfaces (~#0e0e10 content, slightly lifted ~#1c1c1e sidebar), light-gray text, subtle elevation on selected nav item and cards, green accent preserved. Toggled instantly from the account popover.

---

## Visual Design Language

- **Color:** predominantly **white/near-white** in light mode (bg ~#FFFFFF, panels ~#F6F6F7, hairline borders ~#ECECEC). **Accent = a fresh green** (mascot + brand, ~#2FB57C-ish / emerald), used sparingly (selected model check, rewards card, avatar). Neutral text near-black (~#1A1A1A) with gray secondary (~#8A8A8A). Dark mode = charcoal/near-black with the same green accent. Cost/promo badges use small pastel/red pills.
- **Density/spacing:** comfortable, airy; large tap targets; roomy card padding; multi-column grids for marketplaces/galleries.
- **Corners:** consistently **rounded** — cards ~12–16px, pills fully rounded, composer ~16px, big modal ~16px+; the whole window is a rounded rectangle.
- **Elevation:** soft, low-contrast shadows; mostly flat with hairline borders; modals dim the backdrop.
- **Typography:** clean sans (system CJK), clear hierarchy; oversized friendly wordmark on home; body ~14–15px; monospaced for code/diffs.
- **Iconography:** thin **line icons** (lucide/feather-like), 2-tone brand marks for connectors/skills, circular avatars for experts; friendly **cat-robot mascot** for personality.
- **Motion:** skeleton shimmer while loading marketplaces; dropdown/popover reveals; instant theme switch.

---

## Interaction & Feedback Patterns

- **Streaming/thinking/tool-calls:** not directly observed live (attempting to force one was correctly out of scope). In completed threads, tool output surfaces as **artifact/file cards** + a **产物/变更 summary row**, not raw tool logs; deeper detail lives in the **right workspace panel** (files + **git-style diffs**).
- **Provenance:** Inspiration items and (implicitly) outputs show **which Skills produced them**.
- **Empty states:** friendly glyph + one-line encouragement + single primary CTA (Automation; Skills "未找到技能").
- **Loading:** **skeleton cards** (Experts) and per-view spinners.
- **Modals:** centered, backdrop-dimmed, `×` close (Settings, Inspiration detail).
- **Popovers:** account menu, More menu, composer dropdowns — anchored, light, rounded.
- **Permissions/safety:** surfaced as **first-class settings** (Security Center: sandbox path/command/network rules, deletion protection, bulk-delete approval) and **skill security scanning** before install.
- **Confirmations of cost:** the model list shows **credit multipliers** inline — the user always sees relative cost before choosing.

---

## Feature Inventory

- Multi-model chat/agent with **credits economy** + per-model cost multipliers; **Max mode** toggle; **Auto** routing.
- **Custom/BYO models** via local `models.json`.
- **Experts** = installable agent personas; **Expert Teams**; **auto-forming multi-agent teams**.
- **Skills** marketplace (installable tools/plugins) + **upload custom skill** + **auto-distill skills from usage**; **SkillHub / bundles**.
- **Connectors** (MCP-style) to Tencent suite, Feishu/Lark, DingTalk, TAPD, CNB, knowledge bases; **custom connectors**.
- **Projects** = collaborative multi-person workspaces + templates.
- **Spaces** grouping sessions; session list w/ timestamps + row menu.
- **Automation** = scheduled tasks + run history + rich template gallery.
- **Inspiration** = gallery of **clonable interactive-HTML deliverable templates** ("做同款") with provenance + favorites.
- **Composer**: `@` file references, `/` commands/skills, per-message Expert/Model/Skills/Connectors selection, local-file & project-asset attachments, voice input, **Craft vs Plan** modes.
- **Right workspace panel**: artifacts, workspace files, **git-style change diffs** with add/del stats.
- **Memory**: extract/edit conversation memory + import memory from other AIs.
- **Security Center**: sandbox (file/command/network policies), security gateway, transport encryption, deletion protection, bulk-delete approval, bundled Python/Node/Git runtimes.
- **Assistant** connected to **WeChat mini-program**; **锁屏远程** phone remote control of the desktop agent.
- **Knowledge bases**: My Files, Tencent Docs, ima, Lexiang.
- **Gamification**: daily-check-in credits ("Buddy加油站"), login-streak merch draws, tiering/upgrade.
- Light/Dark theme, font-size, i18n (CN), auto-update.

---

## Standout Ideas Worth Adopting (design-level)

1. **Right-hand "workspace" panel with git-style diffs + artifact list.** Separating _conversation_ from _what changed on disk_ (产物 / 工作空间文件 / 变更 with +N/−N stats and a real diff viewer) is a clean, legible way to surface an agent's file operations — far better than dumping tool logs inline. Directly applicable to open-cowork's sandbox/file work.
2. **Per-turn composer stack: Expert + Model + Skills + Connectors as visible pills, with inline cost.** Users pick _persona, model (with cost multiplier), tools, and integrations_ for the very next message, right where they type — no digging into settings, and cost is transparent before sending.
3. **"Craft vs Plan" mode toggle fused with persona.** A single, discoverable control expresses _how_ the agent should behave (plan-first vs execute) alongside _who_ it acts as — a tidy alternative to hidden "plan mode" flags.
4. **Inspiration gallery of clonable, live-previewed deliverables with provenance + "做同款".** Turning great past outputs into a browsable, one-click-reusable template library (showing which Skills built each) is a powerful onboarding + activation loop and sets expectations for output quality.
5. **Security/permissions as a friendly first-class "Security Center."** Sandbox file/command/network allow-lists, deletion protection, bulk-delete approval thresholds, and pre-install **skill security scanning** — all presented as approachable toggles with plain-language explanations rather than buried config. Strong model for open-cowork's sandbox story.

_(Runner-up: the credits/rewards + daily check-in gamification, and the marketplace triad IA — Experts/Skills/Connectors as three peers — are both worth noting for productization, though less about core UX craft.)_

---

## Screenshot Index

| File                             | Description                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------------ |
| 01-initial.png                   | Home / New-Task launcher (light); scenario chips + big composer + mascot             |
| 02-assistant.png                 | 助理 Assistant chat; connected to WeChat mini-program                                |
| 03-projects.png                  | Projects list + "create from template" gallery                                       |
| 04-experts-skills-connectors.png | Experts tab loading (skeleton cards)                                                 |
| 05-experts-loaded.png            | Experts marketplace: featured scenarios + persona cards + categories                 |
| 06-skills.png                    | Skills marketplace: featured + Recommended/SkillHub/bundles, `+` install             |
| 07-connectors.png                | Connectors marketplace (Tencent/Feishu/DingTalk/TAPD/CNB…)                           |
| 08-automation.png                | Automation: empty state + scheduled-task template gallery                            |
| 09-more.png                      | "更多" popover (files, docs, KBs, Inspiration)                                       |
| 10-inspiration.png               | Inspiration gallery of interactive-HTML deliverable templates                        |
| 11-bg-window.png                 | Inspiration **detail modal**: live whiteboard preview + Skills provenance + "做同款" |
| 12-after-close-modal.png         | Back to Inspiration gallery                                                          |
| 15-workbuddy-front.png           | Inspiration gallery (WorkBuddy confirmed frontmost)                                  |
| 16-conversation.png              | Conversation view: breadcrumb, markdown table, artifact cards, rich composer         |
| 17-conversation-loaded.png       | Same conversation fully loaded                                                       |
| 19-model-picker.png              | Model dropdown: Max mode + models w/ credit multipliers                              |
| 20-expert-picker.png             | Expert/Mode picker: Craft / Plan / persona                                           |
| 21-skills-dropdown.png           | Composer Skills dropdown (search + upload)                                           |
| 22-attach-menu.png               | Composer `+` attach: local file / project asset                                      |
| 23-changes-view.png              | Right panel opened (产物/工作空间文件/变更)                                          |
| 24-changes-dropdown.png          | Changes tab: git-style +/− diff stats per file                                       |
| 25-diff-view.png                 | Line-numbered syntax-highlighted diff viewer                                         |
| 26-workspace-files.png           | Workspace files tab (file dropdown + preview)                                        |
| 27-account-menu.png              | Account popover: credits, rewards, theme, settings                                   |
| 28-settings.png                  | Settings → System (language, font size, skill/remote/path/telemetry)                 |
| 29-settings-model.png            | Settings → Model (custom BYO models via models.json)                                 |
| 30-settings-agent.png            | Settings → Agent (plugin kill-switch, multi-agent teams, local distillation)         |
| 31-settings-memory.png           | Settings → Memory (extracted profile card, import from other AIs)                    |
| 32-settings-security.png         | Settings → Security Center (sandbox/data/runtimes)                                   |
| 33-dark-mode.png                 | Dark theme applied (account popover visible)                                         |
| 34-dark-full.png                 | Full dark UI                                                                         |
| 35-composer-typed.png            | Composer @-file-mention autocomplete chip                                            |

_Excluded: 13–14 (captured Poe, a different app); 36–40 (composer typing/cleanup artifacts, IME garble)._
