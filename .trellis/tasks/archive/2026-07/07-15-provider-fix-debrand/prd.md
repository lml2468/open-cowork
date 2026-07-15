# PRD — Fix OpenAI-compatible provider support & de-brand Claude UI

## Goal

Make the app usable for acceptance testing again (API config currently fails hard) and
remove leftover "Claude"-branded strings/config that leaked through the codex migration.

## Background / evidence

Two distinct problems reported after the pi→codex migration:

### Issue A — API config fails, cannot test (BLOCKER)

User configures a **3rd-party OpenAI-compatible** provider and gets:

> Configuration error: Custom provider protocol "anthropic" is not supported: only an
> OpenAI Responses-compatible endpoint works.

Root causes (confirmed):

1. **codex 0.142.5 hard-drops chat-completions.** Binary string (verified via `strings` +
   `codex doctor` config-load test): `` `wire_api = "chat"` is no longer supported. How to
fix: set `wire_api = "responses"`.`` Only `wire_api="responses"` loads; `chat`,
   `chat_completions`, etc. are all rejected. So chat-completions-only endpoints (most
   3rd-party gateways, DeepSeek, local runtimes) **cannot** work with this codex build.
2. **Migration dropped Anthropic + custom-non-openai protocols.**
   `isResponsesCompatibleProvider` (`codex-model-config.ts`) returns true only for
   `openai` and `custom`+`customProtocol==='openai'`.
3. **Stale persisted config not migrated.** The user's config set still has
   `customProtocol: 'anthropic'` from the pi era. The 5.4 picker narrowing changed the UI
   but never migrated existing config sets → old value persists → hard error.
4. **Anthropic model presets still shipped** (`api-model-presets.ts:38-39`
   `anthropic/claude-opus-4-6`, `anthropic/claude-sonnet-4-6`) — unusable under codex.

Net: as migrated, the app only works with **true OpenAI-Responses endpoints** (effectively
OpenAI direct, or a gateway that implements `/v1/responses`). The user's actual endpoint
(Anthropic-protocol) cannot work with codex 0.142.5. This is the accepted D4 cut-over
biting in practice.

### Issue B — "Claude" branding leaks into the UI (polish)

User-facing strings still say Claude:

- i18n (`en.json`/`zh.json`), 4 keys each: `settings.enableThinkingHint`,
  `settings.description` (skills), `settings.installSkillsDesc`,
  `settings.pluginListTitle` ("Browse Claude Plugin Marketplace").
- Stale default/fallback models referencing anthropic/claude:
  `config-store.ts:219,224`, `agent-runner.ts:1053` (fallback
  `'anthropic/claude-sonnet-4-6'`), `agent-runner-loop-guard.ts:358` (steer example),
  `api-provider-guidance.ts:53`, `api-model-presets.ts:38-39`.
- (System-prompt persona is already correct: "You are an Open Cowork assistant".)
- Lower priority: example MCP servers (`gui-operate-server`, `software-dev-server-example`)
  default to claude model ids; internal `.claude/skills` paths are Claude Code config dirs
  (not user-facing) and stay.

## Open decision (blocks the plan)

The API blocker is a product-direction call, not a pure code fix — see the direction
question. Everything else (config migration, error UX, de-branding, purging anthropic
presets) is in scope regardless.

## Acceptance criteria (draft, pending direction)

- A supported provider can be configured and a chat turn completes end-to-end (verifiable).
- Stale `customProtocol`/model config is migrated or repaired so existing users aren't hard-blocked.
- Unsupported-provider errors are actionable (explain the Responses requirement + how to fix).
- No user-facing "Claude" strings remain in settings/welcome; no anthropic/claude default models.

## Out of scope (unless direction says otherwise)

- Re-implementing a non-codex agent loop.
- Internal `.claude/` config-dir paths (Claude Code convention, not branding).
