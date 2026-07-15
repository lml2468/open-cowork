import { describe, it, expect } from 'vitest';

import { runConfigApiTest } from '@/main/config/config-test-routing';
import type { AppConfig } from '@/main/config/config-store';
import type { ApiTestInput } from '@/renderer/types';
import type { CodexOneShotClientLike } from '@/main/agent/codex-runtime/codex-one-shot';
import type {
  CodexInitializeResponse,
  CodexNotification,
  CodexNotificationListener,
  CodexThreadStartParams,
  CodexThreadStartResponse,
  CodexTurnStartParams,
  CodexTurnStartResponse,
} from '@/main/agent/codex-runtime/codex-client';

const INIT_RESPONSE: CodexInitializeResponse = {
  userAgent: 'fake/0',
  codexHome: '/tmp',
  platformFamily: 'unix',
  platformOs: 'macos',
};

const delta = (text: string): CodexNotification => ({
  method: 'item/agentMessage/delta',
  params: { threadId: 'thread-1', turnId: 'turn-1', itemId: 'i1', delta: text },
});
const completed = (): CodexNotification => ({
  method: 'turn/completed',
  params: { threadId: 'thread-1', turn: { id: 'turn-1' } },
});

class FakeOneShotClient implements CodexOneShotClientLike {
  ready = false;
  listener: CodexNotificationListener | null = null;
  threadStartCalls: CodexThreadStartParams[] = [];

  constructor(private readonly script: CodexNotification[]) {}

  isReady(): boolean {
    return this.ready;
  }
  async start(): Promise<CodexInitializeResponse> {
    this.ready = true;
    return INIT_RESPONSE;
  }
  onNotification(listener: CodexNotificationListener): () => void {
    this.listener = listener;
    return () => {
      this.listener = null;
    };
  }
  async threadStart(params: CodexThreadStartParams): Promise<CodexThreadStartResponse> {
    this.threadStartCalls.push(params);
    return { thread: { id: 'thread-1' }, model: 'gpt', modelProvider: 'openai' };
  }
  async turnStart(_params: CodexTurnStartParams): Promise<CodexTurnStartResponse> {
    setImmediate(() => {
      for (const n of this.script) this.listener?.(n);
    });
    return { turn: { id: 'turn-1' } };
  }
}

function baseConfig(): AppConfig {
  return {
    provider: 'openai',
    apiKey: 'cfg-key',
    baseUrl: '',
    model: 'gpt-4o',
    activeProfileKey: 'openai',
    profiles: {},
    activeConfigSetId: 'default',
    configSets: [],
    agentCliPath: '',
    defaultWorkdir: '',
    globalSkillsPath: '',
    enableDevLogs: false,
    theme: 'light',
    sandboxEnabled: false,
    memoryEnabled: false,
    memoryRuntime: {
      llm: { inheritFromActive: true, apiKey: '', baseUrl: '', model: '', timeoutMs: 5000 },
      storageRoot: '',
    },
    enableThinking: false,
    gpuAcceleration: 'auto',
    isConfigured: true,
  } as AppConfig;
}

function input(overrides?: Partial<ApiTestInput>): ApiTestInput {
  return { provider: 'openai', apiKey: 'probe-key', model: 'gpt-4o', ...overrides };
}

describe('runConfigApiTest', () => {
  it('routes a supported provider to a codex connectivity probe with the mapped model', async () => {
    const client = new FakeOneShotClient([delta('4 sdk_probe_ok'), completed()]);
    const result = await runConfigApiTest(input(), baseConfig(), { client });

    expect(result.ok).toBe(true);
    expect(client.threadStartCalls[0]).toMatchObject({
      approvalPolicy: 'never',
      sandbox: 'read-only',
      model: 'gpt-4o',
      modelProvider: 'coworkopenai',
    });
  });

  it('returns missing_base_url for a custom provider without a base URL', async () => {
    const client = new FakeOneShotClient([completed()]);
    const result = await runConfigApiTest(
      input({ provider: 'custom', customProtocol: 'openai', baseUrl: '' }),
      baseConfig(),
      { client }
    );
    expect(result).toEqual({ ok: false, errorType: 'missing_base_url' });
    expect(client.threadStartCalls).toHaveLength(0);
  });

  it('returns missing_key when no API key is available', async () => {
    const client = new FakeOneShotClient([completed()]);
    const result = await runConfigApiTest(
      input({ apiKey: '' }),
      { ...baseConfig(), apiKey: '' },
      { client }
    );
    expect(result.ok).toBe(false);
    expect(result.errorType).toBe('missing_key');
  });

  it('returns a clear unsupported error for a provider codex cannot speak', async () => {
    const client = new FakeOneShotClient([completed()]);
    const result = await runConfigApiTest(input({ provider: 'anthropic' }), baseConfig(), {
      client,
    });
    expect(result.ok).toBe(false);
    expect(result.errorType).toBe('unknown');
    expect(result.details).toMatch(/not supported/i);
    expect(client.threadStartCalls).toHaveLength(0);
  });
});
