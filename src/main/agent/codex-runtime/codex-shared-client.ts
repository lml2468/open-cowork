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
import { getLastCodexModelEnvSignature } from './codex-one-shot-config';

const logger: CodexLogger = {
  log: (...args: unknown[]) => log('[codex-oneshot]', ...args),
  warn: (...args: unknown[]) => logWarn('[codex-oneshot]', ...args),
  error: (...args: unknown[]) => logError('[codex-oneshot]', ...args),
};

let sharedClient: CodexClient | null = null;
// The env signature the current shared app-server was spawned with. When the one-shot model
// env changes (credential/provider switch), the frozen app-server must be respawned.
let sharedClientEnvSignature: string | null = null;

/**
 * Return the process-wide shared codex client, constructing it (but not starting it) on
 * first call. The app-server child is spawned lazily by `runCodexOneShot` on first use.
 *
 * If the one-shot model env changed since the app-server was spawned (it captures
 * process.env at spawn and can't see later changes), the stale client is disposed and a
 * fresh one is created so codex reads the current API key via its `env_key`.
 */
export function getSharedCodexClient(): CodexClient {
  const currentSignature = getLastCodexModelEnvSignature();
  if (sharedClient && sharedClientEnvSignature !== currentSignature) {
    log('[codex-oneshot] model env changed — respawning shared app-server for fresh credentials');
    disposeSharedCodexClient();
  }
  if (sharedClient) return sharedClient;
  sharedClient = new CodexClient({
    clientInfo: { name: 'open-cowork', version: app.getVersion() },
    capabilities: { experimentalApi: true, requestAttestation: false },
    logger,
  });
  sharedClientEnvSignature = currentSignature;
  return sharedClient;
}

/** Dispose the shared client (kill its app-server child) and clear the singleton. */
export function disposeSharedCodexClient(): void {
  if (!sharedClient) return;
  sharedClient.dispose();
  sharedClient = null;
}
