# Implement — Agent Persona 层

执行前读：`prd.md` → `design.md`。按序推进；每阶段跑对应校验。**不在本任务提交 git**（由用户在
Finish 阶段决定）。

## 阶段 0 · 前置确认（10 min）

- [ ] 确认 `resources/` 打包纳入新目录 `resources/personas/`（electron-builder `files`/extraResources）。
- [ ] 确认内置 md 开发期读取路径（`app.isPackaged ? process.resourcesPath : <repoRoot>/resources`）。
- [ ] 复核 skills-manager 的 frontmatter 正则与 `js-yaml` 用法，作为 PersonaManager 解析基准。

## 阶段 1 · 数据层与加载（TDD 优先）

1. [ ] `src/renderer/types/index.ts`：加 `Persona` 接口、`Session.personaId?`、ClientEvent
       `session.setPersona`。（tsc）
2. [ ] `src/main/personas/persona-manager.ts`：`loadAll()`（内置+用户合并）、`get(id)`、`save(input)`、
       `delete(id)`、`getUserDir()`、`reload()`；frontmatter 正则 + `js-yaml` 解析；坏文件跳过 `logWarn`。
3. [ ] `resources/personas/*.md`：迁移 6 个内置（code-reviewer/refactor-guide/writing-coach/
       data-analyst/ux-designer/brand-designer），systemPrompt 起草自现有 i18n prompt。
4. [ ] 测试 `src/tests/personas/persona-manager.test.ts`：解析(数组/坏文件)、合并(用户覆盖内置)。
       **校验**：`npx vitest run src/tests/personas/persona-manager.test.ts`。

## 阶段 2 · 会话绑定持久化

5. [ ] `src/main/db/database.ts`：`ensureColumn(...,'persona_id','persona_id TEXT')` + `saveSession`/
       `loadSession` 往返（仿 `codex_runtime_signature`）。
6. [ ] `src/main/session/session-manager.ts`：`setSessionPersona(sessionId, personaId|null)` → 内存 +
       `db.sessions.update` + 广播会话更新。
7. [ ] `src/main/index.ts`：`handleClientEvent` 分发 `session.setPersona`。
8. [ ] 测试：personaId DB 往返（AC2）。**校验**：`npx vitest run -t "persona"`。

## 阶段 3 · 系统提示注入（核心）

9. [ ] `src/main/agent/agent-runner.ts`：解析 `session.personaId`→persona，组装 `<persona>` 段注入
       `coworkAppendPrompt`（顺序见 design §3）；空/失败回退。
10. [ ] 将 personaId 纳入线程/技能签名，绑定变化触发 `disposeSession`（新系统提示即时生效）。
11. [ ] 测试：给定 personaId→developerInstructions 含段；空/不存在→无段不报错（AC1）。
        **校验**：`npx vitest run`（agent-runner 相关）。
        ⚠️ 风险文件：`agent-runner.ts` 是热路径巨型函数——最小侵入，只加解析+段拼接+签名字段。

## 阶段 4 · IPC + 渲染层

12. [ ] `src/main/index.ts`：`ipcMain.handle('personas.getAll/get/save/delete/openDir')`（内置只读保护）+
        实例化 PersonaManager（GUI 与 headless 两处若都需要则同步，参照扩展管理器双实例注意点）。
13. [ ] `src/preload/index.ts`：暴露 `personas:{…}` + 类型声明。
14. [ ] `src/renderer/components/composer/PersonaSelector.tsx`：下拉(当前/切换/清除/管理) + 切换后
        "启用推荐技能?"一键(`skills.setEnabled`)。挂到 composer bar。
15. [ ] `PersonaManagerModal.tsx`：CRUD 表单（内置只读）。
16. [ ] `WelcomeView.tsx` + `ExpertsGallery.tsx`：卡片 `onPick(personaId)` = 新建会话并绑定。
17. [ ] i18n en+zh 补键。
        **校验**：`npx tsc --noEmit && npm run lint`。

## 阶段 5 · 全量门禁与验收

18. [ ] `node scripts/ensure-sqlite.js node`（测试 ABI）→ `npx vitest run`。
19. [ ] `npx tsc --noEmit` + `npm run lint` 全绿。
20. [ ] 手动验收（`run` 技能或 `npm run dev`）：AC4——composer 选 persona、切换提示启用技能、Welcome
        卡片新建并绑定、重开会话仍绑定、系统提示生效(可用一个"自报角色"的探性问题观察)。

## 校验命令汇总

```
npx vitest run src/tests/personas/persona-manager.test.ts
npx vitest run -t "persona"
npx tsc --noEmit
npm run lint
npx vitest run
```

## 风险与回滚点

- **agent-runner 注入**（阶段 3）：热路径，改动最小化；若注入引发线程/签名问题，回滚该 commit 即恢复
  （persona 数据层/UI 不受影响）。
- **DB 迁移**：`ensureColumn` 幂等、可加列不破坏旧库；无需回滚脚本。
- **打包资源**：`resources/personas` 若未纳入打包，内置 persona 在打包版缺失——阶段 0 先确认，
  `pre-build-check.js` 可加断言。
- **双实例扩展/manager**：GUI 与 headless 若各建 PersonaManager，注意与现有"两处扩展列表保持同步"约束一致。
