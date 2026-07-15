/**
 * @module main/agent/agent-runner
 *
 * AI query execution engine.
 *
 * Responsibilities:
 * - Drives AI conversations through the OpenAI Codex `app-server` backend (CodexRuntime)
 * - Resolves the codex provider/model config via codex-runtime/codex-model-config
 * - Bridges extension + MCP tools into codex host `dynamic_tools`
 * - Streams responses back as ServerEvents (stream.message, stream.partial, trace.step)
 * - Skills injection, system prompt assembly, permission handling, loop guard, sandbox sync
 *
 * Dependencies: session-manager, mcp-manager, config-store, skills-manager, codex-runtime
 */
import { Type } from '@sinclair/typebox';
import { type AgentRuntimeCustomTool } from '../extensions/agent-runtime-extension';
import type { Session, Message, TraceStep, ServerEvent, ContentBlock } from '../../renderer/types';
import { v4 as uuidv4 } from 'uuid';
import { decidePermission, rememberAlwaysAllow } from '../config/permission-rules-store';
import { PathResolver } from '../sandbox/path-resolver';
import { MCPManager } from '../mcp/mcp-manager';
import { mcpConfigStore } from '../mcp/mcp-config-store';
import { log, logWarn, logError, logCtx, logCtxError, logTiming } from '../utils/logger';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execFileSync } from 'child_process';
import { app } from 'electron';
import { setMaxListeners } from 'node:events';
import { getSandboxAdapter } from '../sandbox/sandbox-adapter';
import { pathConverter } from '../sandbox/wsl-bridge';
import { SandboxSync } from '../sandbox/sandbox-sync';
import { extractArtifactsFromText, buildArtifactTraceSteps } from '../utils/artifact-parser';
import { getDefaultShell } from '../utils/shell-resolver';
import { PluginRuntimeService } from '../skills/plugin-runtime-service';
import type { SkillsAdapter } from '../skills/skills-adapter';
import { AgentRuntimeExtensionManager } from '../extensions/agent-runtime-extension-manager';
import { configStore } from '../config/config-store';
import {
  buildTerminalErrorMessage,
  resolveAbortDisposition,
  shouldPreserveExistingTrace,
  toUserFacingErrorText,
} from './agent-runner-message-end';
import {
  LoopGuard,
  buildAbortUserMessage,
  buildHaltSteerMessage,
  buildWarnSteerMessage,
  type LoopGuardDecision,
  type ToolCallDescriptor,
} from './agent-runner-loop-guard';
import { normalizeMcpToolResultForModel } from './tool-result-utils';
import { CodexClient, type CodexLogger } from './codex-runtime/codex-client';
import { CodexRuntime, type CodexRuntimeEmitters } from './codex-runtime/codex-runtime';
import { CodexPermissionBridge } from './codex-runtime/codex-permission-bridge';
import { CodexToolBridge } from './codex-runtime/codex-tool-bridge';
import { CodexEventTranslator } from './codex-runtime/codex-event-translator';
import { adaptPiToolsToCodexHostTools } from './codex-runtime/codex-tool-adapter';
import { buildCodexModelConfig } from './codex-runtime/codex-model-config';

// Virtual workspace path shown to the model (hides real sandbox path)
const VIRTUAL_WORKSPACE_PATH = '/workspace';

/**
 * Estimate chars-per-token ratio based on content language.
 * CJK characters tokenize at ~1.5 chars/token vs ~4 for English.
 */
function estimateCharsPerToken(sampleText: string): number {
  if (!sampleText || sampleText.length === 0) return 4;
  const sample = sampleText.substring(0, 500);
  const cjkCount = (sample.match(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g) || [])
    .length;
  const cjkRatio = cjkCount / sample.length;
  return 4 - cjkRatio * 2.5; // Range: 1.5 (pure CJK) ~ 4 (pure English)
}

