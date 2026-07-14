# OpenAI Codex CLI — Integration Surface Evaluation

**Goal:** assess whether the open-source OpenAI Codex agent (github.com/openai/codex) can be driven as the backend agent runtime from an Electron main process, replacing an in-process SDK loop.

**Date:** 2026-07-14
**Codex is:** a coding agent from OpenAI that runs locally, written ~96% in **Rust** (`codex-rs/`), distributed as a native binary via npm (`@openai/codex`) and Homebrew. Repo: https://github.com/openai/codex (Apache-2.0).

**Note on sources:** the in-repo prose docs (`docs/config.md`, `docs/exec.md`, `docs/sandbox.md`) on `main` are now thin stubs that redirect to the hosted docs at developers.openai.com / learn.chatgpt.com (a JS app that resists automated fetching). The last repo commit carrying the _full_ markdown is tag **`rust-v0.44.0`**, which I use for verbatim config/flag quotes; behavior is cross-checked against current Rust sources on `main` (crate names, protocol structs, CLI subcommands). Where `main` differs materially from v0.44.0 I call it out.

Relevant CLI subcommands confirmed on `main` (`codex-rs/cli/src/lib.rs`):

- `codex exec` — non-interactive run
- `codex mcp` — manage external MCP servers (Codex as MCP _client_)
- `codex mcp-server` — "Start Codex as an MCP server (stdio)"
- `codex app-server` — "[experimental] Run the app server" (JSON-RPC over stdio)
- `codex exec-server` — "[EXPERIMENTAL] Run the standalone exec-server service"
- (`codex proto` — the old streaming protocol — has been superseded by `app-server`.)

Source: https://github.com/openai/codex/blob/main/codex-rs/cli/src/lib.rs

---

## 1. Programmatic / headless driving — **SUPPORTED (strong)**

Three distinct non-interactive surfaces, in increasing richness:

**(a) `codex exec` + `--json` (JSONL event stream).** Runs a prompt non-interactively and streams structured events to stdout as JSON Lines. Documented event/item taxonomy:

- Thread/turn events: `thread.started`, `turn.started`, `turn.completed` (includes token usage), `turn.failed`, and `item.started` / `item.updated` / `item.completed`.
- Item types carried inside `item.*`: `assistant_message`, `reasoning`, `command_execution` (with `command`, `aggregated_output`, `exit_code`, `status`), `file_change`, `mcp_tool_call`, `web_search`.

So a parent process **can** stream assistant text, reasoning summaries, and tool-call begin/end as structured JSON. Also supports `--output-schema <file>` (strict JSON Schema for structured final output) and `-o` (print/save only the final JSON). Evidence: https://github.com/openai/codex/blob/rust-v0.44.0/docs/exec.md

Caveat: `codex exec` **forces `--ask-for-approval never`** ("the `exec` subcommand always uses this mode"), so this surface gives you the event stream but **no interactive approval callback** — see §4. Evidence: https://github.com/openai/codex/blob/rust-v0.44.0/docs/config.md (approval_policy section).

**(b) `codex app-server` — JSON-RPC over stdio (the real embedding surface).** A long-lived process speaking a versioned JSON-RPC protocol (`codex-rs/app-server-protocol/`, protocol `v2`). It exposes `thread/start`, `thread/resume`, `turn/start`, `thread/settings/update`, streams `*Notification` events (e.g. `TurnStartedNotification`, `TurnCompletedNotification`, `TurnDiffUpdatedNotification`, `TurnPlanUpdatedNotification`), thread items, **and server→client approval requests** (see §4) and **host-provided dynamic tool-call requests** (see §2). This is what the official IDE integrations and SDK sit on. Evidence: https://github.com/openai/codex/tree/main/codex-rs/app-server-protocol/src/protocol/v2 ; https://github.com/openai/codex/blob/main/codex-rs/app-server-protocol/src/protocol/v2/thread.rs

**(c) Official TypeScript SDK — `@openai/codex-sdk`.** Node 18+. It **spawns the `codex` CLI and exchanges JSONL events over stdin/stdout** (i.e. it is a wrapper over the app-server/exec protocol, not a reimplementation). API:

```ts
import { Codex } from '@openai/codex-sdk';
const codex = new Codex();
const thread = codex.startThread();
const turn = await thread.run('…'); // buffered
const { events } = await thread.runStreamed('…'); // async generator: item.completed, turn.completed, …
codex.resumeThread(savedThreadId); // resume from ~/.codex/sessions
```

