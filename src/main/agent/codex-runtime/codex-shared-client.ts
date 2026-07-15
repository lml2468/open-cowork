/**
 * codex-shared-client — a lazy, process-wide singleton {@link CodexClient} used by the
 * utility one-shot call sites (session-title generation, the config API connectivity
 * probe, and the memory LLM) that run OUTSIDE `CoworkAgentRunner`.
 *
 * These callers don't need a per-session runtime; they only need a warm `codex
 * app-server` to run a single non-interactive turn. Sharing one client keeps a single
 * app-server process for all utility calls instead of spawning one per call.
 *
 * The client is constructed with the same experimental-API handshake the runner uses
 * (`ensureCodexRuntime`): `experimentalApi: true` is required for any `dynamicTools`
 * registration — the one-shots here register no tools, but the flag is harmless and
 * keeps the handshake identical to the runner's client.
 *
 * The client is constructed lazily and NOT started here; `runCodexOneShot` starts it on
 * first use (`isReady()` gate). `disposeSharedCodexClient` tears it down on shutdown.
 */

import { app } from 'electron';

import { log, logError, logWarn } from '../../utils/logger';
import { CodexClient, type CodexLogger } from './codex-client';

const logger: CodexLogger = {
  log: (...args: unknown[]) => log('[codex-oneshot]', ...args),
  warn: (...args: unknown[]) => logWarn('[codex-oneshot]', ...args),
  error: (...args: unknown[]) => logError('[codex-oneshot]', ...args),
};

let sharedClient: CodexClient | null = null;

/**
 * Return the process-wide shared codex client, constructing it (but not starting it) on
 * first call. The app-server child is spawned lazily by `runCodexOneShot` on first use.
 */
export function getSharedCodexClient(): CodexClient {
  if (sharedClient) return sharedClient;
  sharedClient = new CodexClient({
    clientInfo: { name: 'open-cowork', version: app.getVersion() },
    capabilities: { experimentalApi: true, requestAttestation: false },
    logger,
  });
  return sharedClient;
}

/** Dispose the shared client (kill its app-server child) and clear the singleton. */
export function disposeSharedCodexClient(): void {
  if (!sharedClient) return;
  sharedClient.dispose();
  sharedClient = null;
}
