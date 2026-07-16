# Design — Agent Persona 层

关联：`prd.md`（本任务）、`.coding/tasks/07-16-workbuddy-gap-analysis`（GAP P0-①）。

## 1. 架构总览

```
渲染层                          主进程                              codex
────────                        ──────                             ─────
Composer PersonaSelector ─┐
Welcome 邀请一位专家卡片   ─┼─IPC('personas.*')─▶ PersonaManager ──┐
PersonaManagerModal(CRUD) ─┘                     (加载/合并/CRUD)   │
                                                                    ▼
store: session.personaId ──ClientEvent(set)──▶ SessionManager   AgentRunner.coworkAppendPrompt
                                                (persist persona_id)   └─注入 <persona> 段─▶ developerInstructions
```

- **PersonaManager**（新，`src/main/personas/persona-manager.ts`）：加载内置(资源) + 用户
  (`<userData>/personas/*.md`)，解析 frontmatter，合并(用户覆盖内置)，提供 list/get/CRUD；
  可选 chokidar 热重载(与 skills 一致，MVP 可先不热重载，改为 CRUD 后主动 reload)。
- **SessionManager**：持久化 `session.personaId`。
- **AgentRunner**：turn 组装时解析 persona，注入系统提示。
- **渲染层**：composer 选择器 + Welcome 卡片 + 管理弹窗。

## 2. 数据模型与文件格式

`Persona`（`src/renderer/types/index.ts`，主/渲染共用）：

```ts
export interface Persona {
  id: string; // 稳定 slug
  name: string;
  icon?: string; // lucide 名或内置 token
  description?: string;
  scenarios?: ScenarioId[]; // 复用 activation-gallery 的场景
  recommendedSkills?: string[]; // skill id
  recommendedConnectors?: string[]; // mcp server key
  model?: string; // 可选模型偏好
  systemPrompt: string; // frontmatter 之后的正文
  builtin: boolean; // 内置只读
  source: 'builtin' | 'user';
}
```

文件（MD + YAML frontmatter），示例 `personas/code-reviewer.md`：

```
---
id: code-reviewer
name: 代码审查专家
icon: code
scenarios: [coding]
recommendedSkills: [check, dev-prep]
model: gpt-5            # 可选
---
你是一位严格的代码审查专家……（正文即 systemPrompt）
```

- **解析**：沿用 skills-manager 的 frontmatter 提取正则 `/^---\r?\n([\s\S]*?)\r?\n---/`，YAML 块用
  **`js-yaml`**（已安装，稳妥处理数组）解析；正文 = 匹配之后的全部内容 `.trim()`。
- **内置**：源文件放 `resources/personas/*.md`（打包进 app 资源；开发期从仓库路径读），迁移 `EXPERT_PERSONAS`
  的 6 个为内置 md（含各自 i18n 现有 prompt 作 systemPrompt 起草）。**内置文案随资源打包**（不进 i18n 键，
  避免 i18n 与正文耦合；persona 的 `name` 可选走 i18n 映射，MVP 直接写在 frontmatter）。
- **用户**：`<userData>/personas/*.md`，文件名 = `<id>.md`。CRUD 即读写该目录。
- **合并**：Map by id，用户覆盖内置；坏文件（无 id / frontmatter 解析失败）跳过并 `logWarn`。

## 3. 系统提示注入（核心）

在 `agent-runner.ts` 组装 `coworkAppendPrompt` 处（≈1972）：

```ts
const persona = session.personaId
  ? await this.personaManager.get(session.personaId) // 主进程内解析
  : null;
const personaSection = persona?.systemPrompt?.trim()
  ? `<persona name="${escape(persona.name)}">\n${persona.systemPrompt.trim()}\n</persona>`
  : null;
// 组装顺序：app 基调 → CRITICAL RULES → <persona> → config/workspace → citation/tool → path hints
```

- persona 段置于行为规则之后、配置/工作区之前，作为**角色设定**层。
- **回退**：`personaId` 为空或解析失败 → `personaSection = null`，与现状完全一致（不报错）。
- persona 的 `model` 偏好：若设置且 session 未显式指定 model，则作为该会话默认（在 modelConfig 解析前应用）；
  MVP 可仅记录、暂不覆盖，避免与"多配置方案"冲突（**确认点**，见 §7）。
