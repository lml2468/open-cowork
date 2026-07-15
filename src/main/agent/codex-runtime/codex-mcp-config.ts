import type { MCPServerConfig } from '../../mcp/mcp-manager';

/**
 * codex-mcp-config — translate the app's MCP server configs into codex `mcp_servers.*`
 * config-override entries so codex connects to them **natively** (codex owns the `mcp__`
 * tool namespace), instead of the app proxying each MCP tool as a host `dynamic_tools`
 * entry (which collides: "dynamic tool name is reserved: mcp__…").
 *
 * The values are strings codex parses as TOML (the same dotted-config mechanism the app
 * already uses for `model_providers.*`, verified via `codex -c 'mcp_servers.x.command=…'`).
 * Arrays are emitted as TOML/JSON array literals; env is emitted per-key as
 * `mcp_servers.<id>.env.<KEY>`.
 *
 * NOTE (ownership): codex SPAWNS the stdio servers itself from this spec, so the spec must
 * be fully resolved (absolute command path / resolved args / complete env) by the caller —
 * codex does not inherit the app's shell-PATH/NODE_PATH resolution. Servers the app must
 * keep owning (OAuth, host-only readiness) should be excluded by the caller.
 */

/** A codex-safe server key: codex identifiers allow [A-Za-z0-9_-]; sanitize the app id. */
export function sanitizeMcpServerId(id: string): string {
  const cleaned = id.replace(/[^A-Za-z0-9_-]/g, '_');
  return cleaned.length > 0 ? cleaned : 'server';
}

/**
 * Build the flattened `mcp_servers.*` config overrides for one server. Returns an empty
 * object for a server that can't be expressed (no command and no url).
 */
export function buildCodexMcpServerEntry(config: MCPServerConfig): Record<string, string> {
  const id = sanitizeMcpServerId(config.id || config.name);
  const prefix = `mcp_servers.${id}`;
  const out: Record<string, string> = {};

  if (config.type === 'stdio') {
    if (!config.command || config.command.trim().length === 0) return {};
    out[`${prefix}.command`] = config.command;
    if (config.args && config.args.length > 0) {
      out[`${prefix}.args`] = JSON.stringify(config.args);
    }
    if (config.cwd && config.cwd.trim().length > 0) {
      out[`${prefix}.cwd`] = config.cwd;
    }
    if (config.env) {
      for (const [key, value] of Object.entries(config.env)) {
        if (typeof value === 'string') out[`${prefix}.env.${key}`] = value;
      }
    }
    return out;
  }

  // sse / streamable-http → codex streamable-http transport (url-based).
  if (config.url && config.url.trim().length > 0) {
    out[`${prefix}.url`] = config.url;
    if (config.headers) {
      for (const [key, value] of Object.entries(config.headers)) {
        if (typeof value === 'string') out[`${prefix}.http_headers.${key}`] = value;
      }
    }
    return out;
  }

  return {};
}

/**
 * Build the merged `mcp_servers.*` config overrides for a list of servers (typically the
 * enabled set). Servers that can't be expressed are skipped.
 */
export function buildCodexMcpServersConfig(servers: MCPServerConfig[]): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const server of servers) {
    Object.assign(merged, buildCodexMcpServerEntry(server));
  }
  return merged;
}
