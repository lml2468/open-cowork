# Open Cowork — Current UI/UX Baseline

Factual teardown of Open Cowork's shipped UI (v3.3.1), captured live in dev mode on macOS for gap analysis against WorkBuddy. Screenshots live in `research/cowork-screenshots/` (numbered NN-name.png).

> Capture note: The machine had no `node_modules` and Node 26 (repo needs Node 22). I installed `node@22` via Homebrew and ran `npm install` with `ELECTRON_MIRROR=https://registry.npmmirror.com/-/binary/electron/` (GitHub binary download timed out), then `npm run dev`. The competitor **WorkBuddy.app** was already running and shares the process name "Electron", so it bleeds through at the far-left edge and bottom of some shots — ignore anything left of the Open Cowork sidebar or below the app window. The app window is size-capped at ~1400×900 in dev.

---

## Overview

- **Type**: Electron desktop app, three-process (main/preload/renderer). Renderer = React + Zustand + Tailwind, all strings via i18next (currently displaying **中文**; English available).
- **Layout paradigm**: Classic two-pane shell — a persistent **left sidebar** (session list + workspace nav + settings) and a **main content pane** that swaps between WelcomeView, ChatView, and workspace/settings surfaces. A third **right-hand ContextPanel** (18rem) appears during an active chat session. No top tab bar; navigation is entirely sidebar-driven.
- **Window chrome**: On macOS just native traffic lights over a thin 40px drag bar (`Titlebar.tsx`); no custom min/max/close (those render on Windows/Linux only). Minimal chrome.
- **Themes**: Two full themes — **Light** (default in this profile) and **Dark** (cool graphite `#0e0f11`), plus a **Follow system** option. Toggle in sidebar footer (Sun/Moon, cycles dark→light→system) and in Settings ▸ General. Palette is CSS-variable driven (`globals.css`), so theming is complete and consistent.
- **Nav model**: Sidebar "工作区" (Workspace) group has 5 destinations — 技能 Skills, 专家 Experts, 任务 Tasks, 文件 Files, 连接 Connect. These render management surfaces **inline in the main pane** (via `nav/NavPageRouter.tsx` + `NavPageShell.tsx`), reusing the same content as the corresponding Settings tabs. Settings itself opens as a **full-screen modal** with its own left tab rail.

---

## Per-surface teardown

### 1. Left Sidebar — `Sidebar.tsx`

- **Evidence**: every screenshot (expanded); `28-sidebar-collapsed.png` (collapsed rail).
- **Purpose**: brand, new-chat, session history, workspace nav, settings/theme.
- **Layout (expanded, 17.5rem)**: top = logo (`logo.png`) + "Open Cowork" wordmark + collapse chevron `‹`. Below: **+ 新对话** (New chat) button. Then **工作区** section label and 5 nav rows (icon + label): 技能(Sparkles), 专家(GraduationCap), 任务(Clock), 文件(Folder), 连接(Plug). Then a session-history region — currently **暂无任务** ("No tasks — start a new conversation to keep building, researching or editing files."). Footer: **设置** gear + "API 未配置" status subtitle, and a theme toggle icon (Moon in light / Sun in dark).
- **Collapsed (4.5rem)**: icon-only rail — expand chevron `›`, +, the 5 nav icons, then theme + settings icons at the bottom. Session list hidden.
- **Interactions**: nav rows set `activeView`; active row gets accent tint + accent icon. Session rows are grouped/collapsible (`toggleGroupCollapsed`) with per-session manage actions.
- **Visual**: flat, borderless rows; active state = `surface-active`/accent-muted; generous vertical rhythm; the empty history area is a large blank void in current (unconfigured) state.

### 2. Welcome / Empty state — `WelcomeView.tsx`