- **注意**：`developerInstructions` 只在 **thread/start** 播种；换绑 persona 后需让下一轮走新线程或
  重新播种——复用现有 `skillsSignature` 失效重建线程的机制：把 personaId 纳入 runtime/skills 签名，
  **绑定变化即 dispose 旧 codex 线程**（`disposeSession`），确保新系统提示生效。

## 4. 会话绑定与持久化

- `Session.personaId?: string`（renderer 类型）。
- DB：`sessions.persona_id TEXT`，用现有 `ensureColumn(database,'sessions','persona_id','persona_id TEXT')`；
  `saveSession`/`loadSession` 往返（对齐 `codex_runtime_signature` 的写法）。
- 设置入口：新增 ClientEvent `{ type:'session.setPersona', sessionId, personaId|null }` →
  SessionManager 更新内存 + `db.sessions.update(id,{persona_id})`；广播 ServerEvent 会话更新。

## 5. IPC 契约

- **Persona 读取/CRUD**（request/response，仿 skills 用 `ipcMain.handle`）：
  `personas.getAll()`→`Persona[]`；`personas.get(id)`；`personas.save(input)`（新建/编辑用户 persona，
  内置只读→拒绝）；`personas.delete(id)`（仅 user）；`personas.openDir()`。preload 暴露 `personas:{…}`。
- **会话绑定**（fire-and-forget）：ClientEvent `session.setPersona`（扩 `src/renderer/types` union +
  `handleClientEvent` 分发）。
- 技能推荐一键启用：复用现有 `skills.setEnabled`（无新接口）。

## 6. 渲染层

- **PersonaSelector**（`src/renderer/components/composer/PersonaSelector.tsx`）：composer bar 内下拉，显示
  当前 persona（图标+名）/切换/清除(无 persona)/"管理专家"入口；切换后调 `session.setPersona`，并弹
  轻提示"启用推荐技能？"（一键 `skills.setEnabled`）。
- **WelcomeView**：`ExpertsGallery` 卡片 `onSeed` 改为 `onPick(personaId)` = 新建会话(`setActiveSession(null)`)
  并 `session.setPersona`（bound at creation）；保留 prompt 预填为可选。
- **PersonaManagerModal**（CRUD）：列内置(只读徽标) + 用户(可编辑/删除)，表单：名称/图标/场景/系统提示
  (textarea)/推荐技能(多选现有 skills)/模型(可选)。走 `personas.save/delete`。
- store：`personas` 列表缓存 + 当前会话 personaId（已在 session 上）。

## 7. 兼容/权衡/确认点

- **不改技能全局口径**（软推荐），避免大重构；per-session 硬隔离留后续。
- persona `model` 覆盖会话模型：**确认点**——与"配置方案/model"交互，MVP 建议**只提示不强制覆盖**。
- 内置 persona 文案 i18n：MVP 直接写在内置 md（中文优先，可后续加 en 内置文件 `personas/<id>.en.md`）。
- 换绑触发线程重建（§3）：确保系统提示即时生效，代价是一次 thread 重启（可接受）。

## 8. 测试计划（AC 映射）

- 单测 `persona-manager.test.ts`：frontmatter 解析(含数组/坏文件跳过)、内置+用户合并(用户覆盖内置)（AC3）。
- 单测 `agent-runner` 注入：给定 personaId→developerInstructions 含 `<persona>` 段；空/不存在→回退无段（AC1）。
- 单测 SessionManager：personaId DB 往返（AC2）。
- 门禁：tsc + lint + vitest（AC5）。UI(AC4) 以组件渲染/交互单测 + 手动验收。

## 9. 变更文件清单

新增：`src/main/personas/persona-manager.ts`、`resources/personas/*.md`(6 内置)、
`src/renderer/components/composer/PersonaSelector.tsx`、`.../PersonaManagerModal.tsx`、
`src/tests/personas/persona-manager.test.ts`(+注入/持久化测试)。
改动：`src/renderer/types/index.ts`(Persona/Session.personaId/ClientEvent union)、
`src/main/db/database.ts`(persona_id 列 + 往返)、`src/main/session/session-manager.ts`(setPersona+往返)、
`src/main/agent/agent-runner.ts`(注入 + personaId 纳入线程签名)、`src/main/index.ts`(personas._ handlers +
PersonaManager 实例 + session.setPersona 分发)、`src/preload/index.ts`(personas: 暴露)、
`src/renderer/components/WelcomeView.tsx` + `ExpertsGallery.tsx`(pick→bind)、
`src/renderer/components/composer/_`(挂 PersonaSelector)、i18n en/zh、打包配置(resources/personas 纳入)。
