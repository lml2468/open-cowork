# Main Layer

> Electron main process (`src/main/`): the IPC dispatcher, agent execution, runtime
> extensions, and the platform subsystems.

The main process owns all privileged work: it dispatches every `ClientEvent`, drives
the agent loop, manages sessions/DB, and hosts the sandbox, MCP, skills, memory, and
schedule subsystems. It pushes results back to the renderer as `ServerEvent`s.

## Guidelines Index

| Guide                                         | Description                                                     |
| --------------------------------------------- | --------------------------------------------------------------- |
| [IPC Dispatch](./ipc-dispatch.md)             | `handleClientEvent`, channels, sending `ServerEvent`s           |
| [Agent & Sessions](./agent-and-sessions.md)   | `SessionManager` → `CoworkAgentRunner`, provider/config routing |
| [Runtime Extensions](./runtime-extensions.md) | `AgentRuntimeExtension` + the two-manager sync rule             |

## Pre-Development Checklist

- [ ] A renderer-triggered feature: add a `ClientEvent` variant and a branch in
      `handleClientEvent` (`src/main/index.ts`) — not a new IPC channel.
- [ ] A new agent capability (tool / behavior): implement it as an
      `AgentRuntimeExtension` and register it in **both** manager instances (GUI +
      headless) in `src/main/index.ts`.
- [ ] Provider/model/auth logic belongs in `src/main/config/config-store.ts` +
      `src/main/agent/codex-runtime/codex-model-config.ts`, not scattered.
- [ ] Any work path that runs the agent must first gate on configured credentials
      (`hasUsableCredentialsForActiveSet`).
- [ ] TypeScript strict, no `any` (`catch (e: unknown)`, not `catch (e: any)`).

## Quality Check

- [ ] `npx tsc --noEmit` clean; no `any`.
- [ ] New `ClientEvent` handled in `handleClientEvent`; results flow back as
      `ServerEvent`s, not ad-hoc channels.
- [ ] New extension added to both the GUI and headless `AgentRuntimeExtensionManager`
      lists (they will silently diverge otherwise).
- [ ] Credential gating preserved on any new run path.
- [ ] Tool/permission gating **fails closed**: a bridge answering an agent's approval
      request must default to _deny_ when the decision is missing, the handler is
      unwired, or it throws — never auto-approve. (See `codex-runtime/codex-permission-bridge.ts`.)
- [ ] `npx vitest run` passes (mirrors CI; see the build-and-test guide).