- **Evidence**: `06-welcome.png` (light), `19-welcome-dark.png` (dark), `29-welcome-zoomout.png` (composer revealed).
- **Purpose**: landing when no session is active; entry point to start a session.
- **Layout**: vertically-centered narrow column (max ~860px). Large logo + "Open Cowork" display heading; serif subtitle "今天我能为您做些什么?" (What can I do for you today?). If unconfigured, an inline hint "API 尚未配置… 前往设置 →" (accent link → opens Settings ▸ API). Then **从技能开始** (Start from a skill): a 3-col grid of up to 6 skill cards (icon in accent-muted rounded square + name + 2-line description). If no skills, falls back to quick-action chips (Create file / Crunch data / Organize files / Check emails / Search papers / Summarize→Notion, some with "Chrome required"/"Notion required" badges). Below: a large **input card** (`rounded-4xl`) — auto-growing textarea (placeholder), and a bottom action row: 📁 working-dir selector (shows folder name, accent when unset), 📎 附加文件 (attach), and a primary **开始 →** ("Let's go") button.
- **Interactions**: click a skill card → fills prompt template + focuses textarea; Enter submits (Shift+Enter newline); paste/drag images (auto-resized <3.75MB) and files. Submit calls `startSession`.
- **Notable**: composer sits _below_ the 6 skill cards, so at the capped window height it is pushed **below the fold** (only revealed by zooming out — a real density problem, see Weaknesses).

### 3. Chat view — `ChatView.tsx` (+ `message/*`, `ContextUsageBar.tsx`, `ContextPanel.tsx`)

- **Evidence**: BLOCKED live (no credentials → `startSession` returns null and a toast blocks entry, see `27-chatview.png`). Documented from source.
- **Header**: 48px, 3-column grid — left small uppercase "OPEN COWORK" label, center truncated session title, right an MCP **connector-count pill** (Plug icon, `mcp` purple `#a78bfa`) when connectors are active. Backdrop-blur bar.
- **ContextUsageBar** (under header): thin progress bar showing `NN% · tokens/contextWindow · ~N turns left`; Gauge icon, color ramps accent→warning(>50%)→error(>80%); a **Compact now** button (Zap) appears >50% with a confirm dropdown; "compacting…" pulse state. (`ContextUsageBar.tsx`)
- **Message list**: virtualized (react-virtuoso), centered `max-w-content` (920px). `MessageCard.tsx`: **user** messages = right-aligned rounded-3xl surface bubble (max 80%) with hover copy button, queued/cancelled states; **assistant** messages = no bubble, direct serif prose (`prose-chat`, Source Serif 4). Blocks rendered by `message/ContentBlockView.tsx` and sub-components: ThinkingBlock, ToolUseBlock/ToolResultBlock (merged into one card), TodoWriteBlock, AskUserQuestionBlock, CodeBlock (mono, highlight.js).
- **Composer**: `rounded-4xl` card — **+** attach icon-button, auto-grow textarea, a **read-only model pill** (shows `appConfig.model`, e.g. gpt-5.4), a Stop button (error-tinted square, when running) and an accent circular **Send** button. Disclaimer caption below. **No in-composer model picker, no skill/connector toggles** (contrast vs WorkBuddy, which has 助手/model/技能/连接器 dropdowns inline).
- **ContextPanel** (right, 18rem, `ContextPanel.tsx`): collapsible "上下文" panel with sections — token usage (input/output), context-usage label, **产物 Artifacts** (created files, reveal/open), **工作目录 Working directory** (path, open-in-finder, copy, change), **MCP 连接器** status, and **tools used** list. BLOCKED live.

### 4. Credential-gate toast — `GlobalNoticeToast.tsx`

- **Evidence**: `27-chatview.png`.
- Top-right card: "当前方案未配置可用凭证，请先在 API 设置中完成配置" with an accent **打开 API 设置** button. Confirms every work path is gated on configured credentials.

### 5. Settings (full-screen modal) — `SettingsPanel.tsx` + `settings/*`

