import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store';
import { CompactionHistory } from './CompactionHistory';
import { PanelTabs, type PanelTab } from './context/PanelTabs';
import { ArtifactsTab } from './context/ArtifactsTab';
import { FilesTab } from './context/FilesTab';
import { ChangesTab } from './context/ChangesTab';
import { ChevronLeft, ChevronRight, MessageSquare, Cpu, Wrench } from 'lucide-react';
import type { TraceStep } from '../types';

const EMPTY_STEPS: TraceStep[] = [];

export function ContextPanel() {
  const { t } = useTranslation();
  const activeSessionId = useAppStore((s) => s.activeSessionId);
  const sessions = useAppStore((s) => s.sessions);
  const sessionStates = useAppStore((s) => s.sessionStates);
  const appConfig = useAppStore((s) => s.appConfig);
  const contextPanelCollapsed = useAppStore((s) => s.contextPanelCollapsed);
  const toggleContextPanel = useAppStore((s) => s.toggleContextPanel);

  const [activeTab, setActiveTab] = useState<PanelTab>('artifacts');

  const ss = activeSessionId ? sessionStates[activeSessionId] : undefined;
  const steps = ss?.traceSteps ?? EMPTY_STEPS;
  const activeSession = activeSessionId ? sessions.find((s) => s.id === activeSessionId) : null;

  const messages = useMemo(
    () => (activeSessionId ? sessionStates[activeSessionId]?.messages || [] : []),
    [activeSessionId, sessionStates]
  );
  const messageCount = messages.length;
  const toolCallCount = steps.filter((s) => s.type === 'tool_call').length;
  const modelName = activeSession?.model || appConfig?.model || '—';

  const tokenUsage = useMemo(() => {
    let input = 0;
    let output = 0;
    for (const msg of messages) {
      if (msg.tokenUsage) {
        input += msg.tokenUsage.input || 0;
        output += msg.tokenUsage.output || 0;
      }
    }
    return { input, output, total: input + output };
  }, [messages]);

  const contextUsage = useMemo(() => {
    const contextWindow = activeSessionId
      ? sessionStates[activeSessionId]?.contextWindow
      : undefined;
    if (!contextWindow) return null;

    let lastInput = 0;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].tokenUsage?.input) {
        lastInput = messages[i].tokenUsage!.input;
        break;
      }
    }
    if (lastInput === 0) return null;

    const percentage = Math.min((lastInput / contextWindow) * 100, 100);
    return { used: lastInput, total: contextWindow, percentage };
  }, [activeSessionId, sessionStates, messages]);

  if (contextPanelCollapsed) {
    return (
      <div className="w-10 bg-background border-l border-border-muted flex items-start justify-center pt-3">
        <button
          onClick={toggleContextPanel}
          className="icon-btn w-7 h-7"
          title={t('context.expandPanel')}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="w-context bg-background border-l border-border-muted flex flex-col overflow-hidden text-body-sm">
      {/* Header */}
      <div className="px-3 h-header flex items-center gap-2 border-b border-border-muted shrink-0">
        <button
          onClick={toggleContextPanel}
          className="icon-btn w-6 h-6"
          title={t('context.collapsePanel')}
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
        <span className="text-caption font-medium text-text-muted uppercase tracking-wider">
          {t('context.workspace')}
        </span>
      </div>

      {/* Session Stats */}
      {activeSession && (
        <div className="px-4 py-3 border-b border-border-muted space-y-1.5 shrink-0">
          <div className="flex items-center gap-1.5 text-text-primary font-medium">
            <Cpu className="w-3.5 h-3.5 text-text-muted shrink-0" />
            <span className="truncate">{modelName}</span>
          </div>
          <div className="flex items-center gap-3 text-caption text-text-muted pl-5">
            <span className="flex items-center gap-1">
              <MessageSquare className="w-3 h-3" />
              {messageCount}
            </span>
            <span className="flex items-center gap-1">
              <Wrench className="w-3 h-3" />
              {toolCallCount}
            </span>
            {tokenUsage.total > 0 && (
              <span className="ml-auto text-text-muted/70">
                {t('context.inputTokens')} {formatTokenCount(tokenUsage.input)} ·{' '}
                {t('context.outputTokens')} {formatTokenCount(tokenUsage.output)}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Context Usage */}
      {activeSession && contextUsage && (
        <div className="px-4 py-2.5 border-b border-border-muted space-y-1.5 shrink-0">
          <div className="flex items-center justify-between">
            <span className="text-caption font-medium text-text-muted uppercase tracking-wider">
              {t('context.contextUsage')}
            </span>
            <span
              className={`text-caption font-medium ${
                contextUsage.percentage > 95
                  ? 'text-error'
                  : contextUsage.percentage > 80
                    ? 'text-warning'
                    : 'text-text-primary'
              }`}
            >
              {Math.round(contextUsage.percentage)}%
            </span>
          </div>
          <div className="h-1.5 bg-surface-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ease-out ${
                contextUsage.percentage > 95
                  ? 'bg-error'
                  : contextUsage.percentage > 80
                    ? 'bg-warning'
                    : 'bg-gradient-to-r from-accent to-accent-hover'
              }`}
              style={{ width: `${contextUsage.percentage}%` }}
            />
          </div>
          <p className="text-caption text-text-muted">
            {t('context.contextUsageLabel', {
              used: formatTokenCount(contextUsage.used),
              total: formatTokenCount(contextUsage.total),
            })}
          </p>
        </div>
      )}

      {/* Compaction History */}
      {activeSession && <CompactionHistory />}

      {/* Tabs */}
      <PanelTabs active={activeTab} onChange={setActiveTab} />

      {/* Active tab content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {activeTab === 'artifacts' && <ArtifactsTab />}
        {activeTab === 'files' && <FilesTab />}
        {activeTab === 'changes' && <ChangesTab />}
      </div>
    </div>
  );
}

function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}
