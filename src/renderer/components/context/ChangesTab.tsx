import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../../store';
import { parseChanges, type ParsedDiffFile } from '../../utils/parse-diff';
import { DiffViewer } from './DiffViewer';
import {
  ChevronDown,
  ChevronRight,
  FileDiff,
  GitBranch,
  FolderOpen,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import type { TraceStep } from '../../types';

const EMPTY_STEPS: TraceStep[] = [];

interface ChangesState {
  isGitRepo: boolean;
  files: ParsedDiffFile[];
}

export function ChangesTab() {
  const { t } = useTranslation();
  const activeSessionId = useAppStore((s) => s.activeSessionId);
  const sessions = useAppStore((s) => s.sessions);
  const sessionStates = useAppStore((s) => s.sessionStates);
  const workingDir = useAppStore((s) => s.workingDir);

  const activeSession = activeSessionId ? sessions.find((s) => s.id === activeSessionId) : null;
  const currentWorkingDir = activeSession?.cwd || workingDir;
  const steps =
    (activeSessionId ? sessionStates[activeSessionId]?.traceSteps : undefined) ?? EMPTY_STEPS;
  const completedStepCount = useMemo(
    () => steps.reduce((n, s) => n + (s.status === 'completed' ? 1 : 0), 0),
    [steps]
  );

  const [state, setState] = useState<ChangesState | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (typeof window === 'undefined' || !window.electronAPI?.artifacts?.getChanges) {
      setState(null);
      return;
    }
    if (!currentWorkingDir) {
      setState(null);
      return;
    }
    setLoading(true);
    try {
      const result = await window.electronAPI.artifacts.getChanges(currentWorkingDir);
      setState({ isGitRepo: result.isGitRepo, files: parseChanges(result.files) });
    } catch (error) {
      console.error('Failed to load workspace changes:', error);
      setState(null);
    } finally {
      setLoading(false);
    }
  }, [currentWorkingDir]);

  // Refetch on mount and whenever tool activity settles (debounced).
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      if (!cancelled) {
        void load();
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [load, completedStepCount, steps.length]);

  const toggle = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const totals = useMemo(() => {
    if (!state) return { additions: 0, deletions: 0 };
    return state.files.reduce(
      (acc, f) => ({
        additions: acc.additions + f.additions,
        deletions: acc.deletions + f.deletions,
      }),
      { additions: 0, deletions: 0 }
    );
  }, [state]);

  if (!currentWorkingDir) {
    return <EmptyState icon={FolderOpen} message={t('context.changes.noWorkingDir')} />;
  }

  if (loading && !state) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-caption text-text-muted">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>{t('context.changes.loading')}</span>
      </div>
    );
  }

  if (state && !state.isGitRepo) {
    return <EmptyState icon={GitBranch} message={t('context.changes.notGitRepo')} />;
  }

  if (!state || state.files.length === 0) {
    return <EmptyState icon={FileDiff} message={t('context.changes.noChanges')} />;
  }

  return (
    <div className="flex flex-col overflow-y-auto">
      <div className="px-4 py-2.5 flex items-center gap-2 border-b border-border-muted">
        <span className="text-caption text-text-muted flex-1">
          {t('context.changes.fileCount', { count: state.files.length })}
        </span>
        <span className="text-caption font-medium text-success tabular-nums">
          +{totals.additions}
        </span>
        <span className="text-caption font-medium text-error tabular-nums">
          −{totals.deletions}
        </span>
        <button
          onClick={() => void load()}
          className="text-text-muted hover:text-text-primary transition-colors shrink-0 ml-1"
          title={t('context.changes.refresh')}
        >
          {loading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      <div className="divide-y divide-border-muted">
        {state.files.map((file) => {
          const isOpen = expanded.has(file.path);
          return (
            <div key={file.path}>
              <button
                onClick={() => toggle(file.path)}
                className="w-full px-4 py-2 flex items-center gap-2 hover:bg-surface-hover transition-colors text-left"
              >
                {isOpen ? (
                  <ChevronDown className="w-3.5 h-3.5 text-text-muted shrink-0" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-text-muted shrink-0" />
                )}
                <span className="text-caption text-text-primary truncate flex-1" title={file.path}>
                  {file.path}
                </span>
                {file.isBinary ? (
                  <span className="text-caption text-text-muted shrink-0">
                    {t('context.changes.binary')}
                  </span>
                ) : (
                  <>
                    <span className="text-caption text-success tabular-nums shrink-0">
                      +{file.additions}
                    </span>
                    <span className="text-caption text-error tabular-nums shrink-0">
                      −{file.deletions}
                    </span>
                  </>
                )}
              </button>
              {isOpen && !file.isBinary && (
                <div className="px-2 pb-2 border-t border-border-muted bg-surface">
                  <DiffViewer file={file} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EmptyState({ icon: Icon, message }: { icon: typeof FileDiff; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 px-4 text-center">
      <Icon className="w-6 h-6 text-text-muted/60" />
      <p className="text-caption text-text-muted">{message}</p>
    </div>
  );
}