- **Evidence**: `09`–`18`.
- **Shell**: left rail with header "设置 / Open Cowork" + description, 9 tabs (each icon + title + subtitle), a bottom mini-rail of icons, theme toggle, and **关闭 / v3.3.1**. Right = active tab content. Close **✕** top-right. Active tab shows a `›` marker.
- **Tabs**:
  - **API 设置** (`SettingsAPI.tsx`, `09`): 配置方案 (config-set) dropdown with 保存/新建方案/重命名/delete; **API 提供商** toggle (OpenAI / 更多模型); **API 密钥** (`sk-…`, local-only); **模型** input (gpt-5.4) with 自定义 button. (scrolls to more: thinking/temp etc.)
  - **沙盒 Sandbox** (`SettingsSandbox.tsx`, `10`): shield hero, "启用沙盒模式", status pill "沙盒已禁用 - 命令直接在系统上运行", explains WSL2/Lima requirement. Empty/disabled state.
  - **MCP 连接器** (`SettingsConnectors.tsx`, `11`): empty state "未配置连接器"; 快速添加预设 presets — **Chrome** (chrome-devtools-mcp), **Notion** (需要令牌 badge, 配置), **Software_Development**, **GUI_Operate** — each with **+ 添加**; **+ 添加自定义连接器**; "有 0 个可用工具".
  - **技能 Skills** (`SettingsSkills.tsx`, `12`): Skills 存储目录 (path + 选择目录/打开目录/刷新技能列表); **内置技能** list (coding-before-dev/brainstorm/break-loop/check… each = green dot + name + BUILTIN tag + description + power toggle).
  - **记忆 Memory** (`SettingsMemory.tsx`, `13`): Memory 机制 status card "已启用" + 关闭记忆 button; stats (Core 条目 0, 最近摄取, 健康状态); 存储根目录; **运行时配置** with Memory-LLM (继承当前激活 API checkbox, 模型覆盖).
  - **定时任务 Schedule** (`SettingsSchedule.tsx`, `14`): 新建定时任务 form — auto-title, prompt textarea, working-dir, 执行时间 (启用 checkbox), 执行模式 dropdown (单次), datetime picker, 下次预计执行, **创建任务**; empty list "暂无定时任务".
  - **远程控制 Remote** (`RemoteControlPanel.tsx` + `remote/*`, `15`): status card "未启动" + **启动服务**; sub-steps 飞书配置 / 连接方式 / 高级设置; Feishu bot config (App ID, App Secret, 私聊授权策略: 配对验证 / 白名单 / 开放); "打开飞书开放平台" link; 保存配置. (Slack config also exists — `SlackConfigStep.tsx`.)
  - **日志 Logs** (`SettingsLogs.tsx`, `16`): "启用开发者日志" toggle; file count/total-size cards (1 / 649 B); recent log file entry; 日志目录 path + copy.
  - **通用 General** (`SettingsGeneral.tsx`, `17`/`18`): **外观** segmented (浅色 / 深色 / 跟随系统); **语言** segmented (English / 中文); "Open Cowork v3.3.1".

### 6. Workspace nav pages — `nav/*`

- **Evidence**: `20`–`24`.
- Rendered inline in main pane with a `NavPageShell` header (title + subtitle + back `‹`):
  - **技能** (`SkillsPage.tsx`, `20`) = same as Settings Skills.
  - **专家** (`ComingSoonPage.tsx`, `21`) = **placeholder** "敬请期待 — 为专项任务精选的专家智能体即将推出" (curated expert agents coming soon).
  - **任务** (`TasksPage.tsx`, `22`) = same as Settings Schedule (scheduled prompts).
  - **文件** (`ComingSoonPage.tsx`, `23`) = **placeholder** "敬请期待 — browse/manage working-dir files, coming soon".
  - **连接** (`ConnectorsPage.tsx`, `24`) = same as Settings MCP connectors.

### 7. Other coded-but-unreached surfaces

