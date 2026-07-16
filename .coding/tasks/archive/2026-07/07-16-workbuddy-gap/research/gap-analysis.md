# GAP Analysis — open-cowork vs WorkBuddy

Synthesis of `research/workbuddy-map.md` (competitor teardown) against
`research/cowork-baseline.md` (open-cowork v3.3.1 shipped UI), scoped to the
constraints in `prd.md` / `design.md`: renderer-first, Electron + React +
single Zustand store + Tailwind semantic tokens + lucide-react + i18next
(en+zh parity), TS strict. Clean-room: every item below is an _original UX
pattern to build_, not WorkBuddy code to copy.

All `files` paths are real (verified against `src/renderer/`). New files are
marked `(new)`.

---

## 1. Executive summary — the biggest gaps

1. **The primary CTA is hidden.** open-cowork's WelcomeView stacks 6 skill
   cards above a vertically-centered composer, pushing the input + 开始 button
   _below the fold_ at the capped window height. WorkBuddy leads with a big
   composer + scenario chips, composer always in view. This is the single
   highest-value, lowest-risk fix.

2. **The chat composer is inert.** open-cowork shows a **read-only** model pill
   and nothing else; model, skills, and connectors all live in Settings.
   WorkBuddy exposes persona / model (with cost) / skills / connectors / mode as
   **per-turn pills right in the composer**, plus `@`-file and `/`-command
   autocomplete. This is where the "agent feels configurable" perception lives.

3. **File operations are invisible.** open-cowork's right ContextPanel lists
   created artifacts + working dir + tools, but never shows _what changed on
   disk_. WorkBuddy's right panel has 产物 / 工作空间文件 / **变更** with
   git-style +N/−N stats and a real diff viewer — a far more legible way to
   surface an agent's edits than inline tool logs. (Needs a small backend feed.)

4. **Dead-ends and duplicated IA.** 专家 (Experts) and 文件 (Files) are bare
   "敬请期待" placeholders in the primary nav; and the nav pages (Skills/Tasks/
   Connect) render the _same content_ as Settings tabs in a second chrome.
   Navigation looks unfinished and redundant.

5. **Trust story is scattered and empty.** Sandbox / MCP / permissions are
   spread across settings tabs, mostly shown as empty disabled panes. WorkBuddy's
   consolidated, plain-language **Security Center** (sandbox path/command/network
   rules, deletion protection, bundled runtimes) is a strong, approachable model.

**Strategic direction:** ship visual/empty-state polish + fix the fold first
(B1, pure renderer), then make the composer expressive (B2), then surface work
in a real workspace/diff panel (B3), consolidate IA (B4) and trust (B5), and
treat inspiration/automation galleries and multi-person projects as later /
deferred (B6 + §4). Front-load renderer-only work; flag the few items needing a
new `ServerEvent`/`ClientEvent`.

---

## 2. GAP backlog

> Effort: S ≈ <½ day renderer, M ≈ 1–2 days, L ≈ 3+ days or cross-boundary.
> `needs-backend?` flags any item requiring a new IPC event, main-process data,
> or codex-runtime capability (extend the `ClientEvent`/`ServerEvent` unions in
> `src/renderer/types/index.ts` per `.coding/spec/frontend/ipc-electron.md`).

### G1 · interaction-IA · Composer above the fold on Welcome — **P0 / S**

- current: 6 skill cards stacked above a centered composer → input + 开始 pushed off-screen.
- target: composer is the first focal element (top or pinned), skill cards/chips flow _below or beside_; always visible at capped window height.
- why: the main call-to-action must be reachable without scroll/zoom.
- files: `src/renderer/components/WelcomeView.tsx`.
- test: launch at default window size, unconfigured + configured; composer + 开始 visible without scrolling in a screenshot.
- risk/backend: none. Pure layout reflow.

### G2 · visual · Friendly empty states (settings + sidebar history) — **P0 / M**