Per-thread options include `workingDirectory`, `skipGitRepoCheck`, `env`, `outputSchema`, image inputs, and a `config` bag flattened to `--config key=value` overrides (e.g. `sandbox_workspace_write.network_access`, `show_raw_agent_reasoning`). A Rust embedding path also exists in-repo (`codex-rs/codex-client`, `codex-rs/core-api`) but is not published as a stable external crate. Evidence: https://github.com/openai/codex/blob/main/sdk/typescript/README.md ; npm `@openai/codex-sdk`.

**Verdict:** Fully supported. For an Electron main process the natural choice is a long-lived `codex app-server` (or the TS SDK, which wraps it) so you get the full event stream _plus_ approval and custom-tool callbacks; `codex exec --json` is a simpler per-turn fallback that lacks interactive approvals.

---

## 2. Custom (host-injected) tools — **SUPPORTED (experimental) + MCP**

Codex is **not** limited to its built-ins (`shell`/exec, `apply_patch`, plan tool, `web_search`) plus MCP. The protocol has a first-class **dynamic tools** mechanism letting the host register its own function tools into the model's loop:

- `thread/start` accepts `dynamic_tools: Option<Vec<DynamicToolSpec>>` (flagged `#[experimental("thread/start.dynamicTools")]`). A `DynamicToolSpec` is either a `Function { name, description, input_schema (JSON Schema), defer_loading }` or a `Namespace { name, description, tools[] }`. Evidence: https://github.com/openai/codex/blob/main/codex-rs/app-server-protocol/src/protocol/v2/thread.rs (lines ~21-24, ~127-133) and https://github.com/openai/codex/blob/main/codex-rs/protocol/src/dynamic_tools.rs
- When the model calls one, Codex emits a `DynamicToolCallRequest { call_id, turn_id, namespace, tool, arguments }` to the host, which replies with `DynamicToolResponse { content_items: [InputText|InputImage], success }`. The call also surfaces as a `DynamicToolCall` thread item. Evidence: `dynamic_tools.rs`; https://github.com/openai/codex/blob/main/codex-rs/app-server-protocol/src/protocol/v2/item.rs (`ThreadItem::DynamicToolCall`).

So the host CAN inject its own tools and service the calls out-of-process — this maps well onto the app's existing tool layer. Two caveats: (1) it is **experimental** (gated behind an experimental flag, only over the app-server protocol — the published TS SDK README does not document it yet), so the shape may change; (2) MCP remains the _stable/documented_ extension path.

**Verdict:** Supported (dynamic tools, experimental) — MCP is not the only extension path, but it is the only _stable_ one today.

---

## 3. MCP support — **SUPPORTED (both directions)**

**As an MCP client** (Codex calls out to MCP tools): yes. Configured under a top-level `mcp_servers` table in `~/.codex/config.toml`:

```toml
# STDIO transport
[mcp_servers.server-name]
command = "npx"
args = ["-y", "mcp-server"]        # optional
env = { "API_KEY" = "value" }       # optional (plus a default env whitelist)

# Streamable HTTP transport (needs the experimental rmcp client)
experimental_use_rmcp_client = true
[mcp_servers.figma]
url = "http://127.0.0.1:3845/mcp"
bearer_token = "<token>"            # optional -> Authorization: Bearer
```

Optional `startup_timeout_sec` (default 10s) and `tool_timeout_sec` (default 60s). Managed via CLI: `codex mcp add|list|get|remove` (with `--json`). Codex is migrating to the official Rust MCP SDK (`codex-rs/rmcp-client`); Streamable HTTP only works under the new client. Evidence: https://github.com/openai/codex/blob/rust-v0.44.0/docs/config.md (MCP Servers section).

**As an MCP server** (Codex is itself an MCP tool other clients call): yes — `codex mcp-server` ("Start Codex as an MCP server (stdio)"), implemented in `codex-rs/mcp-server/`. Notably it re-exposes approvals through MCP **elicitation** (`elicitation/create`) so an MCP host can approve each command/patch — see §4. Evidence: https://github.com/openai/codex/blob/main/codex-rs/cli/src/lib.rs ; https://github.com/openai/codex/tree/main/codex-rs/mcp-server/src