Dialogs/panels that require a live session or specific triggers (not reachable without credentials; exist in `src/renderer/components/`): `PermissionDialog.tsx` (tool-permission prompts), `SubagentProgress.tsx`/`SubagentTracker.tsx`, `CompactionHistory.tsx`, `ConfigModal.tsx`, `ApiDiagnosticsPanel.tsx`, `ProviderGuidance.tsx`, `SandboxSetupDialog.tsx`, `SandboxSyncToast.tsx`, `SudoPasswordDialog.tsx`, `ApiConfigSetManager.tsx`, `ErrorBoundary`/`PanelErrorBoundary`.

---

## Visual design language

Tokens from `tailwind.config.js` + `globals.css` (CSS variables):

- **Palette (dark, `:root`)**: background `#0e0f11` / secondary `#121316`; surface `#17181b` (hover `#1f2125`, active `#262a2f`, muted `#131417`); border `#262a30`; **accent `#6d8bff`** (indigo-periwinkle; hover `#8aa0ff`, muted 16% alpha); on-accent `#0b1020`; text primary `#eceef1` / secondary `#a8aeb8` / muted `#757c86`; success `#45c08a`, warning `#e3b341`, error `#f2777a`; MCP `#a78bfa` (purple).
- **Palette (light)**: background `#fbfbfc`; surface `#ffffff`; border `#e3e6ea`; **accent `#4f6bf6`**; text primary `#14161a`; success `#12a150`, warning `#b4791a`, error `#dc3e3e`; MCP `#7c5cfc`.
- **Typography**: sans **Inter** (UI), serif **Source Serif 4** (headings/subtitles + assistant chat prose), mono **JetBrains Mono** (code). Named type scale: display 2.5rem / title 1.375 / heading 1.125 / body 0.9375 / label 0.6875 (uppercase, 0.1em tracking) / caption 0.75. Tight negative letter-spacing on large text. Fonts loaded from Google Fonts CDN.
- **Radii**: unusually large scale — sm 6 / md 8 / lg 10 / xl 12 / 2xl 16 / 3xl 20 / 4xl 26 / 5xl 32px. Cards `rounded-2xl`, composer/input cards `rounded-4xl`, pills `rounded-full`. Very rounded, soft aesthetic.
- **Spacing/density**: airy. Shared `gutter-x` (px-5 lg:px-8), reading columns capped at 920/860px, fixed rail widths (sidebar 17.5rem / collapsed 4.5rem / context 18rem), 3rem header height.
- **Elevation**: three soft shadow tokens (soft/card/elevated); borders often `border-subtle` (6% alpha). Overlays use a scrim + backdrop-blur.
- **Icons**: `lucide-react` throughout (thin line icons), sized w-3.5–w-5.
- **Motion**: restrained — `fade-in` (0.2s) and `slide-up` (cubic-bezier 0.16,1,0.3,1); pulse for loading; honors `prefers-reduced-motion`.

Overall: a calm, "Claude-desktop-like" editorial style — serif accents, indigo accent, large radii, low-chroma neutrals, minimal chrome.

---

## Feature inventory (UI-facing)

- Start/continue chat sessions; session history grouped in sidebar; new-chat.
- Skill-first onboarding cards; skill templates injected into the prompt.
- Multimodal composer: text, image paste/drag (auto-resize), file attach, working-directory selection.
- Streaming assistant messages with thinking blocks, merged tool-use/result cards, todo lists, ask-user questions, syntax-highlighted code, copy.
- Context-window meter + manual **compaction** with confirm.
- Right ContextPanel: token usage, created artifacts (reveal/open), working dir, MCP status, tools used.
- Settings: multi-provider API config-sets, model + key, sandbox (Lima/WSL2), MCP connectors (+presets Chrome/Notion/Software_Development/GUI_Operate + custom), skills (built-in enable/disable + custom dir), memory (core-memory + runtime LLM), scheduled tasks (cron-like), remote control (Feishu/Slack bot), logs, appearance/language.
- Light/Dark/System theming; EN/中文.
- Workspace nav pages (Skills/Tasks/Connect functional; Experts/Files are "coming soon" placeholders).

