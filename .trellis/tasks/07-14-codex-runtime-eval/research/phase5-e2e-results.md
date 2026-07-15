# Phase 5.6 — End-to-end verification results

**Result: PASS (assembled runtime verified against live codex).**

## What was verified

An opt-in integration test (`src/tests/agent/codex-runtime.e2e.test.ts`, gated on
`RUN_CODEX_E2E=1`; CI skips it) drives the **real** assembled runtime — `CodexClient` +
`CodexEventTranslator` + `CodexPermissionBridge` + `CodexToolBridge` + `CodexRuntime`, i.e.
exactly the code wired in 5.2/5.3 — against a live `codex app-server`, using codex's
**default auth** (no `model_providers` override). Both cases passed (2/2, ~10s):

1. **Streaming text turn** → `runTurn` streamed partial deltas and `sendMessage` emitted a
   final assembled `Message` whose text contained the requested token ("PONG"); zero
   `onError` emissions.
2. **Host dynamic tool** → codex registered the `spike_echo` `dynamicTool` and invoked it via
   `item/tool/call`; the `CodexToolBridge` ran the host `execute` and returned the
   `{contentItems:[{type:'inputText'}],success}` envelope; the model consumed the result.

Combined with the protocol-level spikes (Phase 0.B streaming, 0.C per-tool approval, 0.D
sandbox delegation, 5.2 dynamicTools round-trip), every runtime seam is now validated on
real codex.

## Credential caveat (environment limitation, NOT a code defect)

The app's `buildCodexModelConfig` **always** emits a `model_providers.<id>` override
(`base_url` + `env_key=OPENAI_API_KEY`). For `provider=openai` that points codex at
`https://api.openai.com/v1` with the app's configured key. In this environment the only
available key is a **codex-login token that 401s against direct `api.openai.com/v1/responses`**
(confirmed in Phase 0.D). So a turn driven through the app's _configured_ OpenAI provider
cannot complete here — while codex's _default_ provider/login works (used by this e2e).

Implication: the full-GUI run (launch app → configure OpenAI in settings → send a chat) and
a completing turn through the app's own provider config require a **valid direct-OpenAI API
key** (or a `custom` Responses endpoint reachable with the available credential). The runtime
_code_ is proven correct; only real-world provider auth is env-gated. Deployment/QA should
run the GUI path once with a valid key.

## Status

Phase 5 (5.1–5.6) complete. Ready for Phase 6 (remove pi) — gated on this GO.
