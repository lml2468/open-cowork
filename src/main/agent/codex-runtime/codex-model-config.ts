/**
 * codex-model-config — pure mapping from the app's config-store provider fields to
 * a codex `model_providers` config + selected model.
 *
 * Phase 0 finding (see research/phase0-spike-results.md, prd D4a): codex 0.142 dropped
 * `wire_api="chat"` and speaks **only** the OpenAI Responses API. So the only providers
 * that work are OpenAI itself and Responses-API-compatible custom endpoints. Chat-only
 * gateways (OpenRouter, Ollama OpenAI-compat, Azure chat deployments) and the native
 * Anthropic / Gemini providers are dropped (D4).
 *
 * This module is intentionally pure and Electron-free: callers pass a plain config
 * object (never the electron-store instance) so it is trivially unit-testable.
 */

/** Plain, decoupled snapshot of the app config fields this mapping consumes. */
export interface CodexModelConfigInput {
  /** App `ProviderType` string (e.g. 'openai', 'custom', 'anthropic', ...). */
  provider: string;
  model: string;
  baseUrl?: string;
  apiKey?: string;
  /** Only meaningful when `provider === 'custom'`. */
  customProtocol?: string;
}

/** A single codex `model_providers.<id>` entry (Responses-only). */
export interface CodexModelProvider {
  name: string;
  base_url: string;
  wire_api: 'responses';
  env_key: string;
}

export interface CodexModelConfig {
  /** Key under `model_providers.*` and the value passed as `modelProvider`. */
  providerId: string;
  provider: CodexModelProvider;
  /** Model id passed as `model` on `thread/start` / `turn/start`. */
  model: string;
  /**
   * Environment variables the app must set so codex can read the key via `env_key`.
   * (Keys never round-trip through config files — see the config spec.)
   */
  env: Record<string, string>;
  /**
   * Flattened codex config overrides (dotted keys → values), suitable for the
   * `thread/start` `config` map or `codex app-server -c key=value` flags.
   */
  configOverrides: Record<string, string>;
}

export type CodexModelConfigResult =
  | { supported: true; config: CodexModelConfig }
  | { supported: false; provider: string; reason: string };

const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';

/**
 * Providers that can speak the OpenAI Responses API and are therefore usable by
 * codex 0.142. Native Anthropic/Gemini and chat-completions-only gateways are excluded.
 */
export function isResponsesCompatibleProvider(provider: string, customProtocol?: string): boolean {
  if (provider === 'openai') return true;
  if (provider === 'custom') return customProtocol === 'openai';
  return false;
}

function sanitizeProviderId(provider: string): string {
  const cleaned = provider.toLowerCase().replace(/[^a-z0-9]/g, '');
  return cleaned.length > 0 ? `cowork${cleaned}` : 'coworkprovider';
}

function envKeyFor(provider: string, providerId: string): string {
  if (provider === 'openai') return 'OPENAI_API_KEY';
  return `${providerId.toUpperCase()}_API_KEY`;
}

function resolveBaseUrl(input: CodexModelConfigInput): string | null {
  const trimmed = input.baseUrl?.trim();
  if (input.provider === 'openai') {
    return trimmed && trimmed.length > 0 ? trimmed : DEFAULT_OPENAI_BASE_URL;
  }
  // custom: a base URL is mandatory (there is no default endpoint).
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

/**
 * Map the app config fields to a codex model/provider configuration, or explain why
 * the provider is not usable under the Responses-only constraint.
 */
export function buildCodexModelConfig(input: CodexModelConfigInput): CodexModelConfigResult {
  const provider = input.provider;

  if (!isResponsesCompatibleProvider(provider, input.customProtocol)) {
    // codex 0.142 accepts only wire_api="responses"; chat-completions and native
    // Anthropic/Gemini providers cannot run. Point the user at the concrete fix.
    const fix =
      ' Fix: in Settings, choose provider "OpenAI", or "Custom" with the "OpenAI (Responses)" protocol and a base URL that implements the OpenAI Responses API (/v1/responses).';
    const reason =
      provider === 'anthropic' || provider === 'gemini'
        ? `Provider "${provider}" is not supported: codex speaks only the OpenAI Responses API.${fix}`
        : provider === 'custom'
          ? `Custom provider protocol "${input.customProtocol ?? 'unknown'}" is not supported: codex requires an OpenAI Responses-compatible endpoint.${fix}`
          : `Provider "${provider}" is not supported: it does not expose an OpenAI Responses API (codex 0.142 dropped wire_api="chat").${fix}`;
    return { supported: false, provider, reason };
  }

  const model = input.model.trim();
  if (model.length === 0) {
    return { supported: false, provider, reason: 'No model is configured.' };
  }

  const baseUrl = resolveBaseUrl(input);
  if (baseUrl === null) {
    return {
      supported: false,
      provider,
      reason: 'A base URL is required for a custom OpenAI Responses-compatible endpoint.',
    };
  }

  const providerId = sanitizeProviderId(provider);
  const envKey = envKeyFor(provider, providerId);
  const codexProvider: CodexModelProvider = {
    name: providerId,
    base_url: baseUrl,
    wire_api: 'responses',
    env_key: envKey,
  };

  const configOverrides: Record<string, string> = {
    [`model_providers.${providerId}.name`]: codexProvider.name,
    [`model_providers.${providerId}.base_url`]: codexProvider.base_url,
    [`model_providers.${providerId}.wire_api`]: codexProvider.wire_api,
    [`model_providers.${providerId}.env_key`]: codexProvider.env_key,
  };

  const env: Record<string, string> = {};
  const apiKey = input.apiKey?.trim();
  if (apiKey && apiKey.length > 0) {
    env[envKey] = apiKey;
  }

  return {
    supported: true,
    config: {
      providerId,
      provider: codexProvider,
      model,
      env,
      configOverrides,
    },
  };
}