- current: Sandbox/MCP/Schedule/Memory tabs and sidebar session history are large blank voids in default state.
- target: reusable empty-state pattern — centered line-icon + one-line encouragement + single primary CTA (mirror existing `ComingSoonPage` composition).
- why: default (unconfigured) app looks unfinished; guides the user's next action.
- files: `src/renderer/components/settings/{SettingsSandbox,SettingsConnectors,SettingsSchedule,SettingsMemory}.tsx`, `src/renderer/components/Sidebar.tsx`, new `src/renderer/components/EmptyState.tsx` (new), i18n keys in `locales/{en,zh}.json`.
- test: screenshot each empty tab + empty sidebar; each shows glyph + copy + CTA, no bare void.
- risk/backend: none.

### G3 · visual · Loading skeletons for async lists — **P1 / S**

- current: skill/connector/session lists pop in with spinners or blank.
- target: skeleton shimmer cards while lists load (honor `prefers-reduced-motion`).
- why: perceived performance + polish parity.
- files: new `src/renderer/components/Skeleton.tsx` (new); consumed in `nav/SkillsPage.tsx`, `nav/ConnectorsPage.tsx`, `Sidebar.tsx`.
- test: throttle/mock loading; screenshot shows shimmer cards, not empty space.
- risk/backend: none.

### G4 · visual · i18n cleanup of built-in skills + legacy paths — **P1 / S**

- current: UI is Chinese but built-in skill names/descriptions render English; strings reference legacy `.../claude/skills`.
- target: skill display names/descriptions localized (en+zh); path strings updated to `agent/` per CLAUDE.md gotcha.
- why: surface polish; inconsistent language reads as unfinished.
- files: `src/renderer/components/settings/SettingsSkills.tsx`, `src/renderer/components/nav/SkillsPage.tsx`, `locales/{en,zh}.json`.
- test: switch to 中文; skill list is fully Chinese; no `claude/skills` literal visible.
- risk/backend: skill _metadata_ may come from main; if names come from disk, localization is display-only (flag if source is main).

### G5 · visual · Titlebar breadcrumb / session context — **P1 / S**

- current: macOS titlebar is 40px of dead drag space; context only in the in-content header.
- target: show a lightweight breadcrumb / active-session title in the drag bar (keeps traffic-light offset).
- why: reclaims dead space, gives persistent location context (WorkBuddy shows 项目/space/session).
- files: `src/renderer/components/Titlebar.tsx`, selector from `store/selectors.ts` for active session title.
- test: open a session; title appears in titlebar; empty state shows brand only.
- risk/backend: none.

### G6 · visual · Design-token audit pass — **P2 / S**

- current: mostly consistent, but verify no raw color literals / `cn`/`clsx` crept in.
- target: all new + touched components use semantic tokens (`text-text-muted`, `bg-surface-muted`, `rounded-4xl`, etc.) only.
- why: honors `.coding/spec/frontend/components.md`; keeps theming intact.
- files: any touched in B1–B5; lint sweep.
- test: `npm run lint` + grep for hex literals in changed files.
- risk/backend: none.

### G7 · interaction-IA · In-composer model picker — **P0 / M**

- current: chat composer shows a **read-only** model pill (`appConfig.model`); switching model means opening Settings.
- target: clickable model pill → popover listing models from active config-set (grouped, selected check); updates the turn's model.
- why: per-turn model choice is the headline composer affordance; removes a settings round-trip.
- files: `src/renderer/components/ChatView.tsx`, new `src/renderer/components/composer/ModelPicker.tsx` (new); read config via existing selectors; write via existing settings/config action.
- test: open picker in a session; select a model; pill updates; next turn uses it.
- risk/backend: low — model list already in `appConfig`/config-sets. No new IPC if per-turn override reuses existing config path; flag if per-turn (vs global) model needs a new `ClientEvent` field.

### G8 · interaction-IA · Composer skills quick-picker — **P1 / M**