**Verdict:** Supported both as client and server; STDIO and Streamable HTTP transports; standard `mcp_servers` TOML config.

---

## 4. Approval / permission model — **PARTIAL→SUPPORTED (per-tool gating requires app-server or mcp-server, NOT `codex exec`)**

Two layers exist: coarse **policy flags** and, on the right surface, a genuine **per-tool approval callback**.

**Policy flags / presets** (`config.toml` or CLI):

- `approval_policy`: `untrusted` (prompt for anything outside a hardcoded trusted set), `on-failure` (only ask to retry a sandboxed command that failed), `on-request` (model decides when to escalate), `never` (never prompt).
- Presets: `--full-auto` (= `workspace-write` + `on-failure`), `--ask-for-approval on-request`, `--dangerously-bypass-approvals-and-sandbox` / `--yolo` (no sandbox, no prompts).
- Named **permission profiles** and (on `main`) `permissions` profile ids per thread/turn.
  Evidence: https://github.com/openai/codex/blob/rust-v0.44.0/docs/config.md ; https://github.com/openai/codex/blob/rust-v0.44.0/docs/sandbox.md

**Per-tool programmatic interception:** available on the interactive surfaces, not on `codex exec`.

- **app-server protocol:** approval requests are surfaced as server→client requests the host must answer with a decision — `CommandExecutionApprovalDecision` and `FileChangeApprovalDecision` (map from core `ReviewDecision`: approve / approve-for-session / reject / …). There is also a richer "Guardian" auto-review layer (`GuardianApprovalReview*`, `item/autoApprovalReview/*`) and an `approvals_reviewer` routing knob per thread/turn. Evidence: https://github.com/openai/codex/blob/main/codex-rs/app-server-protocol/src/protocol/v2/item.rs (`CommandExecutionApprovalDecision`, `FileChangeApprovalDecision`, `GuardianApprovalReview`).
- **mcp-server mode:** each exec/patch approval is sent to the client as an MCP `elicitation/create` request carrying the full command context (`ExecApprovalElicitRequestParams { message, requestedSchema, threadId, codex_command, codex_cwd, codex_parsed_cmd, … }`); the client replies with `{ decision: ReviewDecision }`. Evidence: https://github.com/openai/codex/blob/main/codex-rs/mcp-server/src/exec_approval.rs and `.../patch_approval.rs`.
- **`codex exec`:** forces `--ask-for-approval never`; no per-call callback. Use it only when you delegate all gating to the sandbox/policy layer.

**Verdict:** The critical requirement — _per-tool permission gating with a host callback_ — is met, but ONLY via `codex app-server` (or `codex mcp-server`). If you drive `codex exec`, you get coarse policy flags only. This is the single biggest reason to embed via app-server rather than exec. Note the approval unit is command/patch/network/MCP-tool granularity (not an arbitrary "before every tool" hook), and the app-server approval routing is still partly experimental.

---

## 5. Sandbox model — **SUPPORTED, and DELEGABLE**

Codex ships OS-native sandboxing keyed off `sandbox_mode`:

- `read-only`, `workspace-write` (cwd + `$TMPDIR` + `/tmp` writable; extra `writable_roots`; network **off** unless `[sandbox_workspace_write].network_access = true`), `danger-full-access`.
- **macOS 12+:** Apple **Seatbelt** via `sandbox-exec -p <profile>`. **Linux:** **Landlock + seccomp** (`codex-rs/linux-sandbox`, `bwrap`). Evidence: https://github.com/openai/codex/blob/rust-v0.44.0/docs/sandbox.md
- **Windows:** the v0.44 doc only covered mac/Linux, but `main` now has a dedicated **`codex-rs/windows-sandbox-rs`** crate and a hosted "Windows sandbox" doc — Windows sandboxing exists on current builds (AppContainer-based). Evidence: https://github.com/openai/codex/tree/main/codex-rs/windows-sandbox-rs

**Disabling / delegating:** fully supported. Set `sandbox_mode = "danger-full-access"` (or `--sandbox danger-full-access`, or `--dangerously-bypass-approvals-and-sandbox`). The docs explicitly recommend this pattern when running inside your own container/VM: "configure your Docker container so that it provides the sandbox guarantees … and then run `codex` with `--sandbox danger-full-access`." That is exactly the delegation model the app needs for its Lima/WSL VM. Evidence: https://github.com/openai/codex/blob/rust-v0.44.0/docs/sandbox.md

