import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../../store';
import { resolveArtifactPath } from '../../utils/artifact-path';
import {
  extractFilePathFromToolInput,
  extractFilePathFromToolOutput,
} from '../../utils/tool-output-path';
import {
  getArtifactLabel,
  getArtifactIconComponent,
  getArtifactSteps,
} from '../../utils/artifact-steps';
import { useIPC } from '../../hooks/useIPC';
import {
  ChevronDown,
  ChevronRight,
  FileText,
  FileSpreadsheet,
  FilePieChart,
  FileCode2,
  FileArchive,
  FileAudio2,
  FileVideo,
  Image as ImageIcon,
  FolderOpen,
  FolderSync,
  File,
  Check,
  Loader2,
  Plug,
  Wrench,
  Copy,
  Layers,
} from 'lucide-react';
import type { TraceStep, MCPServerInfo, ContentBlock, ToolUseContent } from '../../types';
import { getMcpToolDisplayName } from '../message/toolHelpers';

const EMPTY_STEPS: TraceStep[] = [];

export function ArtifactsTab() {
  const { t } = useTranslation();
  const activeSessionId = useAppStore((s) => s.activeSessionId);
  const sessions = useAppStore((s) => s.sessions);
  const sessionStates = useAppStore((s) => s.sessionStates);
  const workingDir = useAppStore((s) => s.workingDir);
  const setGlobalNotice = useAppStore((s) => s.setGlobalNotice);
  const { getMCPServers, changeWorkingDir } = useIPC();

  const [expandedConnector, setExpandedConnector] = useState<string | null>(null);
  const [mcpServers, setMcpServers] = useState<MCPServerInfo[]>([]);
  const [copiedPath, setCopiedPath] = useState(false);
  const [isChangingDir, setIsChangingDir] = useState(false);
  const [recentWorkspaceFiles, setRecentWorkspaceFiles] = useState<
    Array<{ path: string; modifiedAt: number; size: number }>
  >([]);

  const ss = activeSessionId ? sessionStates[activeSessionId] : undefined;
  const steps = ss?.traceSteps ?? EMPTY_STEPS;
  const activeSession = activeSessionId ? sessions.find((s) => s.id === activeSessionId) : null;
  const currentWorkingDir = activeSession?.cwd || workingDir;
  const { displayArtifactSteps } = getArtifactSteps(steps);
  const canShowItemInFolder =
    typeof window !== 'undefined' && !!window.electronAPI?.showItemInFolder;

  const messages = useMemo(
    () => (activeSessionId ? sessionStates[activeSessionId]?.messages || [] : []),
    [activeSessionId, sessionStates]
  );

  const completedStepCount = useMemo(
    () => steps.reduce((n, s) => n + (s.status === 'completed' ? 1 : 0), 0),
    [steps]
  );

  const handleCopyPath = async (path: string) => {
    try {
      let shellPath = path;
      if (path.includes(' ')) {
        const isWindows = window.electronAPI?.platform === 'win32';
        shellPath = isWindows ? `"${path}"` : path.replace(/ /g, '\\ ');
      }
      await navigator.clipboard.writeText(shellPath);
      setCopiedPath(true);
      setTimeout(() => setCopiedPath(false), 2000);
    } catch (err) {
      console.error('Failed to copy path:', err);
    }
  };

  const mcpToolDisplayNames = useMemo(() => {
    const displayNames = new Map<string, string>();
    for (const msg of messages) {
      if (!Array.isArray(msg.content)) {
        continue;
      }
      for (const block of msg.content as ContentBlock[]) {
        if (block.type !== 'tool_use') {
          continue;
        }
        const toolUse = block as ToolUseContent;
        if (!toolUse.name.startsWith('mcp__')) {
          continue;
        }
        displayNames.set(toolUse.name, getMcpToolDisplayName(toolUse.name, toolUse.displayName));
      }
    }
    for (const step of steps) {
      if (step.type !== 'tool_call' || !step.toolName?.startsWith('mcp__')) {
        continue;
      }
      if (!displayNames.has(step.toolName)) {
        displayNames.set(step.toolName, getMcpToolDisplayName(step.toolName, step.title));
      }
    }
    return displayNames;
  }, [messages, steps]);

  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      !window.electronAPI?.artifacts?.listRecentFiles ||
      !currentWorkingDir ||
      !activeSession?.createdAt
    ) {
      setRecentWorkspaceFiles([]);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const files = await window.electronAPI.artifacts.listRecentFiles(
          currentWorkingDir,
          activeSession.createdAt,
          50
        );
        if (!cancelled) {
          setRecentWorkspaceFiles(files || []);
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to load recent workspace files:', error);
          setRecentWorkspaceFiles([]);
        }
      }
    }, 500);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [activeSession?.createdAt, steps.length, completedStepCount, currentWorkingDir]);

  const displayArtifacts = useMemo(() => {
    const seenPaths = new Set<string>();
    const items: Array<{ label: string; path: string }> = [];

    for (const step of displayArtifactSteps) {
      const fallbackPath =
        extractFilePathFromToolOutput(step.toolOutput) ||
        extractFilePathFromToolInput(step.toolInput);
      if (!fallbackPath) {
        continue;
      }
      const resolvedPath = resolveArtifactPath(fallbackPath, currentWorkingDir);
      const key = resolvedPath.trim();
      if (!key || seenPaths.has(key)) {
        continue;
      }
      seenPaths.add(key);
      items.push({ label: getArtifactLabel(fallbackPath), path: resolvedPath });
    }

    for (const file of recentWorkspaceFiles) {
      const resolvedPath = resolveArtifactPath(file.path, currentWorkingDir);
      const key = resolvedPath.trim();
      if (!key || seenPaths.has(key)) {
        continue;
      }
      seenPaths.add(key);
      items.push({ label: getArtifactLabel(file.path), path: resolvedPath });
    }

    return items;
  }, [currentWorkingDir, displayArtifactSteps, recentWorkspaceFiles]);

  useEffect(() => {
    const loadMCPServers = async () => {
      try {
        const servers = await getMCPServers();
        setMcpServers(servers || []);
      } catch (error) {
        console.error('Failed to load MCP servers:', error);
      }
    };
    loadMCPServers();
    const interval = setInterval(loadMCPServers, 30000);
    return () => clearInterval(interval);
  }, [getMCPServers]);

  return (
    <div className="flex flex-col overflow-y-auto">
      {/* Artifacts */}
      <div className="border-b border-border-muted">
        <div className="px-4 py-2.5">
          <p className="text-caption font-medium text-text-muted uppercase tracking-wider mb-2">
            {t('context.artifacts')}
          </p>
          {displayArtifacts.length === 0 ? (
            <div className="flex items-center gap-2 py-1 text-caption text-text-muted">
              <Layers className="w-3.5 h-3.5 shrink-0" />
              <span>{t('context.noArtifactsYet')}</span>
            </div>
          ) : (
            <div className="space-y-0.5">
              {displayArtifacts.map((artifact, index) => {
                const label = artifact.label || t('context.fileCreated');
                const artifactPath = artifact.path;
                const canClick = Boolean(artifactPath && canShowItemInFolder);
                const IconComponent = artifactIcon(getArtifactIconComponent(label));

                return (
                  <div
                    key={artifact.path || artifact.label || `artifact-${index}`}
                    className={`flex items-center gap-2 py-1.5 transition-colors rounded-lg px-2 -mx-2 ${canClick ? 'cursor-pointer hover:bg-surface-hover' : ''}`}
                    onClick={async () => {
                      if (!canClick) return;
                      const revealed = await window.electronAPI.showItemInFolder(
                        artifactPath,
                        currentWorkingDir ?? undefined
                      );
                      if (!revealed) {
                        setGlobalNotice({
                          id: `artifact-reveal-failed-${Date.now()}`,
                          type: 'warning',
                          message: t('context.revealFailed'),
                        });
                      }
                    }}
                    title={artifactPath || undefined}
                  >
                    <IconComponent className="w-3.5 h-3.5 text-text-muted shrink-0" />
                    <span className="text-caption text-text-primary truncate">{label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Working Directory */}
      <div className="border-b border-border-muted">
        <div className="px-4 py-2.5">
          <p className="text-caption font-medium text-text-muted uppercase tracking-wider mb-2">
            {t('context.workingDirectory')}
          </p>
          <div className="flex items-center gap-1.5 min-w-0">
            <FolderOpen className="w-3.5 h-3.5 text-text-muted shrink-0" />
            <span
              className={`text-caption truncate flex-1 ${currentWorkingDir ? 'text-text-primary cursor-pointer hover:text-accent-primary transition-colors' : 'text-text-muted'}`}
              title={currentWorkingDir ? t('context.openInFileManager') : ''}
              onClick={() =>
                currentWorkingDir && window.electronAPI?.showItemInFolder(currentWorkingDir)
              }
            >
              {currentWorkingDir ? formatPath(currentWorkingDir) : t('context.noFolderSelected')}
            </span>
            {currentWorkingDir && (
              <button
                onClick={() => handleCopyPath(currentWorkingDir)}
                className="text-text-muted hover:text-text-primary transition-colors shrink-0 ml-1"
                title={t('context.copyPath')}
              >
                {copiedPath ? (
                  <Check className="w-3 h-3 text-success" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
              </button>
            )}
            <button
              onClick={async () => {
                setIsChangingDir(true);
                try {
                  const result = await changeWorkingDir(
                    activeSessionId || undefined,
                    currentWorkingDir || undefined
                  );
                  if (!result.success && result.error && result.error !== 'User cancelled') {
                    setGlobalNotice({
                      id: `change-dir-failed-${Date.now()}`,
                      type: 'warning',
                      message: `${t('context.changeDirFailed')}: ${result.error}`,
                    });
                  }
                } catch (error) {
                  setGlobalNotice({
                    id: `change-dir-failed-${Date.now()}`,
                    type: 'error',
                    message:
                      error instanceof Error && error.message
                        ? `${t('context.changeDirFailed')}: ${error.message}`
                        : t('context.changeDirFailed'),
                  });
                } finally {
                  setIsChangingDir(false);
                }
              }}
              disabled={isChangingDir}
              className="text-text-muted hover:text-text-primary disabled:opacity-50 transition-colors shrink-0"
              title={t('context.changeDir')}
            >
              {isChangingDir ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <FolderSync className="w-3 h-3" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* MCP Connectors */}
      <div className="px-4 py-2.5">
        <p className="text-caption font-medium text-text-muted uppercase tracking-wider mb-2">
          {t('context.mcpConnectors')}
        </p>
        {mcpServers.length === 0 ? (
          <div className="flex items-center gap-2 text-caption text-text-muted py-1">
            <Plug className="w-3.5 h-3.5 shrink-0" />
            <span>{t('mcp.noConnectors')}</span>
          </div>
        ) : (
          <div className="space-y-0.5">
            {mcpServers.map((server) => (
              <ConnectorItem
                key={server.id}
                server={server}
                steps={steps}
                mcpToolDisplayNames={mcpToolDisplayNames}
                expanded={expandedConnector === server.id}
                onToggle={() =>
                  setExpandedConnector(expandedConnector === server.id ? null : server.id)
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function artifactIcon(kind: string) {
  switch (kind) {
    case 'presentation':
      return FilePieChart;
    case 'table':
      return FileSpreadsheet;
    case 'document':
      return FileText;
    case 'code':
      return FileCode2;
    case 'image':
      return ImageIcon;
    case 'audio':
      return FileAudio2;
    case 'video':
      return FileVideo;
    case 'archive':
      return FileArchive;
    default:
      return File;
  }
}

function ConnectorItem({
  server,
  steps,
  mcpToolDisplayNames,
  expanded,
  onToggle,
}: {
  server: MCPServerInfo;
  steps: TraceStep[];
  mcpToolDisplayNames: Map<string, string>;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const serverNamePattern = server.name.replace(/\s+/g, '_');

  const mcpToolsUsed = steps
    .filter((s) => s.toolName?.startsWith('mcp__'))
    .map((s) => s.toolName!)
    .filter((name, index, self) => self.indexOf(name) === index)
    .filter((name) => {
      const match = name.match(/^mcp__(.+?)__(.+)$/);
      if (match) {
        return match[1] === serverNamePattern;
      }
      return false;
    });

  const usageCount = steps.filter(
    (s) => s.toolName?.startsWith('mcp__') && mcpToolsUsed.includes(s.toolName)
  ).length;

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <button
        onClick={onToggle}
        className={`w-full px-3 py-2 flex items-center gap-2 transition-colors ${
          server.connected ? 'bg-mcp/10 hover:bg-mcp/20' : 'bg-surface-muted hover:bg-surface-hover'
        }`}
      >
        <div
          className={`w-6 h-6 rounded flex items-center justify-center ${
            server.connected ? 'bg-mcp/20' : 'bg-surface-muted'
          }`}
        >
          <Plug className={`w-3.5 h-3.5 ${server.connected ? 'text-mcp' : 'text-text-muted'}`} />
        </div>
        <div className="flex-1 text-left min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-body-sm font-medium text-text-primary truncate">
              {server.name}
            </span>
            {!server.connected && (
              <span className="text-caption text-text-muted">({t('mcp.notConnected')})</span>
            )}
          </div>
          {server.connected && (
            <p className="text-caption text-text-muted">
              {t('mcp.toolCount', { count: server.toolCount })}
              {usageCount > 0 && ` • ${t('mcp.callCount', { count: usageCount })}`}
            </p>
          )}
        </div>
        {server.connected &&
          (expanded ? (
            <ChevronDown className="w-4 h-4 text-text-muted" />
          ) : (
            <ChevronRight className="w-4 h-4 text-text-muted" />
          ))}
      </button>

      {expanded && server.connected && (
        <div className="px-3 pb-2 space-y-1 bg-surface">
          {mcpToolsUsed.length > 0 ? (
            <>
              <p className="text-caption text-text-muted px-2 py-1">
                {t('context.toolsUsedLabel')}
              </p>
              {mcpToolsUsed.map((toolName, index) => {
                const count = steps.filter((s) => s.toolName === toolName).length;
                const readableName =
                  mcpToolDisplayNames.get(toolName) || getMcpToolDisplayName(toolName);
                return (
                  <div
                    key={index}
                    className="flex items-center gap-2 px-2 py-1.5 rounded bg-mcp/5 hover:bg-mcp/10 transition-colors"
                  >
                    <Wrench className="w-3.5 h-3.5 text-mcp" />
                    <span className="text-caption text-text-primary flex-1">{readableName}</span>
                    <span className="text-caption text-text-muted">{count}x</span>
                  </div>
                );
              })}
            </>
          ) : (
            <p className="text-caption text-text-muted px-2 py-1">{t('context.noToolsUsedYet')}</p>
          )}
        </div>
      )}
    </div>
  );
}

function formatPath(path: string): string {
  if (!path) return '';
  const winHome = /^[A-Z]:\\Users\\[^\\]+/i;
  const winMatch = path.match(winHome);
  if (winMatch) {
    return '~' + path.slice(winMatch[0].length).replace(/\\/g, '/');
  }
  const unixHome = /^\/(?:Users|home)\/[^/]+/;
  const unixMatch = path.match(unixHome);
  if (unixMatch) {
    return '~' + path.slice(unixMatch[0].length);
  }
  return path;
}
