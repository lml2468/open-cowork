# Implement — provider-fix-debrand

Default OpenAI Responses model to standardize on: **`gpt-5.4`** (already the `openai`
profile default in config-store).

## Ordered checklist

### A. API config (blocker)

1. `config-store.ts`: default `customProtocol` `'anthropic'` → `'openai'` (default config set
   L263, DEFAULT_CONFIG L274, `profileKeyFromProvider` fallback param L392). Union unchanged.
2. `config-store.ts`: add a value-only, idempotent load-time migration — for the top-level
   config and each `configSets[]`, if `provider==='custom' && customProtocol!=='openai'`,
   set `customProtocol='openai'`. Wire it into the existing config hydration/normalize path.
3. `codex-model-config.ts`: improve unsupported `reason` strings to be actionable (name the
   Responses requirement + the concrete fix). Keep the shape (`{supported:false,reason}`).
4. Confirm the surfaced error text (agent-runner config-error message / api-diagnostics)
   reads the improved reason; add i18n hint on settings side only if low-cost.

### B. De-brand

5. `en.json` + `zh.json`: reword `settings.enableThinkingHint`, `settings.description`,
   `settings.installSkillsDesc`, `settings.pluginListTitle` (drop "Claude").
6. Replace anthropic/claude default+fallback models → `gpt-5.4`:
   `agent-runner.ts:1053`, `agent-runner-loop-guard.ts:358`, `api-provider-guidance.ts:53`;
   update the openrouter/anthropic profile model strings in `config-store.ts:219,224` for
   cleanliness (unsupported providers, cosmetic).
7. `api-model-presets.ts`: remove `anthropic/claude-*` preset entries.

### C. Tests

8. `src/tests/config/config-store-*.test.ts` (or nearest): migration coerces custom+anthropic
   → openai on load; new-config default is openai; idempotent (openai stays openai).
9. `src/tests/.../codex-model-config.test.ts`: custom+openai supported; unsupported reason
   contains the actionable guidance; custom+anthropic still unsupported (pre-migration input).
10. Optional guard test: the 4 de-branded i18n keys contain no "Claude"/"claude".

### D. Verify

11. `npx tsc --noEmit` + `npm run lint` + `npx vitest run` all green.
12. Build main + launch GUI (Playwright electron) → open Settings, confirm custom provider
    shows only "OpenAI (Responses)" and a stale anthropic config now loads as openai.
13. **User acceptance**: with the Responses-capable gateway configured (custom + openai +
    gateway base URL + key), a chat turn completes end-to-end.

## Validation commands

- `npx tsc --noEmit`
- `npm run lint`
- `npx vitest run`

## Risky points / rollback

- Migration touches persisted config — keep it value-only + idempotent, no base-URL
  fabrication. Revert per-commit if needed.
- Do not narrow `ProviderType` / `CustomProtocolType` unions (5.4 cascade lesson).