**Verdict:** Supported and cleanly delegable — turn Codex's own sandbox off and let it run full-access _inside_ the app's existing VM sandbox. Windows now covered.

---

## 6. Model / provider support — **SUPPORTED (multi-provider, OpenAI-compatible)**

Not OpenAI-only. `model_providers.<id>` entries define arbitrary providers:

```toml
model = "gpt-4o"
model_provider = "my-provider"
[model_providers.my-provider]
name = "…"
base_url = "https://api.openai.com/v1"   # any OpenAI-compatible endpoint
env_key = "OPENAI_API_KEY"                # -> Bearer token
wire_api = "chat"                          # "chat" (chat/completions) or "responses"
query_params = {}                          # e.g. Azure api-version
http_headers / env_http_headers = { … }    # custom headers
```

Documented working examples: **Ollama** (`http://localhost:11434/v1`), **Mistral**, **Azure OpenAI** (`wire_api = "responses"` + `api-version` query param). Built-in `openai` provider's base URL is overridable via `OPENAI_BASE_URL`. Repo also has dedicated `codex-rs/ollama`, `codex-rs/lmstudio`, and `codex-rs/aws-auth` (Amazon Bedrock) crates. Evidence: https://github.com/openai/codex/blob/rust-v0.44.0/docs/config.md (model_providers section).

**Auth:** two models — (1) **Sign in with ChatGPT** (Plus/Pro/Business/Edu/Enterprise), (2) **API key**. `codex exec` also honors a `CODEX_API_KEY` env var (exec-only override). Per-provider key via `env_key`. Evidence: https://github.com/openai/codex/blob/rust-v0.44.0/docs/exec.md ; repo README auth section.

**Verdict:** Supported — points at arbitrary OpenAI-compatible base URLs, matches the app's existing multi-provider posture (Anthropic/OpenAI/Gemini/OpenAI-compatible). One caveat: routing is per-provider via `wire_api = chat|responses`; non-OpenAI wire protocols (e.g. Anthropic's native Messages API, Gemini) are only reachable if fronted by an OpenAI-compatible shim — Codex speaks OpenAI chat/responses wire formats, not Anthropic/Gemini native.

---

## 7. Conversation history / session model — **SUPPORTED**

Codex owns context/history and persists it. Sessions are stored on disk under `~/.codex/sessions` (rollout files; crates `codex-rs/rollout`, `message-history`, `thread-store`, `thread-manager-sample`).

- Resume non-interactively: `codex exec resume <SESSION_ID>` or `codex exec resume --last` (preserves conversation context; flags are NOT preserved and must be re-passed). Evidence: https://github.com/openai/codex/blob/rust-v0.44.0/docs/exec.md
- Resume via protocol/SDK: `thread/resume` (app-server) / `codex.resumeThread(threadId)` (TS SDK). Threads emit a `thread_id` on `thread.started` for later resumption. Evidence: `sdk/typescript/README.md`; `app-server-protocol/.../thread.rs`.

**Can the host supply prior history?** Resuming a Codex-owned session id: yes. Injecting an _externally-authored_ transcript that Codex never created: not a documented first-class API — history is Codex-managed (rollout files keyed by thread id). Migration from other agents has partial tooling (`codex-rs/external-agent-migration`) but it is not a general "load my message array" API.

**Verdict:** Supported for Codex-native sessions (resume by id / `--last`). If the app must be the source of truth for history, plan to either let Codex own the thread store and mirror it, or feed history as prompt context — there is no clean "here is the full prior transcript" injection API.

---

## 8. Embedding constraints (Rust binary, packaging, lifecycle) — **SUPPORTED, with packaging work**

**Distribution:** npm `@openai/codex` is a thin JS launcher (`bin/codex.js`) that resolves a platform-specific package containing the prebuilt native binary and `spawn`s it. Targets present: `@openai/codex-{darwin,linux,win32}-{x64,arm64}` (darwin x64+arm64, win32 x64+arm64, linux musl x64+arm64). Also installable via Homebrew and direct GitHub release binaries. Evidence: https://github.com/openai/codex/blob/main/codex-cli/bin/codex.js ; https://github.com/openai/codex/blob/main/codex-cli/package.json

