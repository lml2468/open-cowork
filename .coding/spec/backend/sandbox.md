# Sandbox Guidelines (`src/main/sandbox/`)

> Layered isolation for agent command/file execution. Path guards run **always**; VM
> isolation (Lima on macOS, WSL2 on Windows) is optional; the in-VM agent re-validates
> independently. VM failure ALWAYS falls back to native — it never hard-fails startup.

---

## Three-layer defense model

When it applies: every command or file op the agent runs on the host or in a VM.

1. **Path guards (host, always on).** `PathGuard` (`path-guard.ts`) static methods
   `isPathAllowed(path, sessionId)` / `validateCommand(command, sessionId)` screen against
   `FORBIDDEN_PATTERNS` (macOS vs Linux sets, chosen by `process.platform`) and
   `DANGEROUS_COMMAND_PATTERNS`. Containment is checked with `isPathWithinRoot`
   (`src/main/tools/path-containment.ts`), then symlinks are resolved via `fs.realpathSync`
   and re-checked to defeat symlink-escape attacks. `NativeExecutor` (`native-executor.ts`)
   enforces the same lexical + `fs.realpathSync` symlink re-check inline.
2. **VM isolation (optional).** `SandboxMode = 'wsl' | 'lima' | 'native' | 'none'`
   (`sandbox-adapter.ts:31`). When enabled, commands are proxied into a Lima/WSL VM.
3. **In-VM agent (independent).** `lima-agent/` and `wsl-agent/` re-validate every request
   with their own `path-containment.ts` before touching the VM filesystem.

Proving files: `path-guard.ts`, `native-executor.ts`, `sandbox-adapter.ts:31`,
`src/main/sandbox/lima-agent/path-containment.ts`.

---

## SandboxAdapter — the single entry point

When it applies: any code that needs to run sandboxed ops.

`SandboxAdapter implements SandboxExecutor` (`sandbox-adapter.ts:53`) is a singleton
obtained via `getSandboxAdapter()` and configured via `initializeSandbox(config)`
(`sandbox-adapter.ts:720`, `:730`). It picks a delegate executor by mode:
`initializeWSL` / `initializeLima` / `initializeNative`. Every VM init path is wrapped so a
failure to detect/start/install the VM downgrades to native and shows a warning
(`showWSLNotAvailableWarning`, `showLimaNotAvailableWarning`, `showNativeFallbackWarning`),
never throwing out of startup.

`SandboxExecutor` (`types.ts:67`) is the contract all four executors implement:
`initialize`, `executeCommand`, `readFile`, `writeFile`, `listDirectory`, `fileExists`,
`deleteFile`, `createDirectory`, `copyFile`, `shutdown`.

Anti-pattern: calling `runClaudeCode` in native mode — it is VM-only. `SandboxAdapter.runClaudeCode`
(`sandbox-adapter.ts:686`) casts to `WSLBridge`/`LimaBridge`; there is no native impl.

---

## Startup bootstrap

When it applies: app startup, once.

`SandboxBootstrap` (`sandbox-bootstrap.ts:49`) does the slow work: detect the VM, create
and start the instance, install Node/Python/pip/skill-deps, and cache the result in
`cachedWSLStatus` / `cachedLimaStatus` (`:56-57`). Later code reads the cached status rather
than re-probing. Phases are surfaced as progress (`installing_node`, `installing_python`,
`installing_deps`, …). A failed Node install returns `{ mode: 'native', ... }` — again,
best-effort downgrade, never a hard fail.

---

## Command proxying — JSON-RPC over stdin/stdout

When it applies: any op in `wsl`/`lima` mode.

`WSLBridge` (`wsl-bridge.ts:97`) and `LimaBridge` (`lima-bridge.ts:120`) spawn the in-VM
agent as a **long-lived child** and speak **JSON-RPC 2.0**, newline-delimited, over
stdin/stdout. `sendRequest(method, params)` (`lima-bridge.ts:790`) assigns a `uuid` id,
writes the request, and matches the response by id; incoming buffer is split on `/\r?\n/`.

