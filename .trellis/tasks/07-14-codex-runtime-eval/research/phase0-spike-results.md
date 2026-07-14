# Phase 0 Spike Results

Capability-verification gate for the pi→Codex migration (task `07-14-codex-runtime-eval`).
Codex under test: **`codex-cli 0.142.5`** (`/opt/homebrew/bin/codex`), `codex app-server`
(v2 protocol). Auth: API key present (`OPENAI_API_KEY`, `codex login status` = logged in).

Legend: ✅ confirmed · 🟡 empirical run pending · ⛔ blocker.

## 0.A — Protocol map (from `codex app-server generate-ts`) — DONE

Generated 87 TS binding types (`spike/proto-ts/`). The protocol is JSON-RPC v2 with three
message directions: `ClientRequest` (host→server), `ServerRequest` (server→host, incl.
approvals + dynamic-tool calls), `ServerNotification` (server→host streamed events).

### Must-keep capabilities → protocol evidence

| Capability                     | Verdict       | Protocol evidence                                                                                                                                                     |
| ------------------------------ | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Streaming assistant text       | ✅            | `ServerNotification` `item/agentMessage/delta`                                                                                                                        |
| Streaming reasoning/thinking   | ✅            | `item/reasoning/textDelta`, `item/reasoning/summaryTextDelta`                                                                                                         |
| Tool-call traces               | ✅            | `item/started`/`item/completed`, `item/commandExecution/outputDelta`, `item/mcpToolCall/progress`                                                                     |
| Turn lifecycle                 | ✅            | `turn/started`, `turn/completed`, `turn/interrupt`                                                                                                                    |
| **Per-tool permission gating** | ✅            | `ServerRequest` `item/commandExecution/requestApproval`, `item/fileChange/requestApproval`, `item/permissions/requestApproval` — host answers with a `ReviewDecision` |
| **Custom/host tools**          | ✅            | `ServerRequest` `item/tool/call` (`DynamicToolCallParams`) — server calls the host's tool, host responds. Plus `item/tool/requestUserInput`.                          |
| MCP (client)                   | ✅            | `mcpServerStatus/list`, `mcpServer/tool/call`, `mcpServer/elicitation/request`                                                                                        |
| Loop-guard steering            | ✅ (upgraded) | `turn/steer` (`TurnSteerParams`) — a first-class method; **replaces** pi's private `sendUserMessage(...,{deliverAs:'steer'})` reach-in                                |
| History injection              | ✅ (upgraded) | `thread/inject_items` (`ThreadInjectItemsParams`) + `thread/resume` — research thought there was no clean API; there is                                               |
| Compaction                     | ✅            | `thread/compact/start` + `thread/compacted` (`ContextCompactedNotification`)                                                                                          |
| Sandbox control                | ✅            | `sandbox: SandboxMode` on `thread/start`; `sandboxPolicy: SandboxPolicy` per `turn/start`; Windows via `windowsSandbox/*`                                             |
| Provider/model selection       | ✅            | `model` + `modelProvider` on `thread/start`/`turn/start`; `model/list`, `modelProvider/capabilities/read`                                                             |
| Token usage                    | ✅ (bonus)    | `thread/tokenUsage/updated` — feeds the app's context-usage bar                                                                                                       |

### Key request shapes (for the CodexClient)

- `initialize` → `{ clientInfo, capabilities }`.
- `thread/start` → `{ model?, modelProvider?, cwd?, approvalPolicy?, sandbox?, config?,
baseInstructions?, developerInstructions?, ... }` → `thread/started`.
- `turn/start` → `{ threadId, input: UserInput[], cwd?, approvalPolicy?, sandboxPolicy?,
model?, effort?, outputSchema?, ... }` → streamed `item/*` + `turn/completed`.

### Research corrections (net-positive)

Two risks flagged in `codex-integration-surface.md` are **resolved** by the v2 app-server:

1. Loop-guard steering has a first-class `turn/steer` method (no private-API reach-in).
2. History can be injected via `thread/inject_items` (not only the `<conversation_history>`
   preamble workaround).

Dynamic tools appear as a `ServerRequest` (`item/tool/call`) rather than a `thread/start`
field in this version — registration mechanism (config flag vs capability) is an empirical
check for 0.C.

### Preliminary gate verdict (protocol level): **GO-leaning.**

No blocker at the protocol level; all must-keep capabilities have concrete methods/events.
Final gate still requires the empirical runs below.

