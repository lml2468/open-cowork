/**
 * codex-one-shot-config — the shared, pure mapping from the app config fields to the
 * subset of codex model params a one-shot turn needs, plus the env projection that lets
 * the app-server child read the API key via its `env_key`.
 *
 * The three one-shot call sites (title generation, config API probe, memory LLM) all
 * repeat the same two steps: (1) resolve the app config → a codex model/provider config
 * (rejecting providers codex can't speak, per D4/D4a), then (2) project the API-key env
 * var so the warm app-server can authenticate. Centralizing them here keeps a single,
 * unit-tested unsupported-provider path.
 *
 * This module is intentionally Electron-free — it builds on the pure
 * {@link buildCodexModelConfig} and only touches `process.env` — so it is trivially
 * testable without the app-server or an electron mock.
 */

import type { CodexModelConfigInput } from './codex-model-config';
import { buildCodexModelConfig } from './codex-model-config';

/** The codex model params a one-shot turn passes on `thread/start`. */
export interface CodexOneShotModel {
  model: string;
  modelProvider: string;
  config: Record<string, string>;
}

export type CodexOneShotModelResult =
  | { supported: true; model: CodexOneShotModel; env: Record<string, string> }
  | { supported: false; provider: string; reason: string };

/**
 * Resolve the app config fields to the codex one-shot model params + the env the caller
 * must project, or explain why the provider is unusable (anthropic/gemini/chat-only
 * gateways under D4a).
 */
export function resolveCodexOneShotModel(input: CodexModelConfigInput): CodexOneShotModelResult {
  const result = buildCodexModelConfig(input);
  if (!result.supported) {
    return { supported: false, provider: result.provider, reason: result.reason };
  }
  const { model, providerId, configOverrides, env } = result.config;
  return {
    supported: true,
    model: { model, modelProvider: providerId, config: configOverrides },
    env,
  };
}

/**
 * Project the resolved API-key env vars into `process.env` so the (warm) app-server child
 * can read the key via the provider's `env_key`. Keys never round-trip through config
 * files (see the config spec). Mirrors the projection `agent-runner` does per turn.
 */
let lastAppliedEnvSignature = '';

export function applyCodexModelEnv(env: Record<string, string>): void {
  lastAppliedEnvSignature = JSON.stringify(env);
  for (const [key, value] of Object.entries(env)) {
    process.env[key] = value;
  }
}

/**
 * Signature of the most recently applied one-shot model env. The shared codex client reads
 * this to decide whether its (already-spawned, env-frozen) app-server needs respawning —
 * the app-server captures process.env at spawn and can't see later credential changes.
 */
export function getLastCodexModelEnvSignature(): string {
  return lastAppliedEnvSignature;
}
