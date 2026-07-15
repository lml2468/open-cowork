import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: () => '/tmp',
    getVersion: () => '0.0.0',
  },
}));

vi.mock('electron-store', () => {
  class MockStore<T extends Record<string, unknown>> {
    public store: Record<string, unknown>;
    public path = '/tmp/mock-session-manager-title-config-store.json';

    constructor(options: { defaults?: Record<string, unknown> }) {
      this.store = {
        ...(options?.defaults || {}),
      };
    }

    get<K extends keyof T>(key: K): T[K] {
      return this.store[key as string] as T[K];
    }

    set(key: string | Record<string, unknown>, value?: unknown): void {
      if (typeof key === 'string') {
        this.store[key] = value;
        return;
      }
      this.store = {
        ...this.store,
        ...key,
      };
    }

    clear(): void {
      this.store = {};
    }
  }

  return {
    default: MockStore,
  };
});

vi.mock('../src/main/agent/agent-runner', () => ({
  CoworkAgentRunner: class {
    run = vi.fn();
    cancel = vi.fn();
    handleQuestionResponse = vi.fn();
  },
}));

vi.mock('../src/main/mcp/mcp-config-store', () => ({
  mcpConfigStore: {
    getEnabledServers: () => [],
  },
}));

const generateTitleWithCodexMock = vi.hoisted(() => vi.fn(async () => 'Unified Title'));
const getSharedCodexClientMock = vi.hoisted(() => vi.fn(() => ({}) as never));

vi.mock('../src/main/agent/codex-runtime/codex-one-shot', () => ({
  generateTitleWithCodex: generateTitleWithCodexMock,
}));

vi.mock('../src/main/agent/codex-runtime/codex-shared-client', () => ({
  getSharedCodexClient: getSharedCodexClientMock,
}));

import { configStore } from '../src/main/config/config-store';
import { SessionManager } from '../src/main/session/session-manager';

describe('SessionManager codex title generation', () => {
  const previous = {
    provider: configStore.get('provider'),
    customProtocol: configStore.get('customProtocol'),
    apiKey: configStore.get('apiKey'),
    baseUrl: configStore.get('baseUrl'),
    model: configStore.get('model'),
  };

  beforeEach(() => {
    configStore.set('provider', 'openai');
    configStore.set('customProtocol', 'openai');
    configStore.set('apiKey', 'sk-test');
    configStore.set('model', 'gpt-4.1');
    generateTitleWithCodexMock.mockClear();
    generateTitleWithCodexMock.mockResolvedValue('Unified Title');
  });

  afterEach(() => {
    configStore.set('provider', previous.provider);
    configStore.set('customProtocol', previous.customProtocol);
    configStore.set('apiKey', previous.apiKey);
    configStore.set('baseUrl', previous.baseUrl);
    configStore.set('model', previous.model);
    vi.restoreAllMocks();
  });

  it('routes title generation through the codex one-shot for a supported provider', async () => {
    const proto = SessionManager.prototype as unknown as {
      generateTitleWithConfig(titlePrompt: string): Promise<string | null>;
    };

    const title = await proto.generateTitleWithConfig.call({}, 'Please generate title');

    expect(title).toBe('Unified Title');
    expect(generateTitleWithCodexMock).toHaveBeenCalledTimes(1);
    expect(generateTitleWithCodexMock).toHaveBeenCalledWith(
      expect.objectContaining({
        titlePrompt: 'Please generate title',
        model: 'gpt-4.1',
        modelProvider: 'coworkopenai',
      }),
      expect.objectContaining({ client: expect.anything() })
    );
  });

  it('skips title generation (returns null) for a provider codex cannot speak', async () => {
    configStore.set('provider', 'gemini');
    configStore.set('customProtocol', 'gemini');
    configStore.set('apiKey', 'AIza-test');
    configStore.set('baseUrl', 'https://generativelanguage.googleapis.com');
    configStore.set('model', 'gemini/gemini-2.5-flash');

    const proto = SessionManager.prototype as unknown as {
      generateTitleWithConfig(titlePrompt: string): Promise<string | null>;
    };

    const title = await proto.generateTitleWithConfig.call({}, 'Please generate title');

    expect(title).toBeNull();
    expect(generateTitleWithCodexMock).not.toHaveBeenCalled();
  });
});
