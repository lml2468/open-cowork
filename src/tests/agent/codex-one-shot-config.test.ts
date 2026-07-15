import { describe, it, expect, afterEach } from 'vitest';

import {
  applyCodexModelEnv,
  resolveCodexOneShotModel,
} from '@/main/agent/codex-runtime/codex-one-shot-config';

describe('resolveCodexOneShotModel', () => {
  it('maps a supported openai config to one-shot model params + env', () => {
    const result = resolveCodexOneShotModel({
      provider: 'openai',
      model: 'gpt-4o',
      apiKey: 'sk-test',
    });
    expect(result.supported).toBe(true);
    if (!result.supported) return;
    expect(result.model.model).toBe('gpt-4o');
    expect(result.model.modelProvider).toBe('coworkopenai');
    expect(result.model.config['model_providers.coworkopenai.wire_api']).toBe('responses');
    expect(result.env.OPENAI_API_KEY).toBe('sk-test');
  });

  it('reports unsupported for anthropic/gemini', () => {
    const anthropic = resolveCodexOneShotModel({ provider: 'anthropic', model: 'claude' });
    expect(anthropic.supported).toBe(false);
    if (anthropic.supported) return;
    expect(anthropic.reason).toMatch(/not supported/i);
  });
});

describe('applyCodexModelEnv', () => {
  const original = process.env.CODEX_TEST_KEY;
  afterEach(() => {
    if (original === undefined) delete process.env.CODEX_TEST_KEY;
    else process.env.CODEX_TEST_KEY = original;
  });

  it('projects env vars into process.env', () => {
    applyCodexModelEnv({ CODEX_TEST_KEY: 'projected' });
    expect(process.env.CODEX_TEST_KEY).toBe('projected');
  });
});
