import type { AppConfig, CustomProtocolType, ProviderType } from '../config/config-store';
import { configStore } from '../config/config-store';
import type {
  CodexOneShotOptions,
  CodexOneShotResult,
} from '../agent/codex-runtime/codex-one-shot';
import { runCodexOneShot } from '../agent/codex-runtime/codex-one-shot';
import {
  applyCodexModelEnv,
  resolveCodexOneShotModel,
} from '../agent/codex-runtime/codex-one-shot-config';
import { getSharedCodexClient } from '../agent/codex-runtime/codex-shared-client';

export interface MemoryCompletionRequest {
  systemPrompt: string;
  userPrompt: string;
  /** NOTE: dropped under codex — one-shot turns don't expose a sampling temperature. */
  temperature?: number;
  /** NOTE: dropped under codex — one-shot turns don't expose a max-tokens cap. */
  maxTokens?: number;
}

export interface MemoryCompletionResponse {
  text: string;
}

export interface MemoryLLMClientLike {
  complete(request: MemoryCompletionRequest): Promise<MemoryCompletionResponse>;
}

interface MemoryModelConfig {
  inheritFromActive?: boolean;
  provider?: ProviderType;
  customProtocol?: CustomProtocolType;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
}

interface ResolvedMemoryModelConfig {
  provider: ProviderType;
  customProtocol?: CustomProtocolType;
  apiKey: string;
  baseUrl?: string;
  model: string;
  timeoutMs: number;
}

function normalizeModelConfig(
  appConfig: AppConfig,
  input: MemoryModelConfig | undefined,
  fallbackModel: string
): ResolvedMemoryModelConfig {
  const inherit = input?.inheritFromActive !== false;
  const activeProvider = appConfig.provider;
  const activeProtocol = appConfig.customProtocol;
  const activeBaseUrl = appConfig.baseUrl;
  const activeApiKey = appConfig.apiKey;
  const activeModel = appConfig.model;

  const provider = inherit ? activeProvider : input?.provider || activeProvider;
  const customProtocol = inherit ? activeProtocol : input?.customProtocol || activeProtocol;
  const apiKey = inherit ? activeApiKey : input?.apiKey || '';
  const baseUrl = inherit ? activeBaseUrl : input?.baseUrl || activeBaseUrl;
  const model = (input?.model || (inherit ? activeModel : '') || fallbackModel).trim();
  const timeoutMs = Math.max(5_000, input?.timeoutMs || 180_000);

  return {
    provider,
    customProtocol,
    apiKey,
    baseUrl,
    model,
    timeoutMs,
  };
}

/** Injectable one-shot runner (defaults to the shared codex client) for testing. */
export type MemoryOneShotRunner = (options: CodexOneShotOptions) => Promise<CodexOneShotResult>;

const defaultOneShotRunner: MemoryOneShotRunner = (options) =>
  runCodexOneShot(options, { client: getSharedCodexClient() });

export class MemoryLLMClient implements MemoryLLMClientLike {
  constructor(
    private readonly getConfig: () => AppConfig = () => configStore.getAll(),
    private readonly runOneShot: MemoryOneShotRunner = defaultOneShotRunner
  ) {}

  async complete(request: MemoryCompletionRequest): Promise<MemoryCompletionResponse> {
    const appConfig = this.getConfig();
    const llmConfig = normalizeModelConfig(
      appConfig,
      appConfig.memoryRuntime?.llm,
      appConfig.model
    );

    const resolved = resolveCodexOneShotModel({
      provider: llmConfig.provider,
      model: llmConfig.model,
      baseUrl: llmConfig.baseUrl,
      apiKey: llmConfig.apiKey,
      customProtocol: llmConfig.customProtocol,
    });
    if (!resolved.supported) {
      // Under D4/D4a a provider codex can't speak is a hard error (no pi fallback).
      throw new Error(`Memory LLM provider not supported: ${resolved.reason}`);
    }
    applyCodexModelEnv(resolved.env);

    // temperature/maxTokens are dropped (codex one-shot turns don't expose sampling
    // params); the former AbortSignal-based cancellation is replaced by the codex-enforced
    // `timeoutMs` (codex turns take no external signal).
    const result = await this.runOneShot({
      prompt: request.userPrompt,
      systemPrompt: request.systemPrompt,
      model: resolved.model.model,
      modelProvider: resolved.model.modelProvider,
      config: resolved.model.config,
      timeoutMs: llmConfig.timeoutMs,
    });
    return { text: result.text };
  }
}
