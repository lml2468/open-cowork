import { describe, it, expect } from 'vitest';
import type { MCPServerConfig } from '../../main/mcp/mcp-manager';
import {
  buildCodexMcpServerEntry,
  buildCodexMcpServersConfig,
  sanitizeMcpServerId,
} from '../../main/agent/codex-runtime/codex-mcp-config';

const stdio = (over: Partial<MCPServerConfig> = {}): MCPServerConfig => ({
  id: 'chrome',
  name: 'Chrome',
  type: 'stdio',
  command: 'npx',
  args: ['-y', 'chrome-devtools-mcp@latest'],
  env: { FOO: 'bar' },
  enabled: true,
  ...over,
});

describe('codex-mcp-config', () => {
  it('sanitizes server ids to codex-safe identifiers', () => {
    expect(sanitizeMcpServerId('GUI Operate')).toBe('GUI_Operate');
    expect(sanitizeMcpServerId('a.b/c')).toBe('a_b_c');
    expect(sanitizeMcpServerId('')).toBe('server');
  });

  it('maps a stdio server to command/args(array)/env(per-key)', () => {
    const entry = buildCodexMcpServerEntry(stdio());
    expect(entry['mcp_servers.chrome.command']).toBe('npx');
    expect(entry['mcp_servers.chrome.args']).toEqual(['-y', 'chrome-devtools-mcp@latest']);
    expect(entry['mcp_servers.chrome.env.FOO']).toBe('bar');
  });

  it('maps a streamable-http server to a url (+ headers)', () => {
    const entry = buildCodexMcpServerEntry({
      id: 'remote',
      name: 'Remote',
      type: 'streamable-http',
      url: 'https://mcp.example/v1',
      headers: { Authorization: 'Bearer x' },
      enabled: true,
    });
    expect(entry['mcp_servers.remote.url']).toBe('https://mcp.example/v1');
    expect(entry['mcp_servers.remote.http_headers.Authorization']).toBe('Bearer x');
  });

  it('skips a stdio server with no command', () => {
    expect(buildCodexMcpServerEntry(stdio({ command: '' }))).toEqual({});
  });

  it('merges multiple servers and skips inexpressible ones', () => {
    const merged = buildCodexMcpServersConfig([
      stdio({ id: 'chrome' }),
      stdio({ id: 'gui', command: undefined }),
    ]);
    expect(merged['mcp_servers.chrome.command']).toBe('npx');
    expect(Object.keys(merged).some((k) => k.startsWith('mcp_servers.gui'))).toBe(false);
  });
});