- current: skills toggled only in Settings; not selectable per message.
- target: a 技能 pill in the composer opening a searchable skill list (enabled skills), with an empty "no skills" state.
- why: brings skill selection to the point of use (WorkBuddy pattern), improves discoverability.
- files: `src/renderer/components/ChatView.tsx`, new `src/renderer/components/composer/SkillPicker.tsx` (new), skills state from store.
- test: click 技能 pill; searchable list appears; selecting injects the skill into the prompt/turn.
- risk/backend: renderer-only if it reuses today's skill-template injection; flag if per-turn skill scoping needs main.

### G9 · interaction-IA · Composer connectors quick-toggle — **P1 / M**

- current: connectors managed only in Settings/MCP.
- target: a 连接 pill showing active-connector count with a popover to enable/disable for the session.
- why: parity with WorkBuddy's inline connectors; transparency of which integrations are live.
- files: `src/renderer/components/ChatView.tsx`, new `src/renderer/components/composer/ConnectorPicker.tsx` (new); MCP status already in ContextPanel/store.
- test: toggle a connector from composer; the header MCP count pill reflects it.
- risk/backend: likely renderer-only for display; enabling/disabling live may already have an IPC path (MCP lifecycle) — reuse it, flag if not.

### G10 · interaction-IA · `@`-file mention autocomplete — **P1 / M**

