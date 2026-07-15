import { Type } from '@sinclair/typebox';
import { app } from 'electron';
import type {
  AgentRuntimeExtension,
  BeforeSessionRunResult,
  BeforeSessionRunContext,
  AgentRuntimeCustomTool,
} from '../extensions/agent-runtime-extension';
import { MCPManager } from '../mcp/mcp-manager';
import { configStore } from '../config/config-store';
import { log, logError, logWarn } from '../utils/logger';
import type { ServerEvent } from '../../renderer/types';
import { v4 as uuidv4 } from 'uuid';
import { CodexClient, type CodexLogger } from './codex-runtime/codex-client';
import { runCodexSubagent, type CodexSubagentProgress } from './codex-runtime/codex-subagent';
import { buildCodexModelConfig } from './codex-runtime/codex-model-config';
import { CodexPermissionBridge } from './codex-runtime/codex-permission-bridge';

const MAX_TIMEOUT_MS = 300_000;
const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_CONCURRENT_SUBAGENTS = 3;
const MAX_TASK_LENGTH = 10_000;

interface SubagentParams {
  task: string;
  result_format?: string;
  allowed_tools?: string[];
  timeout_seconds?: number;
}

function safeSendEvent(sendEvent: SendEvent, event: ServerEvent): void {
  try {
    sendEvent(event);
  } catch {
    // Renderer may be disconnected — swallow to avoid disrupting tool execution
  }
}

type SubagentProgressPayload = Extract<ServerEvent, { type: 'subagent.progress' }>['payload'];

function buildProgressEvent(
  parentSessionId: string,
  subagentId: string,
  payload: Omit<SubagentProgressPayload, 'parentSessionId' | 'subagentId'>
): ServerEvent {
  return {
    type: 'subagent.progress',
    payload: { parentSessionId, subagentId, ...payload },
  };
}

type SendEvent = (event: ServerEvent) => void;
type PermissionHandler = (toolName: string, toolInput: unknown) => Promise<'allow' | 'deny'>;