// Escape characters that would break the cold-start `<conversation_history>`
// envelope when interpolated into XML tag bodies or attribute values. Raw user
// text blocks are intentionally not escaped (preserves legacy compatibility);
// only the new wrapper tags (`<thinking>`, `<tool_use>`, `<tool_result>`) and
// their attributes pass through these.
//
// Attribute values additionally need `"` escaped because attributes are
// double-quoted. Tag bodies do not (keeping `"` keeps JSON input legible to
// the model).
function escapeXmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeXmlText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Serialize a message's content blocks into the XML representation used inside the
 * cold-start `<conversation_history>` preamble.
 *
 * Why this exists: when the cached pi-coding-agent SDK session is disposed (cwd
 * change or runtime-signature change), agent-runner rebuilds history from
 * DB-persisted messages. The previous implementation only kept `text` blocks,
 * which silently dropped `thinking`, `tool_use`, and `tool_result` blocks.
 * Providers that require previous reasoning/tool-call replay (e.g. DeepSeek V4
 * Flash) then fail with 400 on the next turn, and every other thinking-capable
 * model loses its reasoning trace across cwd switches (issue #162 \u2014 Bug B).
 *
 * Blocks handled:
 *   - text          \u2192 raw text (matches the legacy serializer's output)
 *   - thinking      \u2192 `<thinking>\u2026</thinking>`
 *   - tool_use      \u2192 `<tool_use name="\u2026" id="\u2026">{json input}</tool_use>`
 *   - tool_result   \u2192 `<tool_result tool_use_id="\u2026"[ is_error="true"]>\u2026</tool_result>`
 *   - image         \u2192 skipped (binary, cannot live inside an XML text preamble)
 *   - file_attachment \u2192 skipped (large, would bloat the prompt)
 */
export function serializeMessageContentForHistory(content: ContentBlock[]): string {
  const parts: string[] = [];
  for (const block of content) {
    switch (block.type) {
      case 'text': {
        const text = block.text ?? '';
        if (text.length > 0) parts.push(text);
        break;
      }
      case 'thinking': {
        const thinking = block.thinking ?? '';
        if (thinking.length > 0) parts.push(`<thinking>${escapeXmlText(thinking)}</thinking>`);
        break;
      }
      case 'tool_use': {
        const name = block.name ?? 'unknown';
        const id = block.id ?? '';
        let inputStr: string;
        try {
          inputStr = JSON.stringify(block.input ?? {});
        } catch {
          inputStr = '{}';
        }
        parts.push(
          `<tool_use name="${escapeXmlAttr(name)}" id="${escapeXmlAttr(id)}">${escapeXmlText(inputStr)}</tool_use>`
        );
        break;
      }
      case 'tool_result': {
        const id = block.toolUseId ?? '';
        const errAttr = block.isError ? ' is_error="true"' : '';
        // Local type says `content: string`, but Anthropic-style payloads
        // from older message rows or third-party providers may store an
        // array of content blocks. Flatten defensively so we never serialize
        // "[object Object]".
        const rawContent = (block as { content: unknown }).content;
        let text: string;
        if (typeof rawContent === 'string') {
          text = rawContent;
        } else if (Array.isArray(rawContent)) {
          text = rawContent
            .map((c) =>
              c && typeof c === 'object' && 'text' in c
                ? String((c as { text: unknown }).text ?? '')
                : ''
            )
            .join('\n');
        } else {
          text = '';
        }
        parts.push(
          `<tool_result tool_use_id="${escapeXmlAttr(id)}"${errAttr}>${escapeXmlText(text)}</tool_result>`
        );
        break;
      }
      case 'image':
      case 'file_attachment':
        // Skip \u2014 not representable as XML text in a history preamble.
        break;
    }
  }
  return parts.join('\n');
}

// Bundled node/npx paths never change at runtime — resolve once.
let cachedBundledNodePaths: { node: string; npx: string } | null | undefined = undefined;

function getBundledNodePaths(): { node: string; npx: string } | null {
  if (cachedBundledNodePaths !== undefined) {
    return cachedBundledNodePaths;
  }
  const platform = process.platform;
  const arch = process.arch;
  let resourcesPath: string;
  if (!app.isPackaged) {
    const projectRoot = path.join(__dirname, '..', '..');
    resourcesPath = path.join(projectRoot, 'resources', 'node', `${platform}-${arch}`);
  } else {
    resourcesPath = path.join(process.resourcesPath, 'node');
  }
  const binDir = platform === 'win32' ? resourcesPath : path.join(resourcesPath, 'bin');
  const nodePath = path.join(binDir, platform === 'win32' ? 'node.exe' : 'node');
  const npxPath = path.join(binDir, platform === 'win32' ? 'npx.cmd' : 'npx');
  cachedBundledNodePaths =
    fs.existsSync(nodePath) && fs.existsSync(npxPath) ? { node: nodePath, npx: npxPath } : null;
  return cachedBundledNodePaths;
}

/**
 * Resolve bundled Python bin directory path (if available).
 * Checks packaged and dev layouts, returns the bin dir containing python3.
 */
function resolveBundledPythonBinDir(): string | null {
  const platform = process.platform;
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';

  const candidates: string[] = [];
  if (!app.isPackaged) {
    const projectRoot = path.join(__dirname, '..', '..');
    if (platform === 'darwin') {
      candidates.push(path.join(projectRoot, 'resources', 'python', `darwin-${arch}`, 'bin'));
    }
    candidates.push(path.join(projectRoot, 'resources', 'python', 'bin'));
  } else {
    // Packaged layout: Resources/python/bin/python3
    candidates.push(path.join(process.resourcesPath, 'python', 'bin'));
  }

  const pythonExe = platform === 'win32' ? 'python.exe' : 'python3';
  for (const binDir of candidates) {
    if (fs.existsSync(path.join(binDir, pythonExe))) return binDir;
  }
  return null;
}

/**
 * Resolve bundled tools directory (cliclick etc., macOS only).
 */
function resolveBundledToolsBinDir(): string | null {
  if (process.platform !== 'darwin') return null;
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';

  const candidates: string[] = [];
  if (!app.isPackaged) {
    const projectRoot = path.join(__dirname, '..', '..');
    candidates.push(path.join(projectRoot, 'resources', 'tools', `darwin-${arch}`, 'bin'));
    candidates.push(path.join(projectRoot, 'resources', 'tools', 'bin'));
  } else {
    candidates.push(path.join(process.resourcesPath, 'tools', `darwin-${arch}`, 'bin'));
    candidates.push(path.join(process.resourcesPath, 'tools', 'bin'));
  }

  for (const binDir of candidates) {
    if (fs.existsSync(binDir)) return binDir;
  }
  return null;
}

/**
 * One-time enrichment of process.env.PATH for build (production) mode.
 *
 * In dev mode, Electron inherits the user's full shell PATH, so Skill commands
 * like `python3` and `node` just work. In build mode, `process.env.PATH` is
 * minimal (often just `/usr/bin:/bin`).
 *
 * This function:
 * 1. Restores the user's login-shell PATH (safe: uses execFileSync, not execSync)
 * 2. Prepends bundled Node, Python, and tools bin dirs (highest priority)
 * 3. Deduplicates all entries
 * 4. Writes the result back to `process.env.PATH`
 *
 * Called once before the first `createCodingTools()` — subsequent calls are no-ops.
 */
let pathEnriched = false;

async function enrichProcessPathForBuild(): Promise<void> {
  if (pathEnriched) return;
  pathEnriched = true;

  if (!app.isPackaged) {
    log('[CoworkAgentRunner] Dev mode — skipping PATH enrichment');
    return;
  }

  const platform = process.platform;
  const delimiter = platform === 'win32' ? ';' : ':';
  const currentPaths = (process.env.PATH || '').split(delimiter).filter((p: string) => p.trim());

  // 1. Restore user's login-shell PATH
  let shellPaths: string[] = [];
  if (platform === 'darwin' || platform === 'linux') {
    try {
      const shell = getDefaultShell();
      const output = (
        execFileSync(shell, ['-l', '-c', 'echo $PATH'], {
          encoding: 'utf-8',
          timeout: 5000,
          env: { ...process.env, HOME: os.homedir() },
        }) as string
      ).trim();
      if (output) {
        shellPaths = output.split(':').filter((p: string) => p.trim());
        log(`[CoworkAgentRunner] Restored ${shellPaths.length} paths from login shell`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logWarn(`[CoworkAgentRunner] Could not restore shell PATH: ${message}`);
    }
  } else if (platform === 'win32') {
    try {
      const output = (
        execFileSync(
          'powershell.exe',
          [
            '-NoProfile',
            '-Command',
            "[Environment]::GetEnvironmentVariable('Path', 'User') + ';' + [Environment]::GetEnvironmentVariable('Path', 'Machine')",
          ],
          { encoding: 'utf-8', timeout: 5000 }
        ) as string
      ).trim();
      if (output) {
        shellPaths = output.split(';').filter((p: string) => p.trim());
        log(`[CoworkAgentRunner] Restored ${shellPaths.length} paths from Windows registry`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logWarn(`[CoworkAgentRunner] Could not restore Windows PATH: ${message}`);
    }
  }

  // 2. Collect bundled bin directories (highest priority)
  const bundledDirs: string[] = [];

  const nodePaths = getBundledNodePaths();
  if (nodePaths) {
    bundledDirs.push(path.dirname(nodePaths.node));
  }

  const pythonBinDir = resolveBundledPythonBinDir();
  if (pythonBinDir) {
    bundledDirs.push(pythonBinDir);
  }

  const toolsBinDir = resolveBundledToolsBinDir();
  if (toolsBinDir) {
    bundledDirs.push(toolsBinDir);
  }

  // 3. Merge: bundled (highest) → shell → current process, deduplicate
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const p of [...bundledDirs, ...shellPaths, ...currentPaths]) {
    const normalized = platform === 'win32' ? p.toLowerCase() : p;
    if (!seen.has(normalized)) {
      seen.add(normalized);
      merged.push(p);
    }
  }

  process.env.PATH = merged.join(delimiter);
  log(
    `[CoworkAgentRunner] Enriched process.env.PATH for build mode: ${bundledDirs.length} bundled + ${shellPaths.length} shell + ${currentPaths.length} process → ${merged.length} total`
  );
}

/**
 * Bridge MCP tools from MCPManager into ToolDefinition[] format for the agent SDK.
 * Each MCP tool becomes a customTool whose execute() delegates to mcpManager.callTool().
 */
function buildMcpCustomTools(mcpManager: MCPManager): AgentRuntimeCustomTool[] {
  const mcpTools = mcpManager.getTools();
  return mcpTools.map((mcpTool) => {
    // Wrap the raw JSON Schema inputSchema as a TypeBox TSchema
    const parameters = Type.Unsafe<Record<string, unknown>>(
      mcpTool.inputSchema as Record<string, unknown>
    );

    const toolDef: AgentRuntimeCustomTool = {
      name: mcpTool.name,
      label: `${mcpTool.serverName} → ${mcpTool.originalName || mcpTool.name}`,
      description: mcpTool.description || `MCP tool from ${mcpTool.serverName}`,
      parameters,
      async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
        try {
          const result = await mcpManager.callTool(mcpTool.name, params as Record<string, unknown>);
          const normalizedResult = normalizeMcpToolResultForModel(result);
          return {
            content: [{ type: 'text' as const, text: normalizedResult.text }],
            details:
              normalizedResult.images.length > 0
                ? { openCoworkImages: normalizedResult.images }
                : undefined,
          };
        } catch (err: unknown) {
          logError(`[CoworkAgentRunner] MCP tool ${mcpTool.name} failed:`, err);
          throw err instanceof Error ? err : new Error(String(err));
        }
      },
    };
    return toolDef;
  });
}

/**
 * Get shell environment with proper PATH (including node, npm, etc.)
 * GUI apps on macOS don't inherit shell PATH, so we need to extract it
 */

function safeStringify(value: unknown, space = 0): string {
  try {
    return JSON.stringify(value, null, space);
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    return `[Unserializable: ${details}]`;
  }
}

function toErrorText(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error && typeof error === 'object') {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === 'string' && maybeMessage.trim()) {
      return maybeMessage;
    }
  }
  const serialized = safeStringify(error);
  if (serialized.startsWith('[Unserializable:')) {
    return String(error);
  }
  return serialized;
}

interface AgentRunnerOptions {
  sendToRenderer: (event: ServerEvent) => void;
  saveMessage?: (message: Message) => void;
  requestSudoPassword?: (
    sessionId: string,
    toolUseId: string,
    command: string
  ) => Promise<string | null>;
  requestPermission?: (
    sessionId: string,
    toolUseId: string,
    toolName: string,
    input: Record<string, unknown>
  ) => Promise<'allow' | 'deny' | 'allow_always'>;
}

/** Per-session codex bookkeeping (replaces the pi `CachedPiSession` cache). */
interface CodexSessionMeta {
  runtimeSignature: string;
  skillsSignature?: string;
}

/**
 * Context for a single in-flight `run()` turn, keyed by session id. The shared, warm
 * `CodexRuntime` dispatches translator actions to the runner's singleton emitters; those
 * emitters look this up by session id to reach the per-run output sanitizer, loop guard,
 * and error/trace bookkeeping.
 */
interface CodexRunContext {
  sanitizeOutputPaths: (content: string) => string;
  loopGuard: LoopGuard;
  handleLoopGuardDecision: (decision: LoopGuardDecision, context: string) => void;
  markError: (message: string, willRetry: boolean) => void;
  /** Resets the per-turn activity timeout — called on each meaningful codex event. */
  onActivity: () => void;
}

/**
 * CoworkAgentRunner - drives the OpenAI Codex `app-server` backend (see
 * `src/main/agent/codex-runtime/`). Session CRUD + history live in SessionManager; this
 * class owns runtime-agnostic prompt assembly, skills / path resolution, sandbox sync,
 * the loop guard, and the codex turn lifecycle.
 */
export class CoworkAgentRunner {
  private sendToRenderer: (event: ServerEvent) => void;
  private saveMessage?: (message: Message) => void;
  private requestPermission?: (
    sessionId: string,
    toolUseId: string,
    toolName: string,
    input: Record<string, unknown>
  ) => Promise<'allow' | 'deny' | 'allow_always'>;
  private pathResolver: PathResolver;
  private mcpManager?: MCPManager;
  private _pluginRuntimeService?: PluginRuntimeService;
  private _skillsAdapter?: SkillsAdapter;
  private extensionManager?: AgentRuntimeExtensionManager;
  private activeControllers: Map<string, AbortController> = new Map();
  private toolDisplayNameCache: Map<string, string> = new Map();

  // Codex runtime (lazy singleton — the app-server child is kept warm across turns).
  private codexRuntime?: CodexRuntime;
  private codexToolBridge?: CodexToolBridge;
  private readonly codexSessionMeta: Map<string, CodexSessionMeta> = new Map();
  private readonly codexRunContexts: Map<string, CodexRunContext> = new Map();
  private readonly codexContextUsage: Map<
    string,
    { tokens: number | null; contextWindow: number; percent: number | null }
  > = new Map();

  // Per-instance caches — invalidated when the underlying config changes.
  private _mcpServersCache: { fingerprint: string; servers: Record<string, unknown> } | null = null;
  private _skillsSetupDone = false;

  /**
   * Forget a session's codex thread (keeps the app-server warm).
   * Called when the session's cwd changes — the working directory is bound to the thread.
   */
  clearSdkSession(sessionId: string): void {
    this.codexSessionMeta.delete(sessionId);
    this.codexContextUsage.delete(sessionId);
    if (this.codexRuntime) {
      try {
        this.codexRuntime.disposeSession(sessionId);
        log('[CoworkAgentRunner] Disposed codex thread for:', sessionId);
      } catch (e) {
        logWarn('[CoworkAgentRunner] disposeSession error:', e);
      }
    }
  }

  clearAllSdkSessions(): void {
    for (const sessionId of Array.from(this.codexSessionMeta.keys())) {
      this.clearSdkSession(sessionId);
    }
  }

  /** Call after the user installs / removes a skill so the next query re-links everything. */
  invalidateSkillsSetup(): void {
    this._skillsSetupDone = false;
  }

  /** Call after the user changes MCP server config so the next query rebuilds mcpServers. */
  invalidateMcpServersCache(): void {
    this._mcpServersCache = null;
    // Sessions stay alive — MCP tools are rebuilt each query via buildMcpCustomTools()
    log('[CoworkAgentRunner] MCP servers cache invalidated — tools will rebuild on next query');
  }

  // TODO: Credentials should be served via a secure MCP tool or IPC channel,
  // not injected as plaintext into the system prompt. The getCredentialsPrompt()
  // method was removed to eliminate credential leakage risk.

  /**
   * Generate bundled executable path hints for production mode system prompt.
   * In dev mode returns empty string (user PATH already works).
   * This is a defense-in-depth layer — even if PATH enrichment works, explicit
   * paths help the model avoid ambiguity when Skills reference bare commands.
   */
  private getBundledPathHints(): string {
    if (!app.isPackaged) return '';

    const hints: string[] = [];

    const nodePaths = getBundledNodePaths();
    if (nodePaths) {
      hints.push(`- node: ${nodePaths.node}`);
      hints.push(`- npx: ${nodePaths.npx}`);
    }

    const pythonBinDir = resolveBundledPythonBinDir();
    if (pythonBinDir) {
      const pythonExe = process.platform === 'win32' ? 'python.exe' : 'python3';
      const pipExe = process.platform === 'win32' ? 'pip.exe' : 'pip3';
      hints.push(`- python3: ${path.join(pythonBinDir, pythonExe)}`);
      if (fs.existsSync(path.join(pythonBinDir, pipExe))) {
        hints.push(`- pip3: ${path.join(pythonBinDir, pipExe)}`);
      }
    }

    if (hints.length === 0) return '';

    return `<bundled_executables>
This application bundles its own executables. When executing commands, prefer these absolute paths:
${hints.join('\n')}
</bundled_executables>`;
  }

  /** Fallback skill path resolution when SkillsAdapter is not provided. */
  private legacySkillPaths(): string[] {
    const paths: string[] = [];
    const builtin = this.getBuiltinSkillsPath();
    if (builtin && fs.existsSync(builtin)) paths.push(builtin);
    const global = this.getConfiguredGlobalSkillsDir();
    if (global && fs.existsSync(global)) paths.push(global);
    return paths;
  }

  private async resolveSkillPaths(sessionId?: string): Promise<string[]> {
    const basePaths = this._skillsAdapter
      ? this._skillsAdapter.getSkillPaths()
      : this.legacySkillPaths();
    const mergedPaths = new Set(
      basePaths.filter((item): item is string => Boolean(item && fs.existsSync(item)))
    );
    const appliedPlugins: Array<{ name: string; path: string }> = [];

    if (this._pluginRuntimeService) {
      try {
        const runtimePlugins = await this._pluginRuntimeService.getEnabledRuntimePlugins();
        for (const plugin of runtimePlugins) {
          if (!plugin.componentsEnabled.skills || plugin.componentCounts.skills <= 0) {
            continue;
          }
          const runtimeSkillsPath = path.join(plugin.runtimePath, 'skills');
          if (!fs.existsSync(runtimeSkillsPath)) {
            continue;
          }
          mergedPaths.add(runtimeSkillsPath);
          appliedPlugins.push({ name: plugin.name, path: runtimeSkillsPath });
        }
      } catch (error) {
        logWarn('[CoworkAgentRunner] Failed to resolve runtime plugin skill paths:', error);
      }
    }

    if (sessionId && appliedPlugins.length > 0) {
      this.sendToRenderer({
        type: 'plugins.runtimeApplied',
        payload: { sessionId, plugins: appliedPlugins },
      });
    }

    return Array.from(mergedPaths);
  }

  /**
   * Get the built-in skills directory (shipped with the app)
   */
  private getBuiltinSkillsPath(): string {
    // In development, skills are in the project's .claude/skills directory
    // In production, they're extracted via extraResources to resources/skills
    const appPath = app.getAppPath();
    const unpackedPath = appPath.replace(/\.asar$/, '.asar.unpacked');

    const possiblePaths = [
      // Development: relative to this file
      path.join(__dirname, '..', '..', '..', '.claude', 'skills'),
      // Production: extraResources extracts .claude/skills → resources/skills
      // This is the preferred production path (real directory, no asar issues)
      path.join(process.resourcesPath || '', 'skills'),
      // Legacy: in app.asar.unpacked (for older builds with asarUnpack)
      ...(this.physicalDirExists(path.join(unpackedPath, '.claude', 'skills'))
        ? [path.join(unpackedPath, '.claude', 'skills')]
        : []),
      // Last resort: read from inside the asar archive (Electron intercepts this)
      path.join(appPath, '.claude', 'skills'),
    ];

    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        log('[CoworkAgentRunner] Found built-in skills at:', p);
        return p;
      }
    }

    logWarn('[CoworkAgentRunner] No built-in skills directory found');
    return '';
  }

  /**
   * Check if a directory physically exists on disk, bypassing Electron's
   * asar interception.
   */
  private physicalDirExists(dirPath: string): boolean {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const originalFs = require('original-fs') as typeof import('fs');
      return originalFs.existsSync(dirPath) && originalFs.statSync(dirPath).isDirectory();
    } catch {
      return false;
    }
  }

  private getAppAgentDir(): string {
    return path.join(app.getPath('userData'), 'claude');
  }

  private getRuntimeSkillsDir(): string {
    return path.join(this.getAppAgentDir(), 'skills');
  }

  private getConfiguredGlobalSkillsDir(): string {
    const configuredPath = (configStore.get('globalSkillsPath') || '').trim();
    if (!configuredPath) {
      return this.getRuntimeSkillsDir();
    }

    const resolvedPath = path.resolve(configuredPath);
    try {
      if (!fs.existsSync(resolvedPath)) {
        fs.mkdirSync(resolvedPath, { recursive: true });
      }
      if (fs.statSync(resolvedPath).isDirectory()) {
        return resolvedPath;
      }
      logWarn(
        '[CoworkAgentRunner] Configured skills path is not a directory, fallback to runtime path:',
        resolvedPath
      );
    } catch (error) {
      logWarn(
        '[CoworkAgentRunner] Configured skills path is unavailable, fallback to runtime path:',
        resolvedPath,
        error
      );
    }

    return this.getRuntimeSkillsDir();
  }

  private getUserSkillsDir(): string {
    return path.join(app.getPath('home'), '.claude', 'skills');
  }

  private syncUserSkillsToAppDir(appSkillsDir: string): void {
    const userSkillsDir = this.getUserSkillsDir();
    if (!fs.existsSync(userSkillsDir)) {
      return;
    }

    const entries = fs.readdirSync(userSkillsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const sourcePath = path.join(userSkillsDir, entry.name);
      const targetPath = path.join(appSkillsDir, entry.name);

      if (fs.existsSync(targetPath)) {
        try {
          const stat = fs.lstatSync(targetPath);
          if (!stat.isSymbolicLink()) {
            continue;
          }
          fs.unlinkSync(targetPath);
        } catch {
          continue;
        }
      }

      try {
        fs.symlinkSync(sourcePath, targetPath, 'dir');
      } catch (err) {
        try {
          this.copyDirectorySync(sourcePath, targetPath);
        } catch (copyErr) {
          logWarn('[CoworkAgentRunner] Failed to import user skill:', entry.name, copyErr);
        }
      }
    }
  }

  private syncConfiguredSkillsToRuntimeDir(runtimeSkillsDir: string): void {
    const configuredSkillsDir = this.getConfiguredGlobalSkillsDir();
    if (configuredSkillsDir === runtimeSkillsDir) {
      return;
    }
    if (!fs.existsSync(configuredSkillsDir) || !fs.statSync(configuredSkillsDir).isDirectory()) {
      return;
    }

    const entries = fs.readdirSync(configuredSkillsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const sourcePath = path.join(configuredSkillsDir, entry.name);
      const targetPath = path.join(runtimeSkillsDir, entry.name);
      try {
        if (fs.existsSync(targetPath)) {
          // Use lstatSync so we don't follow symlinks — check the entry itself
          const stat = fs.lstatSync(targetPath);
          if (stat.isSymbolicLink()) {
            fs.unlinkSync(targetPath);
          } else {
            fs.rmSync(targetPath, { recursive: true, force: true });
          }
        }
        fs.symlinkSync(sourcePath, targetPath, 'dir');
      } catch (err) {
        try {
          this.copyDirectorySync(sourcePath, targetPath);
        } catch (copyErr) {
          logWarn('[CoworkAgentRunner] Failed to sync configured skill:', entry.name, copyErr);
        }
      }
    }
  }

  private copyDirectorySync(source: string, target: string): void {
    if (!fs.existsSync(target)) {
      fs.mkdirSync(target, { recursive: true });
    }

    const entries = fs.readdirSync(source);
    for (const entry of entries) {
      const sourcePath = path.join(source, entry);
      const targetPath = path.join(target, entry);
      const stat = fs.statSync(sourcePath);

      if (stat.isDirectory()) {
        this.copyDirectorySync(sourcePath, targetPath);
      } else {
        fs.copyFileSync(sourcePath, targetPath);
      }
    }
  }

  constructor(
    options: AgentRunnerOptions,
    pathResolver: PathResolver,
    mcpManager?: MCPManager,
    pluginRuntimeService?: PluginRuntimeService,
    skillsAdapter?: SkillsAdapter,
    extensionManager?: AgentRuntimeExtensionManager
  ) {
    this.sendToRenderer = options.sendToRenderer;
    this.saveMessage = options.saveMessage;
    this.requestPermission = options.requestPermission;
    this.pathResolver = pathResolver;
    this.mcpManager = mcpManager;
    this._pluginRuntimeService = pluginRuntimeService;
    this._skillsAdapter = skillsAdapter;
    this.extensionManager = extensionManager;

    log('[CoworkAgentRunner] Initialized with Open Cowork agent SDK');
    log('[CoworkAgentRunner] Skills enabled: settingSources=[user, project], Skill tool enabled');
    if (mcpManager) {
      log('[CoworkAgentRunner] MCP support enabled');
    }
  }

  /**
   * Lazily build the shared, warm codex runtime: one `CodexClient` (app-server child),
   * a `CodexPermissionBridge` (replaces the pi `agent.setBeforeToolCall` reach-in), a
   * `CodexToolBridge` (host `dynamic_tools`), and the `CodexRuntime` that occupies pi's
   * former turn role. Emitters + the translator factory are wired to the runner's private
   * `send*` helpers and the per-run context looked up by session id.
   */
  private ensureCodexRuntime(): CodexRuntime {
    if (this.codexRuntime) return this.codexRuntime;

    const logger: CodexLogger = {
      log: (...args: unknown[]) => log('[codex]', ...args),
      warn: (...args: unknown[]) => logWarn('[codex]', ...args),
      error: (...args: unknown[]) => logError('[codex]', ...args),
    };

    const client = new CodexClient({
      clientInfo: { name: 'open-cowork', version: app.getVersion() },
      // `dynamicTools` on `thread/start` is an experimental app-server field; codex ignores
      // it unless the initialize handshake opts into the experimental API. Without this the
      // memory/config/subagent host tools never register and the agent can't call them.
      capabilities: { experimentalApi: true, requestAttestation: false },
      logger,
    });

    const toolBridge = new CodexToolBridge();

    const requestPermission = this.requestPermission;
    const permissionBridge = new CodexPermissionBridge({
      decide: decidePermission,
      rememberAlwaysAllow,
      prompt: requestPermission
        ? async (context) => {
            // Round-trips to the renderer PermissionDialog via SessionManager.
            const toolUseId = `codex-perm-${uuidv4().slice(0, 8)}`;
            const displayName = this.getToolDisplayName(context.toolName);
            const result = await requestPermission(
              context.sessionId,
              toolUseId,
              displayName,
              context.input
            );
            // Enum adapter: app 'allow_always' → bridge 'always' (→ codex acceptForSession).
            return result === 'allow_always' ? 'always' : result;
          }
        : undefined,
      logger,
    });

    const runtime = new CodexRuntime({
      client,
      emitters: this.buildCodexEmitters(),
      permissionBridge,
      toolBridge,
      createTranslator: (sessionId: string) =>
        new CodexEventTranslator({
          sessionId,
          getToolDisplayName: (name) => this.getToolDisplayName(name),
          // Per-run sandbox-path sanitizer, resolved from the active run context.
          sanitizeToolOutput: (output) =>
            this.codexRunContexts.get(sessionId)?.sanitizeOutputPaths(output) ?? output,
        }),
      logger,
    });

    this.codexToolBridge = toolBridge;
    this.codexRuntime = runtime;
    log('[CoworkAgentRunner] Codex runtime initialized');
    return runtime;
  }

  /**
   * The singleton emitter set the codex runtime dispatches translator actions to. These
   * reuse the runner's private `send*` helpers (so `sendMessage` keeps its `saveMessage`
   * persistence side effect) and consult the per-run context by session id for the loop
   * guard, output sanitizing, token-usage aggregation, and error handling.
   */
  private buildCodexEmitters(): CodexRuntimeEmitters {
    return {
      sendPartial: (sessionId, delta) => {
        this.codexRunContexts.get(sessionId)?.onActivity();
        this.sendPartial(sessionId, delta);
      },
      sendToRenderer: (event) => this.sendToRenderer(event),
      sendTraceStep: (sessionId, step) => {
        // Loop guard layer 2 (per-tool frequency) — codex streams each tool as its own item.
        const ctx = this.codexRunContexts.get(sessionId);
        ctx?.onActivity();
        if (ctx && step.type === 'tool_call' && step.status === 'running' && step.toolName) {
          ctx.handleLoopGuardDecision(
            ctx.loopGuard.recordToolInvocation(step.toolName),
            'tool_start'
          );
        }
        this.sendTraceStep(sessionId, step);
      },
      sendTraceUpdate: (sessionId, stepId, updates) =>
        this.sendTraceUpdate(sessionId, stepId, updates),
      sendMessage: (sessionId, message) => {
        const ctx = this.codexRunContexts.get(sessionId);
        ctx?.onActivity();
        this.sendMessage(
          sessionId,
          ctx ? this.postProcessCodexMessage(sessionId, message, ctx) : message
        );
      },
      onTokenUsage: ({ sessionId, tokenUsage, contextWindow }) => {
        if (typeof contextWindow === 'number' && contextWindow > 0) {
          this.sendToRenderer({
            type: 'session.contextInfo',
            payload: { sessionId, contextWindow },
          });
        }
        // Track for the pull-based getContextUsage(); the translator already attaches the
        // per-message tokenUsage to the assembled assistant message.
        const tokens = tokenUsage.input + tokenUsage.output;
        const window =
          typeof contextWindow === 'number' && contextWindow > 0
            ? contextWindow
            : (this.codexContextUsage.get(sessionId)?.contextWindow ?? 0);
        this.codexContextUsage.set(sessionId, {
          tokens,
          contextWindow: window,
          percent: window > 0 ? Math.min(100, Math.round((tokens / window) * 100)) : null,
        });
      },
      onCompaction: ({ sessionId, turnId }) => {
        // Open item (a): codex owns summarization, so the summary / read+modified files pi
        // surfaced are not available from the codex event — emit a reduced compaction.result.
        log('[CoworkAgentRunner] Codex compaction completed for turn:', turnId);
        this.sendToRenderer({
          type: 'compaction.result',
          payload: { sessionId, summary: '', tokensBefore: 0, readFiles: [], modifiedFiles: [] },
        });
      },
      onError: ({ sessionId, message, willRetry }) => {
        this.codexRunContexts.get(sessionId)?.markError(message, willRetry);
      },
    };
  }

  /**
   * Post-process a codex-assembled assistant message before it reaches the renderer:
   * sanitize sandbox paths in text, extract inline artifacts into trace steps, and feed
   * the message's tool-call group into loop guard layer 1 (hash detection). Tool-result
   * output is already sanitized by the translator, so only assistant text is touched.
   */
  private postProcessCodexMessage(
    sessionId: string,
    message: Message,
    ctx: CodexRunContext
  ): Message {
    if (message.role !== 'assistant' || !Array.isArray(message.content)) {
      return message;
    }
    const toolDescriptors: ToolCallDescriptor[] = [];
    const newContent: ContentBlock[] = [];
    for (const block of message.content) {
      if (block.type === 'text') {
        const { cleanText, artifacts } = extractArtifactsFromText(block.text);
        if (cleanText) {
          newContent.push({ type: 'text', text: ctx.sanitizeOutputPaths(cleanText) });
        }
        if (artifacts.length > 0) {
          for (const step of buildArtifactTraceSteps(artifacts)) {
            this.sendTraceStep(sessionId, step);
          }
        }
      } else {
        if (block.type === 'tool_use') {
          toolDescriptors.push({
            name: block.name || '',
            input: (block.input as Record<string, unknown>) || undefined,
          });
        }
        newContent.push(block);
      }
    }
    if (toolDescriptors.length > 0) {
      ctx.handleLoopGuardDecision(ctx.loopGuard.recordAssistantMessage(toolDescriptors), 'message');
    }
    // Never drop an assistant message to an empty bubble; keep original blocks if the
    // artifact extraction consumed everything (rare — artifact-only responses).
    return { ...message, content: newContent.length > 0 ? newContent : message.content };
  }

  private getToolDisplayName(toolName: string): string {
    const cached = this.toolDisplayNameCache.get(toolName);
    if (cached) {
      return cached;
    }

    let displayName = toolName;
    if (!toolName.startsWith('mcp__')) {
      this.toolDisplayNameCache.set(toolName, displayName);
      return displayName;
    }

    const mcpTool = this.mcpManager?.getTool(toolName);
    if (mcpTool?.originalName) {
      displayName = mcpTool.originalName;
    } else {
      const match = toolName.match(/^mcp__(.+?)__(.+)$/);
      displayName = match?.[2] || toolName;
    }

    this.toolDisplayNameCache.set(toolName, displayName);
    return displayName;
  }

  /**
   * Resolve current model string from runtime config.
   */
  private getCurrentModelString(preferredModel?: string): string {
    const routeModel = preferredModel?.trim();
    const configuredModel = configStore.get('model')?.trim();
    const model = routeModel || configuredModel || 'anthropic/claude-sonnet-4-6';
    logCtx('[CoworkAgentRunner] Current model:', model);
    logCtx(
      '[CoworkAgentRunner] Model source:',
      routeModel ? 'runtimeRoute.model' : configuredModel ? 'configStore.model' : 'default'
    );
    return model;
  }

  async run(session: Session, prompt: string, existingMessages: Message[]): Promise<void> {
    const runStartTime = Date.now();
    logCtx('[CoworkAgentRunner] run() started');

    const controller = new AbortController();
    try {
      // SDK 会在同一 AbortSignal 上挂载较多监听器，放开上限避免无意义告警干扰排错。
      setMaxListeners(0, controller.signal);
    } catch {
      // 旧运行时不支持 EventTarget 调整监听上限时忽略即可。
    }
    this.activeControllers.set(session.id, controller);

    // Sandbox isolation state (defined outside try for finally access)
    let sandboxPath: string | null = null;
    let useSandboxIsolation = false;

    // Helper to convert real sandbox paths back to virtual workspace paths in output
    // Cache the compiled regex to avoid recompilation on every call
    let sandboxPathRegex: RegExp | null = null;
    const sanitizeOutputPaths = (content: string): string => {
      if (!sandboxPath || !useSandboxIsolation) return content;
      if (!sandboxPathRegex) {
        sandboxPathRegex = new RegExp(sandboxPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      }
      // Replace real sandbox path with virtual workspace path
      return content.replace(sandboxPathRegex, VIRTUAL_WORKSPACE_PATH);
    };

    const thinkingStepId = uuidv4();
    let abortedByTimeout = false;
    // Set to true when the loop-guard unilaterally aborts (hash_abort / freq_abort).
    // The catch block consults this flag to avoid overwriting the 'error' trace
    // status that handleLoopGuardDecision has already published.
    let abortedByLoopGuard = false;
    // Set to true when the provider emits a terminal stream error mid-turn.
    // The catch block consults this flag to avoid overwriting the published
    // 'Request failed' trace state with a generic 'Cancelled' update.
    let abortedByStreamError = false;

    try {
      this.pathResolver.registerSession(session.id, session.mountedPaths);
      logTiming('pathResolver.registerSession', runStartTime);

      // Note: User message is now added by the frontend immediately for better UX
      // No need to send it again from backend

      // Send initial thinking trace
      this.sendTraceStep(session.id, {
        id: thinkingStepId,
        type: 'thinking',
        status: 'running',
        title: 'Processing request...',
        timestamp: Date.now(),
      });
      logTiming('sendTraceStep (thinking)', runStartTime);

      // Use session's cwd - each session has its own working directory
      const workingDir = session.cwd || undefined;
      logCtx('[CoworkAgentRunner] Working directory:', workingDir || '(none)');

      // Initialize sandbox sync if WSL mode is active
      const sandbox = getSandboxAdapter();

      if (sandbox.isWSL && sandbox.wslStatus?.distro && workingDir) {
        log('[CoworkAgentRunner] WSL mode active, initializing sandbox sync...');

        // Only show sync UI for new sessions (first message)
        const isNewSession = !SandboxSync.hasSession(session.id);

        if (isNewSession) {
          // Notify UI: syncing files (only for new sessions)
          this.sendToRenderer({
            type: 'sandbox.sync',
            payload: {
              sessionId: session.id,
              phase: 'syncing_files',
              message: 'Syncing files to sandbox...',
              detail: 'Copying project files to isolated WSL environment',
            },
          });
        }

        const syncResult = await SandboxSync.initSync(
          workingDir,
          session.id,
          sandbox.wslStatus.distro
        );

        if (syncResult.success) {
          sandboxPath = syncResult.sandboxPath;
          useSandboxIsolation = true;
          log(`[CoworkAgentRunner] Sandbox initialized: ${sandboxPath}`);
          log(
            `[CoworkAgentRunner]   Files: ${syncResult.fileCount}, Size: ${syncResult.totalSize} bytes`
          );

          if (isNewSession) {
            // Update UI with file count (only for new sessions)
            this.sendToRenderer({
              type: 'sandbox.sync',
              payload: {
                sessionId: session.id,
                phase: 'syncing_skills',
                message: 'Configuring skills...',
                detail: 'Copying built-in skills to sandbox',
                fileCount: syncResult.fileCount,
                totalSize: syncResult.totalSize,
              },
            });
          }

          // Copy skills to sandbox ~/.claude/skills/
          const builtinSkillsPath = this.getBuiltinSkillsPath();
          try {
            const distro = sandbox.wslStatus!.distro!;
            const sandboxSkillsPath = `${sandboxPath}/.claude/skills`;

            // Create .claude/skills directory in sandbox
            execFileSync('wsl', ['-d', distro, '-e', 'mkdir', '-p', sandboxSkillsPath], {
              encoding: 'utf-8',
              timeout: 10000,
            });

            if (builtinSkillsPath && fs.existsSync(builtinSkillsPath)) {
              // Use rsync via execFileSync with array args to avoid shell injection
              const wslSourcePath = pathConverter.toWSL(builtinSkillsPath);
              log(
                `[CoworkAgentRunner] Copying skills with rsync: ${wslSourcePath}/ -> ${sandboxSkillsPath}/`
              );

              execFileSync(
                'wsl',
                ['-d', distro, '-e', 'rsync', '-av', wslSourcePath + '/', sandboxSkillsPath + '/'],
                {
                  encoding: 'utf-8',
                  timeout: 120000, // 2 min timeout for large skill directories
                }
              );
            }

            const appSkillsDir = this.getRuntimeSkillsDir();
            if (!fs.existsSync(appSkillsDir)) {
              fs.mkdirSync(appSkillsDir, { recursive: true });
            }
            this.syncUserSkillsToAppDir(appSkillsDir);
            this.syncConfiguredSkillsToRuntimeDir(appSkillsDir);

            if (fs.existsSync(appSkillsDir)) {
              const wslSourcePath = pathConverter.toWSL(appSkillsDir);
              log(
                `[CoworkAgentRunner] Copying app skills with rsync: ${wslSourcePath}/ -> ${sandboxSkillsPath}/`
              );

              execFileSync(
                'wsl',
                ['-d', distro, '-e', 'rsync', '-avL', wslSourcePath + '/', sandboxSkillsPath + '/'],
                {
                  encoding: 'utf-8',
                  timeout: 120000, // 2 min timeout for large skill directories
                }
              );
            }

            // List copied skills for verification
            const copiedSkills = execFileSync(
              'wsl',
              ['-d', distro, '-e', 'ls', sandboxSkillsPath],
              {
                encoding: 'utf-8',
                timeout: 10000,
              }
            )
              .trim()
              .split(/\r?\n/)
              .filter(Boolean);

            log(`[CoworkAgentRunner] Skills copied to sandbox: ${sandboxSkillsPath}`);
            log(`[CoworkAgentRunner]   Skills: ${copiedSkills.join(', ')}`);
          } catch (error) {
            logError('[CoworkAgentRunner] Failed to copy skills to sandbox:', error);
          }

          if (isNewSession) {
            // Notify UI: sync complete (only for new sessions)
            this.sendToRenderer({
              type: 'sandbox.sync',
              payload: {
                sessionId: session.id,
                phase: 'ready',
                message: 'Sandbox ready',
                detail: `Synced ${syncResult.fileCount} files`,
                fileCount: syncResult.fileCount,
                totalSize: syncResult.totalSize,
              },
            });
          }
        } else {
          logError('[CoworkAgentRunner] Sandbox sync failed:', syncResult.error);
          log('[CoworkAgentRunner] Falling back to /mnt/ access (less secure)');

          if (isNewSession) {
            // Notify UI: error (only for new sessions)
            this.sendToRenderer({
              type: 'sandbox.sync',
              payload: {
                sessionId: session.id,
                phase: 'error',
                message: 'Sandbox file sync failed, falling back to direct access mode',
                detail: 'Falling back to direct access mode (less secure)',
              },
            });
          }
        }
      }

      // Initialize sandbox sync if Lima mode is active
      if (sandbox.isLima && sandbox.limaStatus?.instanceRunning && workingDir) {
        log('[CoworkAgentRunner] Lima mode active, initializing sandbox sync...');

        const { LimaSync } = await import('../sandbox/lima-sync');

        // Only show sync UI for new sessions (first message)
        const isNewLimaSession = !LimaSync.hasSession(session.id);

        if (isNewLimaSession) {
          // Notify UI: syncing files (only for new sessions)
          this.sendToRenderer({
            type: 'sandbox.sync',
            payload: {
              sessionId: session.id,
              phase: 'syncing_files',
              message: 'Syncing files to sandbox...',
              detail: 'Copying project files to isolated Lima environment',
            },
          });
        }

        const syncResult = await LimaSync.initSync(workingDir, session.id);

        if (syncResult.success) {
          sandboxPath = syncResult.sandboxPath;
          useSandboxIsolation = true;
          log(`[CoworkAgentRunner] Sandbox initialized: ${sandboxPath}`);
          log(
            `[CoworkAgentRunner]   Files: ${syncResult.fileCount}, Size: ${syncResult.totalSize} bytes`
          );

          if (isNewLimaSession) {
            // Update UI with file count (only for new sessions)
            this.sendToRenderer({
              type: 'sandbox.sync',
              payload: {
                sessionId: session.id,
                phase: 'syncing_skills',
                message: 'Configuring skills...',
                detail: 'Copying built-in skills to sandbox',
                fileCount: syncResult.fileCount,
                totalSize: syncResult.totalSize,
              },
            });
          }

          // Copy skills to sandbox ~/.claude/skills/
          const builtinSkillsPath = this.getBuiltinSkillsPath();
          try {
            const sandboxSkillsPath = `${sandboxPath}/.claude/skills`;

            // Create .claude/skills directory in sandbox
            execFileSync(
              'limactl',
              ['shell', 'claude-sandbox', '--', 'mkdir', '-p', sandboxSkillsPath],
              {
                encoding: 'utf-8',
                timeout: 10000,
              }
            );

            if (builtinSkillsPath && fs.existsSync(builtinSkillsPath)) {
              // Use rsync via execFileSync with array args to avoid shell injection
              // Lima mounts /Users directly, so paths are the same
              log(
                `[CoworkAgentRunner] Copying skills with rsync: ${builtinSkillsPath}/ -> ${sandboxSkillsPath}/`
              );

              execFileSync(
                'limactl',
                [
                  'shell',
                  'claude-sandbox',
                  '--',
                  'rsync',
                  '-av',
                  builtinSkillsPath + '/',
                  sandboxSkillsPath + '/',
                ],
                {
                  encoding: 'utf-8',
                  timeout: 120000, // 2 min timeout for large skill directories
                }
              );
            }

            const appSkillsDir = this.getRuntimeSkillsDir();
            if (!fs.existsSync(appSkillsDir)) {
              fs.mkdirSync(appSkillsDir, { recursive: true });
            }
            this.syncUserSkillsToAppDir(appSkillsDir);
            this.syncConfiguredSkillsToRuntimeDir(appSkillsDir);

            if (fs.existsSync(appSkillsDir)) {
              log(
                `[CoworkAgentRunner] Copying app skills with rsync: ${appSkillsDir}/ -> ${sandboxSkillsPath}/`
              );

              execFileSync(
                'limactl',
                [
                  'shell',
                  'claude-sandbox',
                  '--',
                  'rsync',
                  '-avL',
                  appSkillsDir + '/',
                  sandboxSkillsPath + '/',
                ],
                {
                  encoding: 'utf-8',
                  timeout: 120000, // 2 min timeout for large skill directories
                }
              );
            }

            // List copied skills for verification
            const copiedSkills = execFileSync(
              'limactl',
              ['shell', 'claude-sandbox', '--', 'ls', sandboxSkillsPath],
              {
                encoding: 'utf-8',
                timeout: 10000,
              }
            )
              .trim()
              .split(/\r?\n/)
              .filter(Boolean);

            log(`[CoworkAgentRunner] Skills copied to sandbox: ${sandboxSkillsPath}`);
            log(`[CoworkAgentRunner]   Skills: ${copiedSkills.join(', ')}`);
          } catch (error) {
            logError('[CoworkAgentRunner] Failed to copy skills to sandbox:', error);
          }

          if (isNewLimaSession) {
            // Notify UI: sync complete (only for new sessions)
            this.sendToRenderer({
              type: 'sandbox.sync',
              payload: {
                sessionId: session.id,
                phase: 'ready',
                message: 'Sandbox ready',
                detail: `Synced ${syncResult.fileCount} files`,
                fileCount: syncResult.fileCount,
                totalSize: syncResult.totalSize,
              },
            });
          }
        } else {
          logError('[CoworkAgentRunner] Sandbox sync failed:', syncResult.error);
          log('[CoworkAgentRunner] Falling back to direct access (less secure)');

          if (isNewLimaSession) {
            // Notify UI: error (only for new sessions)
            this.sendToRenderer({
              type: 'sandbox.sync',
              payload: {
                sessionId: session.id,
                phase: 'error',
                message: 'Sandbox file sync failed, falling back to direct access mode',
                detail: 'Falling back to direct access mode (less secure)',
              },
            });
          }
        }
      }

      // Check if current user message includes images
      const lastUserMessage =
        existingMessages.length > 0 ? existingMessages[existingMessages.length - 1] : null;

      logCtx('[CoworkAgentRunner] Total messages:', existingMessages.length);

      const hasImages =
        lastUserMessage?.content.some((c) => (c as { type?: string }).type === 'image') || false;
      if (hasImages) {
        log('[CoworkAgentRunner] User message contains images');
      }

      logTiming('before codex model resolution', runStartTime);

      // Resolve the codex model/provider config from the app config. Under D4/D4a only
      // OpenAI + OpenAI-Responses-compatible endpoints are supported; anything else is a
      // hard, user-facing error (no silent fallback — pi's synthetic-model path is gone).
      const runtimeConfig = configStore.getAll();
      const provider = runtimeConfig.provider || 'openai';
      const modelString = this.getCurrentModelString(runtimeConfig.model);
      const modelConfigResult = buildCodexModelConfig({
        provider,
        model: modelString,
        baseUrl: runtimeConfig.baseUrl,
        apiKey: runtimeConfig.apiKey,
        customProtocol: runtimeConfig.customProtocol,
      });
      if (!modelConfigResult.supported) {
        logWarn(
          '[CoworkAgentRunner] Unsupported provider for codex runtime:',
          modelConfigResult.reason
        );
        this.sendMessage(session.id, {
          id: uuidv4(),
          sessionId: session.id,
          role: 'assistant',
          content: [{ type: 'text', text: `**Configuration error**: ${modelConfigResult.reason}` }],
          timestamp: Date.now(),
        });
        this.sendTraceUpdate(session.id, thinkingStepId, {
          status: 'error',
          title: 'Provider not supported',
        });
        return;
      }
      const modelConfig = modelConfigResult.config;
      logCtx(
        '[CoworkAgentRunner] Resolved codex model:',
        modelConfig.providerId,
        modelConfig.model
      );

      // Project the API key into the environment so the (warm) app-server child can read it
      // via the provider's env_key. Keys never round-trip through config files.
      for (const [key, value] of Object.entries(modelConfig.env)) {
        process.env[key] = value;
      }

      // Context window drives the cold-start history budget + the config summary prompt.
      const codexContextWindow =
        runtimeConfig.contextWindow && runtimeConfig.contextWindow > 0
          ? runtimeConfig.contextWindow
          : 128000;

      // Seed the context bar; onTokenUsage refines it once codex reports real usage.
      this.sendToRenderer({
        type: 'session.contextInfo',
        payload: { sessionId: session.id, contextWindow: codexContextWindow },
      });

      logTiming('after codex model resolution', runStartTime);

      // the agent SDK handles path sandboxing via its own tools
      const imageCapable = true; // pi-ai models generally support images; let the model handle unsupported cases
      const effectiveCwd =
        useSandboxIsolation && sandboxPath ? sandboxPath : workingDir || process.cwd();

      // Use app-specific Claude config directory to avoid conflicts with user settings
      // SDK uses CLAUDE_CONFIG_DIR to locate skills
      const userAgentDir = this.getAppAgentDir();

      // Skills directory setup: only run on the first query per runner instance.
      // Symlinks and directories are stable across queries; re-running every time
      // wastes ~10-30 syscalls per query for no benefit. Call invalidateSkillsSetup()
      // to force a re-run after the user installs or removes a skill.
      if (!this._skillsSetupDone) {
        // Set flag at start to prevent re-entrant calls from concurrent queries
        this._skillsSetupDone = true;

        // Ensure app Claude config directory exists
        if (!fs.existsSync(userAgentDir)) {
          fs.mkdirSync(userAgentDir, { recursive: true });
        }

        // Ensure app Claude skills directory exists
        const appSkillsDir = this.getRuntimeSkillsDir();
        if (!fs.existsSync(appSkillsDir)) {
          fs.mkdirSync(appSkillsDir, { recursive: true });
        }

        // Copy built-in skills to app Claude skills directory if they don't exist
        const builtinSkillsPath = this.getBuiltinSkillsPath();
        if (builtinSkillsPath && fs.existsSync(builtinSkillsPath)) {
          // Symlinks into .asar archives don't work at the OS level (ENOTDIR),
          // so always copy when the source is inside an asar archive.
          // Use regex to match .asar/ but NOT .asar.unpacked/ (which is a real directory).
          const sourceInsideAsar = /\.asar[/\\]/.test(builtinSkillsPath);
          const builtinSkills = fs.readdirSync(builtinSkillsPath);
          for (const skillName of builtinSkills) {
            const builtinSkillPath = path.join(builtinSkillsPath, skillName);
            const userSkillPath = path.join(appSkillsDir, skillName);

            // Clean up broken symlinks pointing into .asar from previous versions
            try {
              const lstat = fs.lstatSync(userSkillPath);
              if (lstat.isSymbolicLink()) {
                const linkTarget = fs.readlinkSync(userSkillPath);
                if (/\.asar[/\\]/.test(linkTarget)) {
                  fs.unlinkSync(userSkillPath);
                  log(`[CoworkAgentRunner] Removed broken asar symlink: ${userSkillPath}`);
                }
              }
            } catch {
              // Path doesn't exist — fine, we'll create it below
            }

            // Only set up if it's a directory and doesn't exist in app directory
            if (fs.statSync(builtinSkillPath).isDirectory() && !fs.existsSync(userSkillPath)) {
              if (sourceInsideAsar) {
                // Source is inside .asar — must copy (symlinks to asar paths fail at OS level)
                this.copyDirectorySync(builtinSkillPath, userSkillPath);
                log(`[CoworkAgentRunner] Copied built-in skill from asar: ${skillName}`);
              } else {
                // Source is a real directory — symlink for space efficiency
                try {
                  fs.symlinkSync(builtinSkillPath, userSkillPath, 'dir');
                  log(`[CoworkAgentRunner] Linked built-in skill: ${skillName}`);
                } catch (err) {
                  logWarn(
                    `[CoworkAgentRunner] Failed to symlink ${skillName}, copying instead:`,
                    err
                  );
                  this.copyDirectorySync(builtinSkillPath, userSkillPath);
                }
              }
            }
          }
        }

        this.syncUserSkillsToAppDir(appSkillsDir);
        this.syncConfiguredSkillsToRuntimeDir(appSkillsDir);
      }

      // Skill directories are resolved on disk (resolveSkillPaths) and surfaced to the
      // model through the assembled system prompt; codex discovers them via cwd/config.

      log('[CoworkAgentRunner] App agent dir:', userAgentDir);
      log('[CoworkAgentRunner] User working directory:', workingDir);

      logTiming('before building conversation context', runStartTime);

      // Resolve thinking level early. pi's discrete levels collapse to a codex reasoning
      // effort: enabled → 'medium', disabled → omitted (codex default).
      const enableThinking = configStore.get('enableThinking') ?? false;
      logCtx('[CoworkAgentRunner] Enable thinking mode:', enableThinking);
      const effort: string | undefined = enableThinking ? 'medium' : undefined;

      // Runtime signature — a change (provider/model/base URL/key/cwd) invalidates the
      // warm codex thread so a fresh thread is started with the new settings.
      const sessionRuntimeSignature = JSON.stringify({
        provider,
        model: modelConfig.model,
        providerId: modelConfig.providerId,
        baseUrl: modelConfig.provider.base_url,
        hasKey: Object.keys(modelConfig.env).length > 0,
        effectiveCwd,
      });
      const skillPaths = await this.resolveSkillPaths(session.id);
      const skillsSignature = JSON.stringify(skillPaths);
      log('[CoworkAgentRunner] Skill paths:', skillPaths);

      // Cold vs warm: a warm codex thread already holds the conversation server-side, so
      // the <conversation_history> preamble is only seeded into a NEW thread (open item c).
      let sessionMeta = this.codexSessionMeta.get(session.id);
      if (sessionMeta && sessionMeta.runtimeSignature !== sessionRuntimeSignature) {
        logCtx('[CoworkAgentRunner] Runtime changed, disposing codex thread:', session.id);
        this.codexRuntime?.disposeSession(session.id);
        this.codexSessionMeta.delete(session.id);
        sessionMeta = undefined;
      }
      if (sessionMeta && sessionMeta.skillsSignature !== skillsSignature) {
        logCtx('[CoworkAgentRunner] Skills changed, disposing codex thread:', session.id);
        this.codexRuntime?.disposeSession(session.id);
        this.codexSessionMeta.delete(session.id);
        sessionMeta = undefined;
      }
      const isColdStart = !sessionMeta;

      const extensionResult = this.extensionManager
        ? await this.extensionManager.beforeSessionRun({
            session,
            prompt,
            existingMessages,
            isColdStart,
          })
        : { promptPrefix: undefined, customTools: [] };

      let contextualPrompt = prompt;
      if (isColdStart) {
        // Cold start: inject recent history into prompt if available
        const conversationMessages = existingMessages.filter(
          (msg) => msg.role === 'user' || msg.role === 'assistant'
        );
        // Filter out messages that contain images (images can't be serialized into text preamble)
        const textOnlyMessages = conversationMessages.filter(
          (msg) => !msg.content.some((c) => (c as { type?: string }).type === 'image')
        );
        const historyMessages =
          textOnlyMessages.length > 0 &&
          textOnlyMessages[textOnlyMessages.length - 1]?.role === 'user'
            ? textOnlyMessages.slice(0, -1)
            : textOnlyMessages;

        if (historyMessages.length > 0) {
          // Content-aware chars-per-token estimation (CJK text uses ~1.5 chars/token vs ~4 for English)
          const contextWindow = codexContextWindow;
          const historyBudgetRatio = provider === 'ollama' && contextWindow < 16384 ? 0.15 : 0.3;
          const historyTokenBudget = Math.floor(contextWindow * historyBudgetRatio);

          // Sample recent messages to estimate chars-per-token ratio. Sampling the
          // full serialized form (text + thinking + tool blocks) gives a better CJK
          // ratio estimate than sampling text only.
          const sampleText = historyMessages
            .slice(-3)
            .map((m) => serializeMessageContentForHistory(m.content))
            .join('');
          const charsPerToken = estimateCharsPerToken(sampleText);
          const historyCharBudget = Math.floor(historyTokenBudget * charsPerToken);

          const historyItems: string[] = [];
          let charCount = 0;
          // Build from newest to oldest, then reverse. We preserve thinking and
          // tool blocks (not just text) so providers requiring reasoning/tool-call
          // replay (DeepSeek V4 Flash, and any thinking-capable model after a
          // cwd switch) continue to function after a cold start. See #162 Bug B.
          for (let i = historyMessages.length - 1; i >= 0; i--) {
            const msg = historyMessages[i];
            const serialized = serializeMessageContentForHistory(msg.content);
            if (serialized.length === 0) continue;
            const roleTag = msg.role === 'user' ? 'user' : 'assistant';
            const entry = `<turn role="${roleTag}">${serialized}</turn>`;
            if (charCount + entry.length > historyCharBudget) break;
            charCount += entry.length;
            historyItems.unshift(entry);
          }

          if (historyItems.length > 0) {
            const trimmedCount = historyMessages.length - historyItems.length;
            const historyNote =
              trimmedCount > 0 ? `[${trimmedCount} older messages omitted]\n` : '';
            const preamble = `<conversation_history>\n${historyNote}${historyItems.join('\n')}\n</conversation_history>`;
            contextualPrompt = `${preamble}\n\n${prompt}`;
            log(
              '[CoworkAgentRunner] Cold start: injecting',
              historyItems.length,
              'of',
              historyMessages.length,
              'history messages (budget:',
              historyCharBudget,
              'chars, used:',
              charCount,
              ', charsPerToken:',
              charsPerToken.toFixed(2),
              ')'
            );
          }
        }
      } else {
        // Reusing session — SDK already has the full conversation context
        logCtx('[CoworkAgentRunner] Reusing existing SDK session for:', session.id);
      }
      if (extensionResult.promptPrefix?.trim()) {
        contextualPrompt = `${extensionResult.promptPrefix.trim()}\n\n${contextualPrompt}`;
      }

      logTiming('before building MCP servers config', runStartTime);

      // Build MCP servers configuration for SDK
      // IMPORTANT: SDK uses tool names in format: mcp__<ServerKey>__<toolName>
      const mcpServers: Record<string, unknown> = {};
      if (this.mcpManager) {
        const serverStatuses = this.mcpManager.getServerStatus();
        const connectedServers = serverStatuses.filter((s) => s.connected);
        log('[CoworkAgentRunner] MCP server statuses:', safeStringify(serverStatuses));
        log('[CoworkAgentRunner] Connected MCP servers:', connectedServers.length);

        let allConfigs: ReturnType<typeof mcpConfigStore.getEnabledServers> = [];
        try {
          allConfigs = mcpConfigStore.getEnabledServers();
          log(
            '[CoworkAgentRunner] Enabled MCP configs:',
            allConfigs.map((c) => c.name)
          );
        } catch (error) {
          logWarn(
            '[CoworkAgentRunner] Failed to read enabled MCP configs; MCP tools will be unavailable this query',
            error
          );
          allConfigs = [];
        }

        // Cache key: serialized config list + imageCapable flag.  The bundled node
        // paths are stable for the lifetime of the process so they don't need to be
        // part of the fingerprint.
        const mcpFingerprint = JSON.stringify(allConfigs) + String(imageCapable);
        if (this._mcpServersCache?.fingerprint === mcpFingerprint) {
          Object.assign(mcpServers, this._mcpServersCache.servers);
          log('[CoworkAgentRunner] MCP servers config reused from cache');
        } else {
          // Use the module-level memoized helper — no more per-query fs.existsSync calls.
          const bundledNodePaths = getBundledNodePaths();
          const bundledNpx = bundledNodePaths?.npx ?? null;

          for (const config of allConfigs) {
            try {
              // Use a simpler key without spaces to avoid issues
              const serverKey = config.name;

              if (config.type === 'stdio') {
                // 当命令是 npx 或 node 时优先使用内置路径
                const command =
                  config.command === 'npx' && bundledNpx
                    ? bundledNpx
                    : config.command === 'node' && bundledNodePaths
                      ? bundledNodePaths.node
                      : config.command;

                // 使用内置 npx/node 时，将内置 node bin 注入 PATH
                const serverEnv = { ...config.env };
                if (bundledNodePaths && (config.command === 'npx' || config.command === 'node')) {
                  const nodeBinDir = path.dirname(bundledNodePaths.node);
                  const currentPath = process.env.PATH || '';
                  // Prepend bundled node bin to PATH so npx can find node
                  serverEnv.PATH = `${nodeBinDir}${path.delimiter}${currentPath}`;
                  log(`[CoworkAgentRunner]   Added bundled node bin to PATH: ${nodeBinDir}`);
                }

                if (!imageCapable) {
                  serverEnv.OPEN_COWORK_DISABLE_IMAGE_TOOL_OUTPUT = '1';
                }

                // Resolve path placeholders for presets
                let resolvedArgs = config.args || [];

                // Check if any args contain placeholders that need resolving
                const hasPlaceholders = resolvedArgs.some(
                  (arg) =>
                    arg.includes('{SOFTWARE_DEV_SERVER_PATH}') ||
                    arg.includes('{GUI_OPERATE_SERVER_PATH}')
                );

                if (hasPlaceholders) {
                  // Get the appropriate preset based on config name
                  let presetKey: string | null = null;
                  if (
                    config.name === 'Software_Development' ||
                    config.name === 'Software Development'
                  ) {
                    presetKey = 'software-development';
                  } else if (config.name === 'GUI_Operate' || config.name === 'GUI Operate') {
                    presetKey = 'gui-operate';
                  }

                  if (presetKey) {
                    const preset = mcpConfigStore.createFromPreset(presetKey, true);
                    if (preset && preset.args) {
                      resolvedArgs = preset.args;
                    }
                  }
                }

                mcpServers[serverKey] = {
                  type: 'stdio',
                  command,
                  args: resolvedArgs,
                  env: serverEnv,
                };
                log(`[CoworkAgentRunner] Added STDIO MCP server: ${serverKey}`);
                log(`[CoworkAgentRunner]   Command: ${command} ${resolvedArgs.join(' ')}`);
                log(`[CoworkAgentRunner]   Tools will be named: mcp__${serverKey}__<toolName>`);
              } else if (config.type === 'sse') {
                mcpServers[serverKey] = {
                  type: 'sse',
                  url: config.url,
                  headers: config.headers || {},
                };
                log(`[CoworkAgentRunner] Added SSE MCP server: ${serverKey}`);
              }
            } catch (error) {
              logError('[CoworkAgentRunner] Failed to prepare MCP server config, skipping server', {
                serverId: config.id,
                serverName: config.name,
                error: toErrorText(error),
              });
            }
          }

          // Store in cache for subsequent queries
          this._mcpServersCache = { fingerprint: mcpFingerprint, servers: { ...mcpServers } };
        }

        const mcpServersSummary = Object.entries(mcpServers).map(([name, serverConfig]) => {
          const typedServerConfig = serverConfig as {
            type?: string;
            command?: string;
            args?: unknown[];
            env?: Record<string, unknown>;
          };
          return {
            name,
            type: typedServerConfig.type ?? 'unknown',
            command: typedServerConfig.command ?? '',
            argsCount: Array.isArray(typedServerConfig.args) ? typedServerConfig.args.length : 0,
            envKeys: typedServerConfig.env ? Object.keys(typedServerConfig.env).length : 0,
          };
        });
        log('[CoworkAgentRunner] Final mcpServers summary:', safeStringify(mcpServersSummary, 2));
        if (process.env.COWORK_LOG_SDK_MESSAGES_FULL === '1') {
          log('[CoworkAgentRunner] Final mcpServers config:', safeStringify(mcpServers, 2));
        }
      }
      logTiming('after building MCP servers config', runStartTime);

      const workspaceInfoPrompt =
        useSandboxIsolation && sandboxPath
          ? `<workspace_info>
Your current workspace is located at: ${VIRTUAL_WORKSPACE_PATH}
This is an isolated sandbox environment. Use ${VIRTUAL_WORKSPACE_PATH} as the root path for file operations.
</workspace_info>`
          : workingDir
            ? `<workspace_info>Your current workspace is: ${workingDir}</workspace_info>`
            : '';

      // Build a concise summary of the agent's own runtime configuration.
      // Intentionally excludes API keys, base URLs, and any other sensitive data.
      const configSummaryPrompt = `<your_configuration>
- Model: ${modelConfig.model}
- Provider: ${provider}
- Context Window: ${codexContextWindow} tokens
- Max Output Tokens: ${runtimeConfig.maxTokens || 'default'}
- Thinking: ${enableThinking ? 'enabled' : 'disabled'}
- Sandbox: ${runtimeConfig.sandboxEnabled ? 'enabled' : 'disabled'}
- Memory: ${runtimeConfig.memoryEnabled ? 'enabled' : 'disabled'}
</your_configuration>`;

      const coworkAppendPrompt = [
        'You are an Open Cowork assistant. Be concise, accurate, and tool-capable.',
        `CRITICAL BEHAVIORAL RULES:
1. CHAT FIRST: By default, respond to the user in plain text within the conversation. Do NOT create, write, or edit files unless the user explicitly asks you to (e.g., "create a file", "write this to...", "edit the code", "save as...", mentions a specific file path, or describes code changes they want applied). For questions, summaries, explanations, analysis, and general conversation — always reply directly in chat text.
2. When a request is actionable, proceed immediately with reasonable assumptions. If you need clarification, ask briefly in plain text.
3. For relative time windows like "within two days" in browsing or research tasks, assume the most recent two relevant publication days unless the user explicitly defines another date range.
4. For bracketed placeholders like [Agent], [Topic], etc., treat the word inside brackets as the literal search keyword unless the user says otherwise.
5. When given a task, START DOING IT. Do not restate the task, do not list what you will do, do not ask for confirmation. Just execute.`,
        configSummaryPrompt,
        workspaceInfoPrompt,
        `<citation_requirements>
If your answer uses linkable content from MCP tools, include a "Sources:" section and otherwise use standard Markdown links: [Title](https://claude.ai/chat/URL).
</citation_requirements>`,
        `<tool_behavior>
Tool routing:
- If user explicitly asks to use Chrome/browser/web navigation, prioritize Chrome MCP tools (mcp__Chrome__*) over generic WebSearch/WebFetch.
- Use WebSearch/WebFetch only when Chrome MCP is unavailable or the user explicitly asks for generic web search.
</tool_behavior>`,
        this.getBundledPathHints(),
      ]
        .filter((section): section is string => Boolean(section && section.trim()))
        .join('\n\n');

      logTiming('before codex turn', runStartTime);

      // Bridge extension + MCP custom tools into codex host `dynamic_tools`. Rebuilt per
      // turn (open item d) so newly added / removed tools take effect on the next turn.
      const mcpCustomTools = this.mcpManager ? buildMcpCustomTools(this.mcpManager) : [];
      const extensionCustomTools = extensionResult.customTools || [];
      const customTools = [...mcpCustomTools, ...extensionCustomTools];
      if (mcpCustomTools.length > 0) {
        log(
          `[CoworkAgentRunner] Registered ${mcpCustomTools.length} MCP tools as codex host tools:`,
          mcpCustomTools.map((t) => t.name).join(', ')
        );
      }
      if (extensionCustomTools.length > 0) {
        log(
          `[CoworkAgentRunner] Registered ${extensionCustomTools.length} extension tools as codex host tools:`,
          extensionCustomTools.map((t) => t.name).join(', ')
        );
      }

      // Enrich process.env.PATH for build mode so bundled/user executables resolve.
      await enrichProcessPathForBuild();

      const runtime = this.ensureCodexRuntime();
      this.codexToolBridge?.setTools(adaptPiToolsToCodexHostTools(customTools));

      // ── Loop guard: protect against runaway tool-call loops ──
      // Layer 1 (hash of a message's tool-call group) fires when the final assistant
      // message is assembled; layer 2 (per-tool frequency) fires on each tool item start.
      const loopGuard = new LoopGuard();
      let hasEmittedError = false;
      let terminalErrorText: string | undefined;

      const handleLoopGuardDecision = (decision: LoopGuardDecision, context: string): void => {
        if (decision.action === 'none' || controller.signal.aborted) return;
        logWarn(`[LoopGuard] ${context}: action=${decision.action} reason=${decision.reason}`);

        if (decision.action === 'hash_abort' || decision.action === 'freq_abort') {
          // Always surface the loop-guard explanation so the user sees why it stopped.
          this.sendMessage(session.id, {
            id: uuidv4(),
            sessionId: session.id,
            role: 'assistant',
            content: [{ type: 'text', text: buildAbortUserMessage(decision) }],
            timestamp: Date.now(),
          });
          hasEmittedError = true;
          this.sendTraceUpdate(session.id, thinkingStepId, {
            status: 'error',
            title: 'Stopped: tool-call loop detected',
          });
          abortedByLoopGuard = true;
          controller.abort();
          // Stop the in-flight codex turn — the clean replacement for pi's abort().
          void runtime.interrupt(session.id).catch((err: unknown) => {
            logWarn('[LoopGuard] interrupt failed:', err);
          });
          return;
        }

        const steerText =
          decision.action === 'hash_halt' || decision.action === 'freq_halt'
            ? buildHaltSteerMessage(decision)
            : buildWarnSteerMessage(decision);
        // Loop-guard steering — first-class codex mid-turn user-message injection
        // (replaces pi's private sendUserMessage(..., { deliverAs: 'steer' })).
        void runtime.steer(session.id, steerText).catch((err: unknown) => {
          logWarn('[LoopGuard] steer failed:', err);
        });
      };

      const markError = (message: string, willRetry: boolean): void => {
        if (willRetry) {
          logWarn('[CoworkAgentRunner] Codex stream error (will retry):', message);
          return;
        }
        // A terminal stream error not already covered by an intentional stop. A user
        // cancel aborts the controller (with no flag set) and calls runtime.interrupt(),
        // which can surface a late turn/failed — mirror the old subscribe guard and ignore
        // any error once the turn has been intentionally aborted (cancel/timeout/loop guard).
        if (controller.signal.aborted || abortedByTimeout || abortedByLoopGuard) return;
        terminalErrorText = message;
        abortedByStreamError = true;
        if (!hasEmittedError) {
          hasEmittedError = true;
          this.sendMessage(session.id, {
            id: uuidv4(),
            sessionId: session.id,
            role: 'assistant',
            content: [
              { type: 'text', text: buildTerminalErrorMessage(toUserFacingErrorText(message), '') },
            ],
            timestamp: Date.now(),
          });
        }
        this.sendTraceUpdate(session.id, thinkingStepId, {
          status: 'error',
          title: 'Request failed',
        });
      };

      // Activity-based timeout: interrupt the turn after 5 min with no codex events.
      const PROMPT_TIMEOUT_MS = 5 * 60 * 1000;
      let activityTimeoutId: ReturnType<typeof setTimeout> | undefined;
      const resetActivityTimeout = () => {
        if (activityTimeoutId) clearTimeout(activityTimeoutId);
        activityTimeoutId = setTimeout(() => {
          logWarn('[CoworkAgentRunner] Codex turn timed out (no activity for 5 min), interrupting');
          abortedByTimeout = true;
          controller.abort();
          void runtime.interrupt(session.id).catch(() => {});
        }, PROMPT_TIMEOUT_MS);
      };

      // Register the per-run context the singleton codex emitters consult by session id.
      this.codexRunContexts.set(session.id, {
        sanitizeOutputPaths,
        loopGuard,
        handleLoopGuardDecision,
        markError,
        onActivity: resetActivityTimeout,
      });

      logTiming('before codex turn start', runStartTime);
      try {
        resetActivityTimeout();
        await runtime.runTurn({
          sessionId: session.id,
          input: contextualPrompt,
          model: modelConfig.model,
          modelProvider: modelConfig.providerId,
          cwd: effectiveCwd,
          ...(effort ? { effort } : {}),
          // System prompt seeds a NEW thread only; a warm thread already holds it.
          developerInstructions: coworkAppendPrompt,
          config: modelConfig.configOverrides,
        });
        // Turn completed — record the session as warm so the next turn reuses the codex
        // thread (server-side history) and skips the <conversation_history> preamble.
        this.codexSessionMeta.set(session.id, {
          runtimeSignature: sessionRuntimeSignature,
          skillsSignature,
        });
      } catch (turnErr: unknown) {
        // runTurn rejects on turn/failed or an intentional interrupt (loop guard / timeout /
        // user cancel / dispose). Only surface a fresh error when nothing already did.
        if (abortedByTimeout || abortedByLoopGuard || abortedByStreamError || hasEmittedError) {
          logCtx('[CoworkAgentRunner] Codex turn ended after an intentional stop');
        } else if (controller.signal.aborted) {
          logCtx('[CoworkAgentRunner] Codex turn ended after user cancel');
        } else {
          const errorText = toUserFacingErrorText(toErrorText(turnErr));
          terminalErrorText = errorText;
          hasEmittedError = true;
          this.sendMessage(session.id, {
            id: uuidv4(),
            sessionId: session.id,
            role: 'assistant',
            content: [{ type: 'text', text: `**Error**: ${errorText}` }],
            timestamp: Date.now(),
          });
          this.sendTraceUpdate(session.id, thinkingStepId, {
            status: 'error',
            title: 'Request failed',
          });
        }
      } finally {
        if (activityTimeoutId) clearTimeout(activityTimeoutId);
        this.codexRunContexts.delete(session.id);
      }

      logTiming('codex turn completed', runStartTime);

      // Timeout: surface the timeout message + trace state.
      if (abortedByTimeout) {
        logCtx('[CoworkAgentRunner] Aborted due to timeout');
        this.sendMessage(session.id, {
          id: uuidv4(),
          sessionId: session.id,
          role: 'assistant',
          content: [{ type: 'text', text: '**请求超时**：长时间未收到响应，操作已中止。' }],
          timestamp: Date.now(),
        });
        this.sendTraceUpdate(session.id, thinkingStepId, {
          status: 'error',
          title: 'Request timed out',
        });
        return;
      }
      // Loop-guard / stream-error already published their user-facing message + trace state.
      const abortDisposition = resolveAbortDisposition({
        abortedByTimeout,
        abortedByLoopGuard,
        abortedByStreamError,
      });
      if (shouldPreserveExistingTrace(abortDisposition)) {
        logCtx(
          `[CoworkAgentRunner] Turn stopped by ${abortDisposition === 'loop_guard' ? 'loop guard' : 'stream error'}`
        );
        return;
      }
      // User cancel: mark the trace cancelled (no error message).
      if (controller.signal.aborted) {
        logCtx('[CoworkAgentRunner] Aborted by user');
        this.sendTraceUpdate(session.id, thinkingStepId, {
          status: 'completed',
          title: 'Cancelled',
        });
        return;
      }
      // Complete - update the initial thinking step
      this.sendTraceUpdate(session.id, thinkingStepId, {
        status: terminalErrorText ? 'error' : 'completed',
        title: terminalErrorText ? 'Request failed' : 'Task completed',
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        const abortDisposition = resolveAbortDisposition({
          abortedByTimeout,
          abortedByLoopGuard,
          abortedByStreamError,
        });
        if (abortDisposition === 'timeout') {
          logCtx('[CoworkAgentRunner] Aborted due to timeout');
          const errorMsg: Message = {
            id: uuidv4(),
            sessionId: session.id,
            role: 'assistant',
            content: [{ type: 'text', text: '**请求超时**：长时间未收到响应，操作已中止。' }],
            timestamp: Date.now(),
          };
          this.sendMessage(session.id, errorMsg);
          this.sendTraceUpdate(session.id, thinkingStepId, {
            status: 'error',
            title: 'Request timed out',
          });
        } else if (abortDisposition === 'loop_guard') {
          // Loop guard already published the user-facing assistant message and
          // an 'error' trace step with the loop-detected title. Do NOT overwrite
          // them here with a 'completed/Cancelled' state.
          logCtx('[CoworkAgentRunner] Aborted by loop guard');
        } else if (abortDisposition === 'stream_error') {
          // Stream-error handling already published the user-facing assistant
          // message and the 'Request failed' trace state. Preserve them.
          logCtx('[CoworkAgentRunner] Aborted by stream error');
        } else {
          logCtx('[CoworkAgentRunner] Aborted by user');
          this.sendTraceUpdate(session.id, thinkingStepId, {
            status: 'completed',
            title: 'Cancelled',
          });
        }
      } else {
        logCtxError('[CoworkAgentRunner] Error:', error);

        const errorText = toUserFacingErrorText(toErrorText(error));
        const errorMsg: Message = {
          id: uuidv4(),
          sessionId: session.id,
          role: 'assistant',
          content: [{ type: 'text', text: `**Error**: ${errorText}` }],
          timestamp: Date.now(),
        };
        this.sendMessage(session.id, errorMsg);

        this.sendTraceStep(session.id, {
          id: uuidv4(),
          type: 'thinking',
          status: 'error',
          title: 'Error occurred',
          timestamp: Date.now(),
        });

        // Mark so session-manager doesn't report again
        if (error instanceof Error) {
          (error as Error & { alreadyReportedToUser?: boolean }).alreadyReportedToUser = true;
        }
      }
    } finally {
      this.activeControllers.delete(session.id);
      this.pathResolver.unregisterSession(session.id);

      // Sync changes from sandbox back to host OS (but don't cleanup - sandbox persists)
      if (useSandboxIsolation && sandboxPath) {
        try {
          const sandbox = getSandboxAdapter();

          if (sandbox.isWSL) {
            log('[CoworkAgentRunner] Syncing sandbox changes to Windows...');
            const syncResult = await SandboxSync.syncToWindows(session.id);
            if (syncResult.success) {
              log('[CoworkAgentRunner] Sync completed successfully');
            } else {
              logError('[CoworkAgentRunner] Sync failed:', syncResult.error);
            }
          } else if (sandbox.isLima) {
            log('[CoworkAgentRunner] Syncing sandbox changes to macOS...');
            const { LimaSync } = await import('../sandbox/lima-sync');
            const syncResult = await LimaSync.syncToMac(session.id);
            if (syncResult.success) {
              log('[CoworkAgentRunner] Sync completed successfully');
            } else {
              logError('[CoworkAgentRunner] Sync failed:', syncResult.error);
            }
          }
        } catch (syncErr) {
          logError('[CoworkAgentRunner] Sandbox sync error:', syncErr);
          this.sendMessage(session.id, {
            id: uuidv4(),
            sessionId: session.id,
            role: 'assistant',
            content: [
              {
                type: 'text',
                text: `**Warning**: Sandbox sync failed: ${syncErr instanceof Error ? syncErr.message : String(syncErr)}`,
              },
            ],
            timestamp: Date.now(),
          });
        }
      }
    }
  }

  /**
   * Manually trigger codex-native context compaction for a session's thread. Codex owns
   * the summarization; the resulting `thread/compacted` notification flows through the
   * runtime → `onCompaction` emitter → `compaction.result` (reduced payload, open item a).
   * The pi return shape is preserved for the interface but is always null now (there is no
   * synchronous summary/tokensBefore to return, and custom instructions are unsupported).
   */
  async compact(
    sessionId: string,
    _customInstructions?: string
  ): Promise<{
    summary: string;
    firstKeptEntryId: string;
    tokensBefore: number;
    details?: unknown;
  } | null> {
    if (!this.codexRuntime) {
      logWarn('[CoworkAgentRunner] No codex runtime for compact:', sessionId);
      return null;
    }
    log('[CoworkAgentRunner] Manual compact triggered for session:', sessionId);
    try {
      await this.codexRuntime.compact(sessionId);
      return null;
    } catch (err) {
      logError('[CoworkAgentRunner] compact error:', err);
      return null;
    }
  }

  /**
   * Get current context usage for a session. Codex has no synchronous context-usage API,
   * so this returns the last value aggregated from `thread/tokenUsage/updated`
   * notifications (see the onTokenUsage emitter), or null if none seen yet.
   */
  getContextUsage(
    sessionId: string
  ): { tokens: number | null; contextWindow: number; percent: number | null } | null {
    return this.codexContextUsage.get(sessionId) ?? null;
  }

  cancel(sessionId: string): void {
    const controller = this.activeControllers.get(sessionId);
    if (controller) controller.abort();
    // Stop the in-flight codex turn on the shared app-server (no-op if no active turn).
    void this.codexRuntime?.interrupt(sessionId).catch(() => {});
  }

  private sendTraceStep(sessionId: string, step: TraceStep): void {
    log(`[Trace] ${step.type}: ${step.title}`);
    this.sendToRenderer({ type: 'trace.step', payload: { sessionId, step } });
  }

  private sendTraceUpdate(sessionId: string, stepId: string, updates: Partial<TraceStep>): void {
    log(`[Trace] Update step ${stepId}:`, updates);
    this.sendToRenderer({ type: 'trace.update', payload: { sessionId, stepId, updates } });
  }

  private sendMessage(sessionId: string, message: Message): void {
    // Save message to database for persistence
    if (this.saveMessage) {
      this.saveMessage(message);
    }
    // Send to renderer for UI update
    this.sendToRenderer({ type: 'stream.message', payload: { sessionId, message } });
  }

  private sendPartial(sessionId: string, delta: string): void {
    this.sendToRenderer({ type: 'stream.partial', payload: { sessionId, delta } });
  }
}