For an Electron app this means bundling the correct native binary per (os, arch) as a packaged resource (analogous to how this repo already ships per-platform Node runtimes and `cliclick` under `resources/`). No Node/ABI rebuild needed — it is a standalone static-ish Rust executable, not a native node module.

**Lifecycle:** two viable patterns —

- **Long-lived process** (recommended): one `codex app-server` (or one TS-SDK `Codex` instance) per session/window, JSON-RPC over stdio, kept alive across turns → gets streaming events + approval callbacks + dynamic tools. Mirrors this repo's existing `StdioChannel`/`RemoteManager` stdio-RPC pattern.
- **Per-turn process:** `codex exec --json` spawned per request. Simpler, but pays process-startup cost each turn and loses interactive approvals.

**Startup cost:** native binary, so cold start is fast (tens of ms class, no VM/interpreter warmup) — cheaper than a Node/Python child. Windows + macOS both first-class.

**Verdict:** Supported. Extra build/packaging step (fetch + bundle 4 platform binaries: darwin-x64, darwin-arm64, win32-x64, win32-arm64) fits the repo's existing multi-stage `prepare:*` resource-bundling model. Prefer a long-lived app-server child.

---

## Migration implications

### Maps cleanly (green)

- **Headless driving & event streaming (§1):** `codex app-server` JSONL/JSON-RPC gives assistant deltas, reasoning, and tool begin/end as structured events — a direct analogue to the current `ServerEvent` stream. The TS SDK (`@openai/codex-sdk`) can shortcut the integration.
- **MCP (§3):** both client and server, STDIO + Streamable HTTP, standard `mcp_servers` TOML — the app's MCP layer transfers with minimal change.
- **Multi-provider / OpenAI-compatible endpoints (§6):** `model_providers` with `base_url`/`wire_api`/`env_key` covers OpenAI-compatible backends and Ollama/Azure/Bedrock; overlaps the app's provider model.
- **Sandbox delegation (§5):** `danger-full-access` / `--dangerously-bypass-approvals-and-sandbox` lets the app disable Codex's sandbox and rely on its own Lima/WSL VM — explicitly the documented pattern. Windows now covered too.
- **Sessions (§7):** resume by thread/session id (`thread/resume`, `codex exec resume`) supports multi-turn continuation.
- **Packaging (§8):** per-platform native binary bundling fits the repo's existing `resources/` prep pipeline.

### Needs a workaround / watch closely (yellow)

- **Per-tool permission gating (§4) — the critical one:** works, but ONLY via `codex app-server`/`codex mcp-server`, NOT `codex exec`. The migration must standardize on a long-lived app-server child to preserve the app's per-tool approval UX. Approval granularity is command/patch/network/MCP-tool (not an arbitrary universal pre-tool hook), and the app-server approval routing / Guardian layer is partly experimental → pin a Codex version and build against protocol `v2`.
- **Custom/host tools (§2):** possible via the experimental `dynamic_tools` app-server path (not in the stable SDK yet). Usable, but treat as unstable; otherwise reshape host tools as MCP servers (stable) — potentially more process overhead.
- **History ownership (§7):** Codex owns the thread store (`~/.codex/sessions`). If the app must remain the system of record for chat history (it persists to its own SQLite today), there is no clean "inject arbitrary transcript" API — you either let Codex own/mirror threads or replay history as prompt context.
- **Lifecycle re-architecture (§1/§8):** replacing an in-process SDK loop with an out-of-process JSON-RPC child means new process supervision, backpressure, and crash-recovery code (though this repo already has stdio-RPC plumbing to reuse).

### Blockers (red)

- **None absolute.** The only hard constraint is that **per-tool approval and custom-tool injection force the app-server (long-lived process) architecture** — the simple `codex exec` path cannot satisfy the app's permission-gating requirement. Secondary risk: several needed features (`dynamic_tools`, parts of the approval-review protocol, `experimental_use_rmcp_client`) are flagged experimental, so version-pinning and protocol-drift monitoring are required.

### Recommended integration shape

Embed a **long-lived `codex app-server` child per session** (or the TS SDK wrapping it), configured with `sandbox_mode = danger-full-access` (delegating isolation to the app's VM), `approval_policy = on-request` with the host answering `CommandExecution`/`FileChange` approval requests to drive the existing per-tool permission UI, host tools exposed via MCP (stable) or `dynamic_tools` (experimental), and providers configured through `model_providers`. Pin a specific Codex release and target protocol `v2`.