- current: files attached via a 📎 button only; no inline reference.
- target: typing `@` surfaces a working-dir file suggestion list; selection inserts a reference chip.
- why: fast, discoverable file referencing (WorkBuddy's green mention chip).
- files: `src/renderer/components/ChatView.tsx`, `src/renderer/components/WelcomeView.tsx` (shared composer logic), new `src/renderer/components/composer/MentionMenu.tsx` (new).
- test: type `@` in composer; file list appears; pick one → chip inserted; submit includes it.
- risk/backend: **needs-backend?** yes — listing working-dir files requires a `ClientEvent`/`ServerEvent` (or invoke) for a dir listing. Flag as the one cross-boundary item in B2.

### G11 · interaction-IA · `/`-command / skill invoke in composer — **P2 / M**

- current: no slash-command surface.
- target: typing `/` opens a command/skill palette (invoke skill, insert template).
- why: keyboard-first power-user affordance; matches placeholder intent.
- files: `src/renderer/components/ChatView.tsx`, reuse `composer/SkillPicker.tsx`.
- test: type `/`; palette opens; selecting a skill applies it.
- risk/backend: renderer-only if reusing skill injection.

### G12 · interaction-IA · Plan vs Execute mode toggle — **P2 / M**

- current: no visible mode control.
- target: a discoverable composer toggle (e.g. Plan / Build) with tooltips describing behavior.
- why: expresses _how_ the agent behaves (plan-first vs execute) without hidden flags.
- files: `src/renderer/components/ChatView.tsx`, new `src/renderer/components/composer/ModePicker.tsx` (new), store field on `SessionState`.
- test: toggle mode; state persists per session; visible label change.
- risk/backend: **needs-backend?** yes if codex-runtime must receive a plan-mode flag — extend `ClientEvent`. Flag cost; renderer stub acceptable first.

### G13 · feature · Right panel → tabbed Artifacts / Files / Changes — **P1 / M**

- current: ContextPanel is a single scrolling "上下文" with token usage + artifacts + working dir + MCP + tools.
- target: tabbed panel — **产物 Artifacts** (existing), **工作空间文件 Files** (browser/preview), **变更 Changes** (diff stats). Token/MCP move to a compact header or an "Overview" tab.
- why: separates _conversation_ from _what changed on disk_; the standout WorkBuddy idea.
- files: `src/renderer/components/ContextPanel.tsx`, new `src/renderer/components/context/{PanelTabs,ChangesTab,FilesTab}.tsx` (new).
- test: open a session; panel shows 3 tabs; Artifacts tab preserves current behavior.
- risk/backend: tab shell is renderer-only; Changes/Files data are G14/G16.

### G14 · feature · Changes tab: git-style diff stats + viewer — **P1 / L**

- current: no diff surface; file edits only implied by artifact cards.
- target: per-file rows with +N/−N stats and a line-numbered, syntax-highlighted diff viewer (reuse `CodeBlock`/highlight.js styling), copy/download.
- why: legible, trustworthy view of agent edits; big perceived-capability win.
- files: new `src/renderer/components/context/ChangesTab.tsx` + `DiffViewer.tsx` (new); reuse `message/CodeBlock.tsx` highlighting; store field on `SessionState`.
- test: run a turn that edits files; Changes tab lists files with correct +/− counts; diff renders.
- risk/backend: **needs-backend?** yes — main must emit per-turn file diffs (new `ServerEvent`, sourced from codex-runtime/sandbox file ops). Largest cross-boundary cost in the plan; flag prominently.

### G15 · feature · Workspace file browser/preview in panel — **P1 / M**

- current: 文件 nav is a "coming soon" placeholder; no file browsing.
- target: Files tab = working-dir tree/list + inline preview (text/image/markdown); reveal-in-finder/open actions (working-dir open already exists).
- why: closes a dead-end nav destination with a real, useful surface.
- files: new `src/renderer/components/context/FilesTab.tsx` (new); replace `nav/ComingSoonPage.tsx` usage for `files` with a real page or route to the panel tab.
- test: open a session with files; browse + preview a file; screenshot shows a populated browser.
- risk/backend: **needs-backend?** yes — dir listing + file read IPC (shared with G10). Flag.

### G16 · interaction-IA · Retire Experts/Files placeholders — **P1 / S**

- current: `专家` and `文件` render bare `ComingSoonPage`.
- target: `文件` → real Files surface (G15); `专家` → either a curated-persona gallery (G23) or removed from primary nav until ready (no dead-ends).
- why: eliminate visible dead-ends in primary navigation.
- files: `src/renderer/store/index.ts` (`ActiveView`/`NAV_VIEWS`), `src/renderer/components/nav/NavPageRouter.tsx`, `Sidebar.tsx`.
- test: every visible nav row leads to functional content; no "敬请期待" reachable.
- risk/backend: none for removal; G15/G23 carry their own cost.

### G17 · interaction-IA · Resolve nav-vs-settings redundancy — **P2 / M**

- current: nav pages (Skills/Tasks/Connect) duplicate Settings tab content in a second chrome.
- target: single source — nav pages become the primary management surface and Settings deep-links to them (or vice-versa); one chrome, no divergence.
- why: removes confusing duplicated IA; less maintenance.
- files: `src/renderer/components/nav/{SkillsPage,TasksPage,ConnectorsPage}.tsx`, `src/renderer/components/settings/{SettingsSkills,SettingsSchedule,SettingsConnectors}.tsx`, `SettingsPanel.tsx`.
- test: edit a skill in one place; the other reflects it; only one chrome renders the management UI.
- risk/backend: none; refactor risk (shared components) — keep additive.

### G18 · feature · Global search (sessions + skills) — **P2 / M**

- current: no search surface in-app.
- target: a command-palette-style search over sessions (and optionally skills), keyboard-triggered.
- why: navigation scales; matches WorkBuddy's header search affordance.
- files: new `src/renderer/components/GlobalSearch.tsx` (new); reads session list from store; `Sidebar.tsx` trigger + `App.tsx` overlay.
- test: open search; type; matching sessions filter; Enter opens one.
- risk/backend: renderer-only if searching loaded session list; flag if full-text over persisted history needs a query IPC.

### G19 · feature · Chat header breadcrumb + actions — **P1 / S**

- current: chat header is a 3-col grid with a small "OPEN COWORK" label + title + MCP pill.
- target: breadcrumb-style location (workspace/session) + right-side actions (search, panel toggle) matching the new right-panel.
- why: orientation + quick access to the workspace panel toggle.
- files: `src/renderer/components/ChatView.tsx`.
- test: header shows session context + a working panel-toggle button.
- risk/backend: none.

### G20 · feature · Consolidated Security Center settings tab — **P1 / M**

- current: sandbox + MCP + permissions scattered; Sandbox tab is an empty disabled hero.
- target: one "安全中心 / Security Center" tab grouping sandbox (file/command/network rules), data-safety toggles, and bundled-runtime status — plain-language toggles.
- why: makes open-cowork's real sandbox story approachable and first-class (its actual strength).
- files: new `src/renderer/components/settings/SettingsSecurity.tsx` (new), `SettingsPanel.tsx` (tab), reuse `SettingsSandbox.tsx` content; `locales/{en,zh}.json`.
- test: open Security Center; sandbox/network/runtime sections render as grouped toggles; existing sandbox enable still works.
- risk/backend: display/grouping renderer-only; deeper rules (path/command allow-lists) may need main — build UI against existing sandbox config first, flag advanced rules.

### G21 · feature · Deletion-protection / bulk-delete approval UI — **P2 / M**

- current: none.
- target: settings toggles for "move-to-trash first" and a bulk-delete approval threshold; a confirm dialog when the agent exceeds it.
- why: trust/safety parity; concrete guardrail against destructive tool calls.
- files: `settings/SettingsSecurity.tsx` (G20), reuse/extend `PermissionDialog.tsx`.
- test: set threshold low; trigger a bulk delete; approval dialog appears.
- risk/backend: **needs-backend?** yes — enforcement lives in main/sandbox; extend permission `ServerEvent`/`ClientEvent`. Flag.

### G22 · feature · Skill/connector permission + provenance badges — **P2 / S**

- current: skills toggle on/off; no risk/permission signal.
- target: small badges (e.g. "requires token", "network", "local-only") on skill/connector cards; surface what a skill can do before enabling.
- why: informed consent; matches WorkBuddy's pre-install scan framing.
- files: `nav/SkillsPage.tsx`, `nav/ConnectorsPage.tsx`, `settings/SettingsConnectors.tsx`.
- test: cards show capability badges; screenshot verifies.
- risk/backend: needs skill/connector metadata; render from whatever main already exposes, flag missing fields.

### G23 · feature · Experts (persona) gallery — **P2 / L**

- current: `专家` is a placeholder.
- target: a browsable persona gallery (avatar/name/description/tags, "my experts"), selectable into a session's system framing.
- why: closes the dead-end with a real, on-brand feature; enables per-task personas.
- files: new `src/renderer/components/nav/ExpertsPage.tsx` (new, replaces `ComingSoonPage` for experts), store additions.
- test: browse personas; select one; session reflects the persona.
- risk/backend: **needs-backend?** yes — persona storage + injection into codex-runtime. Flag; could ship a read-only gallery first.

### G24 · feature · Inspiration/template gallery on Welcome — **P2 / L**

- current: welcome offers skill cards + quick-action chips only.
- target: a gallery of clonable starting-point templates (thumbnail + "make one like this") seeded from curated prompts/skills.
- why: onboarding + activation loop; sets output-quality expectations.
- files: `src/renderer/components/WelcomeView.tsx`, new `src/renderer/components/InspirationGallery.tsx` (new).
- test: welcome shows templates; clicking one seeds the composer + starts a session.
- risk/backend: renderer-only if templates are static/curated config; flag if backed by stored user artifacts.

### G25 · feature · Automation template gallery on Tasks page — **P2 / M**

- current: Tasks/Schedule shows only a create-form + empty list.
- target: a grid of scheduled-task templates (daily digest, weekly report, reminders) that prefill the create form; a run-history view.
- why: activates the existing scheduler; friendly empty state → concrete starting points.
- files: `src/renderer/components/nav/TasksPage.tsx`, `src/renderer/components/settings/SettingsSchedule.tsx`.
- test: pick a template; create form prefills; task appears in list.
- risk/backend: templates renderer-only; run-history may need a query IPC — flag.

### G26 · feature · Scenario segmentation chips on Welcome — **P2 / S**

- current: a flat set of quick-action chips.
- target: a segmented switcher (e.g. Daily / Coding / Design) that re-filters the skill cards + chips shown.
- why: reduces choice overload; guides first task by intent.
- files: `src/renderer/components/WelcomeView.tsx`, `locales/{en,zh}.json`.
- test: switch segments; card/chip set changes accordingly.
- risk/backend: renderer-only (client-side grouping of existing skills).

---

## 3. Batching plan

Each batch is an independently-shippable PR (~3–8 items), gated per PRD by
`npm run lint` + `npx tsc --noEmit` + `npx vitest run` + a screenshot check.
Early batches are pure renderer + low risk; cross-boundary items are back-loaded.

### B1 — Visual polish & fix the fold _(P0, renderer-only)_

- Goal: default app looks finished and the primary CTA is always visible.
- Items: **G1, G2, G3, G4, G5, G6**.
- Accept: composer + 开始 visible without scroll at default size; empty tabs/sidebar show glyph+copy+CTA; lists shimmer while loading; 中文 skill list fully localized; titlebar shows session context; lint clean, no raw hex.

### B2 — Expressive composer _(P0/P1)_

- Goal: model, skills, connectors, mentions, and mode are chosen at the point of typing.
- Items: **G7, G8, G9, G10, G11, G12**.
- Accept: composer pills open working pickers; selecting a model updates the turn; `@` file mentions and `/` palette work; mode toggle persists. (G10 file-list + G12 plan-flag are the flagged cross-boundary bits.)

### B3 — Workspace & changes panel _(P1)_

- Goal: what changed on disk is legible, separate from the conversation.
- Items: **G13, G14, G15**.
- Accept: right panel has Artifacts/Files/Changes tabs; Changes shows +/− stats and a diff viewer; Files browses+previews the working dir. (G14 diff feed + G15 dir IPC are the backend cost.)

### B4 — IA consolidation & orientation _(P1/P2)_

- Goal: no dead-ends, no duplicated management chrome, easy navigation.
- Items: **G16, G17, G18, G19**.
- Accept: every nav row is functional; management UI has one source of truth; global search finds+opens sessions; chat header shows breadcrumb + panel toggle.

### B5 — Security Center & trust _(P1/P2)_

- Goal: open-cowork's sandbox strength presented as an approachable, first-class center.
- Items: **G20, G21, G22**.
- Accept: a consolidated Security Center tab with grouped toggles; deletion-protection + bulk-delete approval dialog; capability badges on skills/connectors. (G21 enforcement + advanced sandbox rules flagged for main.)

### B6 — Activation & galleries _(P2, later)_

- Goal: onboarding loops that showcase capability and re-engage.
- Items: **G23, G24, G25, G26**.
- Accept: experts persona gallery (read-only ok first); inspiration templates seed sessions; automation template gallery prefills the scheduler; welcome scenario segmentation filters cards. (Persona injection + run-history flagged.)

---

## 4. Explicitly deferred / out of scope

- **Credits / rewards economy, daily check-in gamification, tiering** — needs a
  billing/accounts backend open-cowork doesn't have; not a UX-craft gap. (PRD:
  no auth/provider changes.)
- **Multi-person collaborative Projects** (shared workspaces, add-people, roles)
  — requires real-time collaboration + accounts backend; major scope, no
  credentials to add.
- **WeChat mini-program / 锁屏远程 phone control** — platform-specific external
  integration beyond the existing Feishu/Slack remote surface; out of scope.
- **Auto-forming multi-agent "expert teams"** — beyond the existing
  `SubagentExtension`; agent-orchestration change, not renderer UX. Defer.
- **"Import memory from other AI apps"** — needs adapters to third-party stores;
  no source data available. Defer; keep the existing Memory tab.
- **Copying any WorkBuddy visual asset, mascot, model roster/credit multipliers,
  or Tencent-ecosystem connector set** — clean-room boundary; we build original
  patterns only, never their content.
- **BYO/custom `models.json` UX** — partially covered by existing config-set
  Custom-model support (`SettingsAPI.tsx`); revisit only if the current path is
  insufficient.

---

_Total: 26 GAP items (G1–G26) across 6 batches._
