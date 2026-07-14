# Runtime Extensions

Agent capabilities beyond the base tools are composed as **`AgentRuntimeExtension`s**,
registered through an `AgentRuntimeExtensionManager`.

## The pattern

- Base interface: `src/main/extensions/agent-runtime-extension.ts`.
- Manager: `src/main/extensions/agent-runtime-extension-manager.ts`
  (`AgentRuntimeExtensionManager`).
- Concrete extensions live next to their subsystem, not all in one folder:
  - `MemoryExtension` — `src/main/memory/memory-extension.ts`
  - `ConfigExtension` (the `config_read` / `config_write` agent tools) —
    `src/main/config/config-extension.ts`
  - `SubagentExtension` (in-process child sessions) —
    `src/main/agent/subagent-extension.ts`

To add an agent capability (a new tool or lifecycle behavior), implement a new
`AgentRuntimeExtension` and register it — do not bolt logic directly onto the runner.

## Critical: register in BOTH managers

`src/main/index.ts` builds **two** `AgentRuntimeExtensionManager` instances with their
own extension lists:

- headless path — `new AgentRuntimeExtensionManager([...])` at `src/main/index.ts:924`
- GUI path — `new AgentRuntimeExtensionManager([...])` at `src/main/index.ts:1341`

When you add an extension, add it to **both** lists. They diverge silently otherwise —
a capability that works in the GUI but is missing in headless (or vice versa) is the
classic symptom.

## Anti-patterns

- Adding agent tools/behavior straight onto `CoworkAgentRunner` instead of as an
  extension.
- Registering a new extension in only one of the two managers.
