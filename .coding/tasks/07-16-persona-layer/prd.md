# Agent Persona 层：专家绑定会话

## Goal

把 open-cowork 现有"邀请一位专家"从**提示词种子按钮**升级为**真正的 persona 层**：会话可绑定一个
专家(persona)，其**系统提示**在每轮注入 codex `developerInstructions`，并可携带**推荐技能/连接器**
做一键启用引导；专家集合为**内置 + 用户自建**（文件式）。（GAP 分析 P0-①，见
`.coding/tasks/07-16-workbuddy-gap-analysis`。）

**分期**：本任务聚焦"单专家绑定会话"；**专家团(multi-agent)** 与**专家市场/分类/收藏**为后续
（专家团复用 `src/main/agent/subagent-extension.ts`）。

## Background / Confirmed Facts（代码勘察）

- 现状："专家"= 渲染层 `utils/activation-gallery.ts` 的 6 个硬编码 persona（`ExpertsGallery.tsx`），
  点击仅 `onSeed(prompt)` 注入 composer 提示词；B4 已移除"专家"一级导航；**无系统级 persona 绑定**。
- 注入点：`agent-runner.ts` `coworkAppendPrompt`（≈1972 行）→ codex `developerInstructions`，是 app
  系统提示组装处；**persona 系统提示插入此处**。（`extensionResult.promptPrefix` 是备选，但那是
  per-turn 用户 prompt 前缀，不适合 persona 系统提示。）
- 会话模型：`Session`（`src/renderer/types/index.ts` + DB `sessions` 表）已含 per-session
  `allowedTools`/`model`/`memoryEnabled`；加 `personaId?` 用现有 `ensureColumn` 迁移模式。
- 技能：当前 `skillPaths`/`skillsSignature`（agent-runner ≈1666）为**全局启用**口径；本任务**不**改造为
  per-session 硬隔离，"推荐技能"仅做一键启用引导。
- 文件式先例：skills 目录 + 热重载、Markdown 记忆——persona 采用同风格（MD + frontmatter）。

## Decisions

- **MVP 绑定范围 = 系统提示 + 技能推荐**：注入系统提示到 `developerInstructions`；
  `recommendedSkills`/`recommendedConnectors` 做"一键启用/推荐"（复用全局启用，**不**引入硬隔离）；
  可选 `model` 偏好。
- **存储 = 文件式**：内置 persona 随应用打包（资源）；用户自建存 `<userData>/personas/*.md`；
  加载时合并内置 + 用户，**同 id 用户文件覆盖内置**。
- **格式 = Markdown + YAML frontmatter**：frontmatter 放元数据(id/name/icon/scenarios/
  recommendedSkills/recommendedConnectors/model?/builtin)，正文即系统提示。
- **注入 = `developerInstructions`**（thread 级系统提示的正确归属）。
- **入口 = composer 选择器 + Welcome 卡片**：composer 内选择/切换/清除 persona + "管理专家"入口做
  CRUD；Welcome"邀请一位专家"卡片点击 = 新建会话并绑定该 persona。

## Requirements

- R1 **Persona 数据源**：定义 persona 记录（MD+frontmatter）；主进程加载内置(资源) + 用户
  (`<userData>/personas/*.md`)，解析 frontmatter，合并去重(用户覆盖内置)，容错(坏文件跳过)。
- R2 **会话绑定持久化**：`Session.personaId?` + DB `sessions.persona_id`（ensureColumn 迁移）+ 往返。
- R3 **系统提示注入**：turn 组装时按 `session.personaId` 解析 persona，将其系统提示作为 `<persona>` 段
  注入 `coworkAppendPrompt`；未绑定/解析失败 → 回退现有行为，不报错。
- R4 **技能推荐（软）**：绑定/切换 persona 时，UI 提示一键启用其 `recommendedSkills`（复用全局启用），
  非强制、可跳过；不做 per-session 硬隔离。
- R5 **UI**：composer persona 选择器（显示当前绑定/切换/清除/管理入口）；Welcome"邀请一位专家"卡片
  改为"新建并绑定"；persona 管理页（列出内置只读 + 用户可新建/编辑/删除，字段：名称/图标/场景/
  系统提示/推荐技能/模型）。
- R6 **IPC**：扩展 ClientEvent/ServerEvent（或 invoke）：list/get personas、CRUD 用户 persona、
  设置 session.personaId。沿用 `src/renderer/types/index.ts` 双 union 契约。
- R7 **i18n**：en + zh 均补键；内置 persona 文案随资源打包（非 i18n 键，或 id→i18n 映射，见 design）。

## Acceptance Criteria

- [ ] AC1（单测·可执行）：给定绑定 personaId 的 session，组装出的 `developerInstructions` 含该 persona
      系统提示段；未绑定或 personaId 不存在 → 不含 persona 段且不抛错（回退）。
- [ ] AC2（DB 往返）：设置 `session.personaId` 保存后重载会话仍绑定。
- [ ] AC3（加载）：内置 persona 可加载可绑定；`<userData>/personas/` 下新建 `.md` 被加载；同 id 用户文件
      覆盖内置；坏 frontmatter 文件被跳过而不崩溃。
- [ ] AC4（UI）：composer 显示当前 persona 并可切换/清除；切换时提示 recommendedSkills 一键启用。
- [ ] AC5（门禁）：`npx tsc --noEmit` + `npm run lint` + `npx vitest run` 全绿；新增单测覆盖
      frontmatter 解析、系统提示注入、personaId 持久化。

## Out of Scope

- 专家团 / multi-agent 编排（后续复用 SubagentExtension）。
- 专家市场 / 分类 / 最热 / 收藏 / 远程同步。
- per-session 技能/连接器硬隔离（本任务只做软推荐）。