function createSpawnSubagentTool(
  getClient: () => CodexClient,
  sendEvent: SendEvent,
  parentSessionId: string,
  getParentAbortSignal: () => AbortSignal | null,
  concurrencyState: { active: number }
): AgentRuntimeCustomTool {
  return {
    name: 'spawn_subagent',
    description:
      'Spawn a child agent to complete a focused sub-task in its own context. ' +
      'The child inherits your tools and config but not your conversation history. ' +
      'It cannot spawn further subagents. Use for tasks that benefit from isolated context.',
    parameters: Type.Object({
      task: Type.String({
        description:
          'A clear, self-contained description of what the child agent should accomplish. ' +
          'Include all necessary context since the child has no access to your conversation.',
      }),
      result_format: Type.Optional(
        Type.String({
          description:
            'Description of the desired output format. If omitted, the child returns free-form text.',
        })
      ),
      allowed_tools: Type.Optional(
        Type.Array(Type.String(), {
          description:
            'Restrict MCP tools available to the child. Standard coding tools (read, write, edit, bash) are always available. If omitted, the child inherits all parent MCP tools.',
        })
      ),
      timeout_seconds: Type.Optional(
        Type.Number({
          description: 'Maximum execution time in seconds. Default: 120, max: 300.',
          minimum: 10,
          maximum: 300,
        })
      ),
    }),
    async execute(params: unknown) {
      const { task, result_format, timeout_seconds } = (params || {}) as SubagentParams;

      if (!task || typeof task !== 'string' || task.trim().length === 0) {
        return {
          content: [{ type: 'text' as const, text: 'Error: task parameter is required.' }],
          details: undefined as unknown,
        };
      }

      if (task.length > MAX_TASK_LENGTH) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error: task exceeds maximum length (${MAX_TASK_LENGTH} chars). Shorten the task description.`,
            },
          ],
          details: undefined as unknown,
        };
      }

      // Concurrency guard
      if (concurrencyState.active >= MAX_CONCURRENT_SUBAGENTS) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error: maximum concurrent subagents (${MAX_CONCURRENT_SUBAGENTS}) reached. Wait for a running subagent to complete.`,
            },
          ],
          details: undefined as unknown,
        };
      }

      const timeoutMs = Math.min(
        (timeout_seconds || DEFAULT_TIMEOUT_MS / 1000) * 1000,
        MAX_TIMEOUT_MS
      );

      const subagentId = uuidv4();
      log(`[SubagentExtension] Spawning child ${subagentId} for task: "${task.slice(0, 100)}..."`);

      concurrencyState.active++;

      // Emit `started` before model resolution so the renderer sees the spawn even when
      // config is invalid. `runCodexSubagent` also emits its own `started`; we suppress the
      // duplicate in the progress forwarder below.
      safeSendEvent(
        sendEvent,
        buildProgressEvent(parentSessionId, subagentId, {
          event: 'started',
          task: task.slice(0, 200),
        })
      );

      try {
        // Resolve the codex model/provider from the app config. Under the Responses-only
        // constraint an unsupported provider is a hard, user-facing error (no fallback).
        const config = configStore.getAll();
        const modelConfigResult = buildCodexModelConfig({
          provider: config.provider || 'openai',
          model: config.model?.trim() || '',
          baseUrl: config.baseUrl,
          apiKey: config.apiKey,
          customProtocol: config.customProtocol,
        });
        if (!modelConfigResult.supported) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Error: could not resolve model for subagent (${modelConfigResult.reason}). Check provider/model config.`,
              },
            ],
            details: undefined as unknown,
          };
        }
        const modelConfig = modelConfigResult.config;

        // Project the API key into the environment so the (warm) app-server child can read
        // it via the provider's env_key. Keys never round-trip through config files.
        for (const [key, value] of Object.entries(modelConfig.env)) {
          process.env[key] = value;
        }

        const cwd = config.defaultWorkdir || process.cwd();

        const result = await runCodexSubagent(
          {
            task,
            resultFormat: result_format,
            cwd,
            model: modelConfig.model,
            modelProvider: modelConfig.providerId,
            config: modelConfig.configOverrides,
            timeoutMs,
            // Child tool calls gate through the dedicated client's approval handler
            // (see getSubagentClient). Full access matches the app's VM-delegated sandbox.
            approvalPolicy: 'on-request',
            sandbox: 'danger-full-access',
            parentSignal: getParentAbortSignal(),
            onProgress: (progress: CodexSubagentProgress) => {
              // `started` was already emitted above; drop the runner's duplicate.
              if (progress.event === 'started') return;
              safeSendEvent(sendEvent, buildProgressEvent(parentSessionId, subagentId, progress));
            },
          },
          {
            client: getClient(),
            subagentId,
            logger: SUBAGENT_LOGGER,
          }
        );

        if (result.status === 'timeout') {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Subagent timed out after ${Math.round(result.durationMs / 1000)}s. Consider simplifying the task or increasing timeout_seconds.`,
              },
            ],
            details: undefined as unknown,
          };
        }
        if (result.status === 'cancelled') {
          return {
            content: [
              {
                type: 'text' as const,
                text: 'Subagent cancelled: parent session was stopped.',
              },
            ],
            details: undefined as unknown,
          };
        }
        if (result.status === 'error') {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Subagent error: ${result.error ?? 'unknown error'}`,
              },
            ],
            details: undefined as unknown,
          };
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: result.text || '(subagent produced no text output)',
            },
          ],
          details: undefined as unknown,
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        logError(`[SubagentExtension] Child ${subagentId} failed:`, message);
        safeSendEvent(
          sendEvent,
          buildProgressEvent(parentSessionId, subagentId, {
            event: 'failed',
            error: message.slice(0, 200),
            durationMs: 0,
          })
        );
        return {
          content: [{ type: 'text' as const, text: `Subagent error: ${message}` }],
          details: undefined as unknown,
        };
      } finally {
        concurrencyState.active--;
      }
    },
  };
}

const SUBAGENT_LOGGER: CodexLogger = {
  log: (...args: unknown[]) => log('[codex subagent]', ...args),
  warn: (...args: unknown[]) => logWarn('[codex subagent]', ...args),
  error: (...args: unknown[]) => logError('[codex subagent]', ...args),
};

export class SubagentExtension implements AgentRuntimeExtension {
  readonly name = 'subagent';
  private concurrencyState = { active: 0 };
  /** Lazily-constructed dedicated codex client for child threads (own approval handler). */
  private client: CodexClient | null = null;

  constructor(
    // Kept for wiring compatibility with the GUI/headless call sites. Under codex the child
    // thread uses codex-native tools, so the parent MCP manager is no longer injected into
    // the child; this getter is retained for future MCP-server passthrough.
    private readonly getMcpManager: () => MCPManager | null,
    private readonly sendEvent: SendEvent,
    private readonly requestPermission: PermissionHandler | null = null,
    private readonly getParentAbortSignal: () => AbortSignal | null = () => null
  ) {
    void this.getMcpManager;
  }

  /**
   * The dedicated codex client for spawned children. It installs its own approval server
   * request handler routing every child command/file-change approval through the parent's
   * `requestPermission` policy — preserving per-tool gating without touching the parent
   * runtime's client or the shared one-shot client. Spawned lazily on first subagent run.
   */
  private getSubagentClient(): CodexClient {
    if (this.client) return this.client;

    const client = new CodexClient({
      clientInfo: { name: 'open-cowork', version: app.getVersion() },
      // Match the runner's handshake; harmless when no dynamic tools are registered.
      capabilities: { experimentalApi: true, requestAttestation: false },
      logger: SUBAGENT_LOGGER,
    });

    const requestPermission = this.requestPermission;
    const bridge = new CodexPermissionBridge({
      // With a gating callback wired, defer every approval to it; otherwise allow (mirrors
      // the pi behavior where a missing permission handler left child tools ungated).
      decide: () => (requestPermission ? 'ask' : 'allow'),
      prompt: requestPermission
        ? async (ctx) => {
            const decision = await requestPermission(ctx.toolName, ctx.input);
            return decision === 'allow' ? 'allow' : 'deny';
          }
        : undefined,
      logger: SUBAGENT_LOGGER,
    });

    client.setServerRequestHandler(async (req) => {
      if (bridge.canHandle(req.method)) {
        // sessionId is only used for the prompt display context; the subagent permission
        // policy is session-agnostic, so a stable label is sufficient.
        return bridge.handle(req, 'subagent');
      }
      SUBAGENT_LOGGER.warn(`[SubagentExtension] Unhandled child server request: ${req.method}`);
      return {};
    });

    this.client = client;
    return client;
  }

  async beforeSessionRun(context: BeforeSessionRunContext): Promise<BeforeSessionRunResult> {
    return {
      customTools: [
        createSpawnSubagentTool(
          () => this.getSubagentClient(),
          this.sendEvent,
          context.session.id,
          this.getParentAbortSignal,
          this.concurrencyState
        ),
      ],
    };
  }

  /** Tear down the dedicated child app-server (called on app shutdown). */
  dispose(): void {
    if (this.client) {
      this.client.dispose();
      this.client = null;
    }
  }
}