Platform differences:

- **WSL**: decodes VM output as **UTF-16LE** (Windows WSL default; `wsl-bridge.ts:122`+).
  Path conversion via `pathConverter` (`wsl-bridge.ts:48`): `toWSL('D:\\x') → '/mnt/d/x'`,
  `toWindows('/mnt/d/x') → 'D:\\x'`.
- **Lima**: `limaPathConverter` (`lima-bridge.ts:93`) is effectively identity — Lima mounts
  `/Users` directly, so mac paths pass through unchanged. `pathConverter` is aliased to
  `limaPathConverter` (`lima-bridge.ts:115`).

Anti-pattern: cross-wiring the two `pathConverter`s. They are exported from different files
and are NOT interchangeable — the WSL converter rewrites drive letters, the Lima one does not.

---

## Workspace sync

When it applies: session start/end in VM mode.

`SandboxSync` (`sandbox-sync.ts:82`) and `LimaSync` (`lima-sync.ts:71`) rsync the workspace
into and out of an isolated VM dir `~/.claude/sandbox/{sessionId}` (`sandbox-sync.ts:141`),
excluding entries in `SYNC_EXCLUDES` (`sandbox-sync.ts:59`). `rsync -av --delete` is built
with `shellEscapePath` and each session id is validated with `validateSessionId`
(distro names with `validateDistroName`, `sandbox-sync.ts:26`, `:33`).
`PathGuard`/`SandboxSync.getSession(sessionId)` (`sandbox-sync.ts:469`) resolves the active
sandbox root for a session.

---

## In-VM agents are standalone TS projects

When it applies: editing anything under `lima-agent/` or `wsl-agent/`.

Each has its **own** `tsconfig.json` and is compiled separately via `build:lima-agent` /
`build:wsl-agent` (`package.json:46-47`), then bundled into resources. The two are
near-identical and differ only by labels (`/Users` vs `/mnt`). `handleRequest` in each
`index.ts` is the JSON-RPC dispatch switch (`lima-agent/index.ts:435`) with cases
`ping`, `setWorkspace`, `executeCommand`, `readFile`, `writeFile`, `listDirectory`,
`fileExists`, `deleteFile`, `createDirectory`, `copyFile`, `runClaudeCode`, `shutdown`.

**CRITICAL**: agent code MUST NOT import from `src/shared/` — it is bundled into the VM
agent, which has no access to the app tree. `lima-agent/path-containment.ts` inlines the
Windows drive / UNC regex helpers with an explicit comment stating exactly this. Copy
helpers in, never `import` across the boundary.

---

## Workspace path constraints

`getUnsupportedWorkspacePathReason` (`src/main/workspace-path-constraints.ts:9`, called at
`src/main/index.ts:651`) is the gate for rejecting a workspace path. Currently the only
rejection: `win32` + sandbox enabled + UNC path (`isUncPath` from
`src/shared/local-file-path`). Add new host-level restrictions here, not scattered in callers.

---

## Adding a new sandbox operation (checklist)

1. Extend the `SandboxExecutor` interface in `types.ts`.
2. Implement it in **all four** executors: `WSLBridge`, `LimaBridge`, `NativeExecutor`, and
   both in-VM agents' `handleRequest` switch.
3. Keep JSON-RPC **method names in lockstep** across bridges and agents.
4. Wire the passthrough in `SandboxAdapter`.
5. Use `shellEscapePath` + `validateSessionId` / `validateDistroName` for any shelled input.
6. Resolve symlinks (`fs.realpathSync`) and re-check containment before acting.

Anti-patterns summary:

- Importing `src/shared/*` into `lima-agent/`/`wsl-agent/` (breaks the VM bundle).
- Cross-wiring `pathConverter`s.
- Expecting `runClaudeCode` in native mode (VM-only, throws).
- Adding a new op to only one executor (breaks mode parity).
