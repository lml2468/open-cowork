# Config & Providers

> All app configuration and provider/model routing. The store is
> **fully encrypted**; API keys live only there. The codex runtime's authoritative
> model gate is a pure module, `codex-model-config.ts`.

## The store — `src/main/config/config-store.ts`

- Types: `AppConfig`, `ApiConfigSet`, `ProviderProfile`. Singleton export
  `configStore` (a `ConfigStore` instance).
- Backed by an encrypted electron-store built via
  `createEncryptedStoreWithKeyRotation` (`src/main/utils/store-encryption.ts`),
  which derives a stable key with **scrypt** and migrates legacy-key stores. The
  **whole store file is encrypted** — API keys/tokens exist only here.
- `hasUsableCredentialsForActiveSet(config?)` (~L1481) is the **credential
  gate** every agent entry point checks before doing work (e.g.
  `handleClientEvent` blocks `session.start` and emits a
  `CONFIG_REQUIRED_ACTIVE_SET` error when it returns false).
- `applyToEnv()` (~L1516) projects the active profile into `process.env`: it
  **deletes all provider env vars first**, then routes openai/gemini/anthropic
  variants. This is the broader/legacy projection — for the codex runtime the
  authoritative gate is `buildCodexModelConfig` (below), not `applyToEnv`.
- `get(key)` fast-path: keys in `DIRECT_READ_KEYS` (~L159) are read directly with
  a per-key default guard.

## Plaintext round-trip

- `EXPORTABLE_FIELDS` (~L181) is the **non-sensitive subset** that round-trips to
  a plaintext `config.public.json` — `defaultWorkdir`, `theme`, `provider`,
  `model`, `contextWindow`, `maxTokens`, etc. **No secrets.**
- `FIELD_VALIDATORS` (~L199) validates **every** imported field. A field with no
  validator is silently skipped on import — so a new round-trip field without a
  validator will never import.
- `config-file-watcher.ts`: bidirectional sync. It watches the **parent
  directory** (so an atomic write-then-rename by an editor is still seen),
  debounces `500ms` (`DEBOUNCE_MS`), and suppresses its own writes via
  `markOwnExport()` / `isOwnExport()` echo detection.

## Pure model config — `codex-runtime/codex-model-config.ts`

`buildCodexModelConfig(input)` is **pure and Electron-free**; it must not import
the store. It returns a discriminated result:
`{ supported: true; config } | { supported: false; provider; reason }`.

- `isResponsesCompatibleProvider(provider, customProtocol)` accepts **only**
  `openai`, or `custom` with `customProtocol === 'openai'`. Everything else is
  unsupported (`reason` explains that codex 0.142 dropped `wire_api="chat"`).
- `wire_api` is hard-locked to `'responses'`.
- `providerId = sanitizeProviderId(...)` → `cowork<provider>` (e.g.
  `coworkopenai`). It builds dotted `model_providers.<id>.{name,base_url,wire_api,env_key}`
  `configOverrides`.
- The API key is projected via **env only** (`env[envKey] = apiKey`) — keys are
  **never** written into `configOverrides` / codex config files.

## Patterns

**Add a plaintext-roundtrip config field:**

1. Add to `AppConfig` + `defaultConfig`.
2. Add to `EXPORTABLE_FIELDS`.
3. Add a matching entry to `FIELD_VALIDATORS` (else it won't import).
4. If it needs a fast read, add to `DIRECT_READ_KEYS` and the `get()` guard.

**Add a provider:** it must speak the **OpenAI Responses** API. Extend
`isResponsesCompatibleProvider`, `resolveBaseUrl`, and `envKeyFor` in
`codex-model-config.ts`.

## Anti-patterns

- Adding a secret (key/token) to `EXPORTABLE_FIELDS`.
- Adding a round-trip field without a `FIELD_VALIDATORS` entry.
- Using `wire_api: 'chat'` — dropped in codex 0.142.
- Writing API keys into `configOverrides` (they go via env only).
- Importing `config-store` into the pure `codex-model-config.ts`.
