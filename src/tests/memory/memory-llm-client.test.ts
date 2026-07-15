import { describe, expect, it, vi } from 'vitest';

import type { AppConfig } from '../../main/config/config-store';
import type {
  CodexOneShotOptions,
  CodexOneShotResult,
} from '../../main/agent/codex-runtime/codex-one-shot';
import { MemoryLLMClient } from '../../main/memory/memory-llm-client';

function makeConfig(overrides?: Partial<AppConfig>): AppConfig {
  return {
    provider: 'custom',
    customProtocol: 'openai',
    apiKey: 'test-key',
    baseUrl: 'https://example.test/v1',
    model: 'test-model',
    activeProfileKey: 'custom:openai',
    profiles: {},
    activeConfigSetId: 'default',
    configSets: [],
    agentCliPath: '',
    defaultWorkdir: '',
    globalSkillsPath: '',
    enableDevLogs: false,
    theme: 'light',
    sandboxEnabled: false,
    memoryEnabled: true,
    memoryRuntime: {
      llm: {
        inheritFromActive: true,
        apiKey: '',
        baseUrl: '',
        model: '',
        timeoutMs: 5000,
      },
      storageRoot: '',
    },
    enableThinking: false,
    gpuAcceleration: 'auto',
    isConfigured: true,
    ...overrides,
  };
}

function makeResult(text: string): CodexOneShotResult {
  return { text, hasThinking: false, durationMs: 12 };
}

describe('MemoryLLMClient', () => {
  it('maps the config into codex one-shot options for a supported provider', async () => {
    let captured: CodexOneShotOptions | undefined;
    const runOneShot = vi.fn(async (options: CodexOneShotOptions) => {
      captured = options;
      return makeResult('memory answer');
    });

    const client = new MemoryLLMClient(() => makeConfig(), runOneShot);
    const response = await client.complete({
      systemPrompt: 'memory system',
      userPrompt: 'memory user',
      // temperature/maxTokens are accepted for interface parity but dropped under codex.
      temperature: 0.7,
      maxTokens: 1234,
    });

    expect(response.text).toBe('memory answer');
    expect(captured).toBeDefined();
    expect(captured?.prompt).toBe('memory user');
    expect(captured?.systemPrompt).toBe('memory system');
    expect(captured?.model).toBe('test-model');
    // custom+openai → sanitized provider id `coworkcustom`.
    expect(captured?.modelProvider).toBe('coworkcustom');
    expect(captured?.timeoutMs).toBe(5000);
    expect(captured?.config).toMatchObject({
      'model_providers.coworkcustom.base_url': 'https://example.test/v1',
      'model_providers.coworkcustom.wire_api': 'responses',
    });
    // sampling params are not forwarded (codex one-shot turns don't expose them).
    expect(captured).not.toHaveProperty('temperature');
    expect(captured).not.toHaveProperty('maxTokens');
  });

  it('throws a clear error when the provider is not codex-supported', async () => {
    const runOneShot = vi.fn();
    const client = new MemoryLLMClient(() => makeConfig({ provider: 'anthropic' }), runOneShot);

    await expect(client.complete({ systemPrompt: 'sys', userPrompt: 'user' })).rejects.toThrow(
      /not supported/i
    );
    expect(runOneShot).not.toHaveBeenCalled();
  });
});