---

## Current weaknesses / rough edges

1. **Welcome composer below the fold**: with 6 skill cards + a vertically-centered layout, the primary input card and its 开始 button are pushed off-screen at normal window sizes — the main call-to-action isn't visible without scrolling/zooming. Significant discoverability problem.
2. **Two unfinished nav destinations**: 专家 (Experts) and 文件 (Files) are bare "敬请期待" placeholders — visible dead-ends in primary navigation.
3. **Redundant surfaces**: workspace nav pages (Skills/Tasks/Connect) render the _same_ content as Settings tabs, with two different chromes (inline `NavPageShell` vs full-screen settings modal). Duplicated IA is confusing.
4. **Thin chat composer affordances**: model is a _read-only pill_; no in-composer model switch, no skill/connector picker, no visible send-mode hints — everything routes through Settings. (WorkBuddy exposes assistant/model/skills/connectors inline.)
5. **Empty-state void**: unconfigured sidebar history and several settings tabs (Sandbox/MCP/Schedule/Memory) are mostly empty large panes; low information density in default state.
6. **Localization mix**: UI is Chinese but built-in skill names/descriptions are English, and paths reference legacy `.../claude/skills` — inconsistent surface polish.
7. **Minimal titlebar on macOS**: no window title/breadcrumb beyond the in-content header; the top 40px is dead drag space.
8. **No global search visible in our app** (the search icon at the far left in some shots is WorkBuddy bleed-through, not Open Cowork).

---

## Screenshot index

| File                     | Surface                                                 | Theme |
| ------------------------ | ------------------------------------------------------- | ----- |
| 06-welcome.png           | WelcomeView (skill cards, unconfigured hint)            | Light |
| 19-welcome-dark.png      | WelcomeView                                             | Dark  |
| 29-welcome-zoomout.png   | WelcomeView composer revealed (working-dir/attach/开始) | Dark  |
| 09-settings.png          | Settings ▸ API 设置                                     | Light |
| 10-settings-sandbox.png  | Settings ▸ 沙盒 Sandbox                                 | Light |
| 11-settings-mcp.png      | Settings ▸ MCP 连接器 (presets)                         | Light |
| 12-settings-skills.png   | Settings ▸ 技能 Skills                                  | Light |
| 13-settings-memory.png   | Settings ▸ 记忆 Memory                                  | Light |
| 14-settings-schedule.png | Settings ▸ 定时任务 Schedule                            | Light |
| 15-settings-remote.png   | Settings ▸ 远程控制 (Feishu)                            | Light |
| 16-settings-logs.png     | Settings ▸ 日志 Logs                                    | Light |
| 17-settings-general.png  | Settings ▸ 通用 General (theme/lang)                    | Light |
| 18-settings-dark.png     | Settings ▸ General after switching Dark                 | Dark  |
| 20-nav-skills.png        | Workspace ▸ 技能 (inline)                               | Dark  |
| 21-nav-experts.png       | Workspace ▸ 专家 (Coming soon)                          | Dark  |
| 22-nav-tasks.png         | Workspace ▸ 任务 (Schedule inline)                      | Dark  |
| 23-nav-files.png         | Workspace ▸ 文件 (Coming soon)                          | Dark  |
| 24-nav-connect.png       | Workspace ▸ 连接 (MCP inline)                           | Dark  |
| 27-chatview.png          | Credential-gate toast (ChatView entry blocked)          | Dark  |
| 28-sidebar-collapsed.png | Collapsed icon-rail sidebar                             | Dark  |

**Surfaces blocked**: ChatView + all in-session UI (MessageCard/tool cards/ContextPanel/ContextUsageBar/PermissionDialog/SubagentProgress/CompactionHistory) — gated behind configured API credentials (`startSession` returns null when none). Documented from source instead. Also not exercised: sandbox/remote "started" states, MCP connectors while connected, custom-skill import dialogs.
