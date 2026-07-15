import type { ApiTestInput, ApiTestResult } from '../../renderer/types';
import type { AppConfig } from './config-store';
import { testCodexConnectivity } from '../agent/codex-runtime/codex-one-shot';
import type { CodexOneShotDeps } from '../agent/codex-runtime/codex-one-shot';
import {
  applyCodexModelEnv,
  resolveCodexOneShotModel,
} from '../agent/codex-runtime/codex-one-shot-config';
import { getSharedCodexClient } from '../agent/codex-runtime/codex-shared-client';

/**
 * Probe API connectivity for the config dialog by driving a one-shot codex turn.
 *
 * Under D4/D4a codex speaks only the OpenAI Responses API, so providers it can't reach
 * (anthropic/gemini and chat-completions-only gateways) return a clear "unsupported"
 * error rather than silently passing. `deps` is injectable so unit tests can drive it
 * against a fake codex client with no real app-server.
 */
export async function runConfigApiTest(
  payload: ApiTestInput,
  config: AppConfig,
  deps?: CodexOneShotDeps
): Promise<ApiTestResult> {
  const provider = payload.provider;
  const model = (payload.model ?? config.model)?.trim();
  const baseUrl = payload.baseUrl ?? config.baseUrl;
  const apiKey = payload.apiKey ?? config.apiKey;
  const customProtocol = payload.customProtocol ?? config.customProtocol;

  // Preserve the specific error types the config UI renders for common misconfigurations.
  if (provider === 'custom' && !baseUrl?.trim()) {
    return { ok: false, errorType: 'missing_base_url' };
  }
  if (!model) {
    return { ok: false, errorType: 'unknown', details: 'missing_model' };
  }
  if (!apiKey?.trim()) {
    return { ok: false, errorType: 'missing_key', details: 'API key is required.' };
  }

  const resolved = resolveCodexOneShotModel({
    provider,
    model,
    baseUrl,
    apiKey,
    customProtocol,
  });
  if (!resolved.supported) {
    return { ok: false, errorType: 'unknown', details: resolved.reason };
  }

  applyCodexModelEnv(resolved.env);
  const resolvedDeps = deps ?? { client: getSharedCodexClient() };
  return testCodexConnectivity(
    {
      model: resolved.model.model,
      modelProvider: resolved.model.modelProvider,
      config: resolved.model.config,
    },
    resolvedDeps
  );
}
