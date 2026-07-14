import { describe, it, expect } from 'vitest';
import {
  buildCodexModelConfig,
  isResponsesCompatibleProvider,
} from '@/main/agent/codex-runtime/codex-model-config';

describe('isResponsesCompatibleProvider', () => {
  it('accepts openai and custom+openai only', () => {
    expect(isResponsesCompatibleProvider('openai')).toBe(true);
    expect(isResponsesCompatibleProvider('custom', 'openai')).toBe(true);
    expect(isResponsesCompatibleProvider('custom', 'anthropic')).toBe(false);
    expect(isResponsesCompatibleProvider('custom')).toBe(false);
    expect(isResponsesCompatibleProvider('anthropic')).toBe(false);
    expect(isResponsesCompatibleProvider('gemini')).toBe(false);
    expect(isResponsesCompatibleProvider('openrouter')).toBe(false);
    expect(isResponsesCompatibleProvider('ollama')).toBe(false);
  });
});

describe('buildCodexModelConfig', () => {
  it('maps the built-in OpenAI provider with the default base URL', () => {
    const result = buildCodexModelConfig({
      provider: 'openai',
      model: 'gpt-5.4',
      apiKey: 'sk-test',
    });
    expect(result.supported).toBe(true);
    if (!result.supported) return;
    const { config } = result;
    expect(config.model).toBe('gpt-5.4');
    expect(config.provider.wire_api).toBe('responses');
    expect(config.provider.base_url).toBe('https://api.openai.com/v1');
    expect(config.provider.env_key).toBe('OPENAI_API_KEY');
    // The api key is projected via env under the provider's env_key, never inline.
    expect(config.env).toEqual({ OPENAI_API_KEY: 'sk-test' });
    // Flattened config overrides target model_providers.<id>.*
    expect(config.configOverrides[`model_providers.${config.providerId}.wire_api`]).toBe(
      'responses'
    );
    expect(config.configOverrides[`model_providers.${config.providerId}.base_url`]).toBe(
      'https://api.openai.com/v1'
    );
  });

  it('honors an explicit OpenAI base URL override', () => {
    const result = buildCodexModelConfig({
      provider: 'openai',
      model: 'gpt-5.4',
      baseUrl: 'https://proxy.example.com/v1',
      apiKey: 'sk-test',
    });
    expect(result.supported).toBe(true);
    if (!result.supported) return;
    expect(result.config.provider.base_url).toBe('https://proxy.example.com/v1');
  });

  it('maps an OpenAI-compatible custom Responses endpoint', () => {
    const result = buildCodexModelConfig({
      provider: 'custom',
      customProtocol: 'openai',
      model: 'my-model',
      baseUrl: 'https://responses.example.com/v1',
      apiKey: 'key-123',
    });
    expect(result.supported).toBe(true);
    if (!result.supported) return;
    const { config } = result;
    expect(config.provider.base_url).toBe('https://responses.example.com/v1');
    expect(config.provider.wire_api).toBe('responses');
    expect(config.model).toBe('my-model');
    // env_key derived from the sanitized provider id and populated in env.
    expect(config.env[config.provider.env_key]).toBe('key-123');
  });

  it('rejects native Anthropic and Gemini providers (D4)', () => {
    for (const provider of ['anthropic', 'gemini']) {
      const result = buildCodexModelConfig({ provider, model: 'x' });
      expect(result.supported).toBe(false);
      if (result.supported) continue;
      expect(result.reason).toContain('Responses API');
    }
  });

  it('rejects chat-completions-only gateways (openrouter/ollama)', () => {
    for (const provider of ['openrouter', 'ollama']) {
      const result = buildCodexModelConfig({ provider, model: 'x', baseUrl: 'http://x/v1' });
      expect(result.supported).toBe(false);
    }
  });

  it('rejects a custom provider with a non-openai protocol', () => {
    const result = buildCodexModelConfig({
      provider: 'custom',
      customProtocol: 'anthropic',
      model: 'x',
      baseUrl: 'https://x/v1',
    });
    expect(result.supported).toBe(false);
    if (result.supported) return;
    expect(result.reason).toContain('not supported');
  });

  it('rejects a custom provider without a base URL', () => {
    const result = buildCodexModelConfig({
      provider: 'custom',
      customProtocol: 'openai',
      model: 'x',
    });
    expect(result.supported).toBe(false);
    if (result.supported) return;
    expect(result.reason).toContain('base URL');
  });

  it('rejects an empty model', () => {
    const result = buildCodexModelConfig({ provider: 'openai', model: '   ' });
    expect(result.supported).toBe(false);
    if (result.supported) return;
    expect(result.reason).toContain('model');
  });

  it('omits env when no api key is provided', () => {
    const result = buildCodexModelConfig({ provider: 'openai', model: 'gpt-5.4' });
    expect(result.supported).toBe(true);
    if (!result.supported) return;
    expect(result.config.env).toEqual({});
  });
});