## 0.B — Spawn + handshake + streaming turn — ✅ PASS (live)

Harness `spike/harness-0b.mjs`. `codex app-server` spawned; stdio framing is
**newline-delimited JSON-RPC**. `initialize` → `thread/start` → `thread/started` →
`turn/start` (text prompt) streamed `item/agentMessage/delta` ("PONG") → `turn/completed`.
The long-lived-app-server embedding model works end to end.

## 0.C — Per-tool approval gating — ✅ PASS (live)

Harness `spike/harness-0c.mjs`. Forced a write under `approvalPolicy:"untrusted"` +
`sandbox:"read-only"`. The host received **both** `item/commandExecution/requestApproval`
(shell write) and `item/fileChange/requestApproval` (apply_patch) as server→host requests
**before** execution; declining blocked the write (`/tmp` file never created). The host is
authoritative per tool call — this cleanly replaces pi's private `setBeforeToolCall` hook.

- **Decision enums (corrected from generated bindings):** command approval →
  `accept | acceptForSession | acceptWithExecpolicyAmendment | applyNetworkPolicyAmendment | …`;
  fileChange approval → `accept | acceptForSession | decline | cancel`. **Not** the
  `ReviewDecision` `approved`/`denied` strings.
- Dynamic-tool (`dynamic_tools`) registration not exercised — it's experimental (field
  omitted from non-`--enable`d bindings). Custom tools will use the **stable MCP path**
  (protocol-confirmed) as the primary mechanism; dynamic_tools optional later.

## 0.D — Provider config + sandbox delegation — 🟡 MIXED (live)

Harness `spike/harness-0d.mjs`.

- **Sandbox delegation — ✅ PASS.** `thread/start` `sandbox:"danger-full-access"` +
  `approvalPolicy:"never"` → codex ran the write with **no** approval request and created
  the file. Confirms codex's own sandbox can be disabled so the app's Lima/WSL VM owns
  isolation (the documented pattern).
- **Provider override — 🟡 mechanism-only.** A custom `model_providers.spikeoai`
  (`base_url=https://api.openai.com/v1`, `wire_api=responses`, `env_key=OPENAI_API_KEY`)
  was accepted at startup and the turn request was routed to that base_url — but returned
  **401 Unauthorized** (the raw `OPENAI_API_KEY` in this env is not valid for direct
  api.openai.com; codex's default auth path works, per 0.B/0.C). So the provider **config
  mechanism** is validated; an end-to-end custom-provider turn was not (env key limitation,
  not a codex gap).

### ⚠ Key finding — `wire_api="chat"` is dropped in codex 0.142.5

Startup config error: `wire_api = "chat"` is no longer supported; only `wire_api =
"responses"` (ref: openai/codex discussion #7782). **This narrows D4 materially:** codex
only speaks the OpenAI **Responses** API. Endpoints that implement only Chat Completions —
**OpenRouter, Ollama's OpenAI-compat endpoint, Azure chat deployments, and most
third-party "OpenAI-compatible" gateways** — will **not** work. Only OpenAI itself and
Responses-API-compatible endpoints qualify. The app's current "any OpenAI-compatible
endpoint" support would shrink to "Responses-API endpoints only."

## Final gate verdict

**GO — Phase 0 PASSED (user-accepted 2026-07-14).** Runtime capabilities confirmed;
provider scope narrowed to OpenAI + Responses-API endpoints only, accepted by the user
(see prd D4a). Proceed to Phase 1.

- ✅ Confirmed (live or protocol): long-lived app-server embedding, streaming text +
  reasoning, per-tool permission gating (the #1 coupling risk — resolved), sandbox
  delegation, MCP tools, `turn/steer` (loop-guard), `thread/inject_items` (history),
  `thread/compacted` (compaction), token-usage events.
- ⚠ Caveat (revises D4): codex 0.142 is **Responses-API-only**. "OpenAI-compatible"
  effectively means "OpenAI + Responses-API providers", not the broad chat-completions
  ecosystem. This is a larger provider regression than D4 as written and should be
  confirmed with the user before Phase 1.
- Custom app tools (memory/config): use MCP (stable); dynamic_tools optional/experimental.

## Environment note

Prereqs satisfied locally (codex 0.142.5 + a key). The env's `OPENAI_API_KEY` is not valid
for direct api.openai.com calls, so custom-provider end-to-end turns need a valid key;
codex's default auth path works. Spike artifacts under `spike/` (throwaway).
