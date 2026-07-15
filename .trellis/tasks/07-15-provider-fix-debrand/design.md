# Design — provider-fix-debrand

## Part 1 — API config: "Responses-only, done right"

Root of the blocker: `config-store` defaults `customProtocol: 'anthropic'` (L263/L274/L392),
existing config sets were never migrated off pre-codex values, and the unsupported-provider
error is a dead-end. codex 0.142.5 only accepts `wire_api="responses"` (binary-confirmed),
so the only valid custom protocol is `openai`.

### Changes

1. **Default protocol → `openai`** in `config-store.ts` (default config set, DEFAULT_CONFIG,
   and the `profileKeyFromProvider` fallback param). Keep `CustomProtocolType` union BROAD
   (`'anthropic' | 'openai' | 'gemini'`) — do NOT narrow the type (5.4 lesson: narrowing
   cascades ~60 sites). We only change runtime _values_, not the union.
2. **Non-destructive load-time migration** in `config-store.ts` (config hydration path):
   for the top-level config and every entry in `configSets`, if `provider === 'custom'`
   and `customProtocol !== 'openai'`, coerce `customProtocol = 'openai'`. Preserve
   `baseUrl` / `model` / key so a Responses gateway keeps working. Idempotent (openai is the
   only valid value, so re-running is a no-op). Unsupported _top-level_ providers
   (anthropic/gemini/openrouter/ollama) are left as-is and fail closed with the improved
   error below — we do not fabricate base URLs.
3. **Actionable error** in `codex-model-config.ts` `buildCodexModelConfig` reason strings:
   explain codex needs an OpenAI-Responses endpoint and how to fix (switch to OpenAI, or
   Custom + "OpenAI (Responses)" protocol with a base URL that implements `/v1/responses`).
   Surface it verbatim where already shown (agent-runner config-error message,
   api-diagnostics). Add an i18n-friendly hint on the settings side if low-cost.
4. **Happy path** (no code change needed, but verified): `custom` + `openai` + Responses
   gateway base URL → `buildCodexModelConfig` supported → `runTurn` works. User verifies
   against their Responses-capable gateway.

## Part 2 — De-brand "Claude"

1. **i18n** (`en.json` + `zh.json`), reword 4 keys to Open Cowork / generic wording:
   `settings.enableThinkingHint`, `settings.description` (skills),
   `settings.installSkillsDesc`, `settings.pluginListTitle`.
2. **Default / fallback models** → a current OpenAI Responses model (chosen from the
   existing `openai` preset list for consistency): `config-store.ts:219,224`,
   `agent-runner.ts:1053` fallback, `agent-runner-loop-guard.ts:358` steer example,
   `api-provider-guidance.ts:53` exampleModel.
3. **Purge anthropic presets** in `api-model-presets.ts` (drop `anthropic/claude-*` entries;
   the openai preset list stays authoritative).
4. Out of scope: internal `.claude/skills` paths (Claude Code convention), example MCP
   server default model ids (`gui-operate-server`, `software-dev-server-example`) — noted,
   not user-facing.

## Compatibility / risk

- Migration is value-only + idempotent; the broad union means no type cascade.
- Changing default models is cosmetic for OpenAI users (they set their own model); the
  fallback only bites when nothing is configured (which now also fails the credential gate).
- Anthropic-preset removal can't regress real usage (those models can't run under codex).

## Rollback

Each change is isolated per file; revert the commit. Migration has no destructive writes
(only coerces an already-invalid protocol value to the single valid one).
