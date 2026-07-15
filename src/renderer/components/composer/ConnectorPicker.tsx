import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plug, Loader2 } from 'lucide-react';
import type { McpServerConfig, McpServerStatus } from '../../../shared/ipc-types';
import { useAppStore } from '../../store';
import { ComposerPopover } from './ComposerPopover';

/**
 * G9 — Composer connectors quick-toggle. A pill showing the active-connector
 * count with a popover to enable/disable each MCP connector for the session.
 * Toggling persists through the existing `mcp.saveServer` IPC; the header MCP
 * count reflects the change on its next status poll.
 */
export function ConnectorPicker() {
  const { t } = useTranslation();
  const setActiveView = useAppStore((s) => s.setActiveView);
  const [servers, setServers] = useState<McpServerConfig[] | null>(null);
  const [statuses, setStatuses] = useState<McpServerStatus[]>([]);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (typeof window === 'undefined' || !window.electronAPI) {
      setServers([]);
      return;
    }
    try {
      const [configs, status] = await Promise.all([
        window.electronAPI.mcp.getServers(),
        window.electronAPI.mcp.getServerStatus(),
      ]);
      setServers(configs);
      setStatuses(status);
    } catch (err) {
      console.error('[ConnectorPicker] Failed to load connectors:', err);
      setServers([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const connectedCount = statuses.filter((s) => s.connected).length;

  const handleToggle = async (server: McpServerConfig) => {
    if (typeof window === 'undefined' || !window.electronAPI) return;
    setTogglingId(server.id);
    try {
      await window.electronAPI.mcp.saveServer({ ...server, enabled: !server.enabled });
      await load();
    } catch (err) {
      console.error('[ConnectorPicker] Failed to toggle connector:', err);
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <ComposerPopover
      icon={Plug}
      label={
        connectedCount > 0
          ? t('chat.connectorCount', { count: connectedCount })
          : t('composer.connectors.pill')
      }
      title={t('composer.connectors.title')}
      active={connectedCount > 0}
    >
      {(close) => (
        <div className="flex flex-col overflow-y-auto py-1.5">
          <div className="px-3 py-1.5 text-label uppercase text-text-muted">
            {t('composer.connectors.title')}
          </div>
          {servers === null ? (
            <div className="px-3 py-4 text-body-sm text-text-muted text-center">
              {t('composer.connectors.loading')}
            </div>
          ) : servers.length === 0 ? (
            <button
              type="button"
              onClick={() => {
                close();
                setActiveView('connectors');
              }}
              className="mx-2 my-1 px-3 py-2 rounded-xl text-left text-body-sm text-accent hover:bg-surface-hover transition-colors"
            >
              {t('composer.connectors.empty')}
            </button>
          ) : (
            servers.map((server) => {
              const status = statuses.find((s) => s.id === server.id);
              const isConnected = Boolean(status?.connected);
              return (
                <button
                  key={server.id}
                  type="button"
                  disabled={togglingId === server.id}
                  onClick={() => handleToggle(server)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-surface-hover transition-colors disabled:opacity-60"
                >
                  <Plug
                    className={`w-3.5 h-3.5 flex-shrink-0 ${isConnected ? 'text-mcp' : 'text-text-muted'}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-body-sm font-medium text-text-primary truncate">
                      {server.name}
                    </span>
                    <span className="block text-caption text-text-muted">
                      {isConnected
                        ? t('composer.connectors.toolCount', { count: status?.toolCount ?? 0 })
                        : server.enabled
                          ? t('composer.connectors.connecting')
                          : t('composer.connectors.disabled')}
                    </span>
                  </span>
                  {togglingId === server.id ? (
                    <Loader2 className="w-4 h-4 text-text-muted animate-spin flex-shrink-0" />
                  ) : (
                    <span
                      className={`w-9 h-5 rounded-full flex-shrink-0 flex items-center px-0.5 transition-colors ${
                        server.enabled ? 'bg-accent justify-end' : 'bg-surface-active justify-start'
                      }`}
                    >
                      <span className="w-4 h-4 rounded-full bg-background block" />
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
    </ComposerPopover>
  );
}
