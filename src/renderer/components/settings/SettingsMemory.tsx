import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  MemoryDebugFileContent,
  MemoryDebugFileInfo,
  MemoryOverview,
  MemoryReadResult,
  MemoryRuntimeConfig,
  MemorySearchResult,
} from '../../types';
import { useAppStore } from '../../store';
import { SettingsContentSection } from './shared';

const DEFAULT_MEMORY_RUNTIME: MemoryRuntimeConfig = {
  llm: {
    inheritFromActive: true,
    apiKey: '',
    baseUrl: '',
    model: '',
    timeoutMs: 180000,
  },
  storageRoot: '',
};

function cloneRuntimeConfig(runtime?: MemoryRuntimeConfig): MemoryRuntimeConfig {
  const source = runtime || DEFAULT_MEMORY_RUNTIME;
  return {
    llm: { ...DEFAULT_MEMORY_RUNTIME.llm, ...source.llm },
    storageRoot: source.storageRoot ?? DEFAULT_MEMORY_RUNTIME.storageRoot,
  };
}

export function SettingsMemory() {
  const { t } = useTranslation();
  const appConfig = useAppStore((state) => state.appConfig);

  const [overview, setOverview] = useState<MemoryOverview | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MemorySearchResult[]>([]);
  const [selected, setSelected] = useState<MemoryReadResult | null>(null);
  const [files, setFiles] = useState<MemoryDebugFileInfo[]>([]);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<MemoryDebugFileContent | null>(null);
  const [runtimeDraft, setRuntimeDraft] = useState<MemoryRuntimeConfig>(
    cloneRuntimeConfig(appConfig?.memoryRuntime)
  );
  const [isBusy, setIsBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const enabled = overview?.enabled ?? appConfig?.memoryEnabled ?? true;

  useEffect(() => {
    setRuntimeDraft(cloneRuntimeConfig(appConfig?.memoryRuntime));
  }, [appConfig?.memoryRuntime]);

  const refreshOverview = async () => {
    const nextOverview = await window.electronAPI.memory.getOverview();
    setOverview(nextOverview);
  };

  const refreshFiles = async () => {
    const nextFiles = await window.electronAPI.memory.listFiles();
    setFiles(nextFiles);
    if (selectedFilePath && nextFiles.some((item) => item.filePath === selectedFilePath)) {
      const nextContent = await window.electronAPI.memory.readFile(selectedFilePath);
      setFileContent(nextContent);
    } else {
      setSelectedFilePath(null);
      setFileContent(null);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [nextOverview, nextFiles] = await Promise.all([
          window.electronAPI.memory.getOverview(),
          window.electronAPI.memory.listFiles(),
        ]);
        if (!cancelled) {
          setOverview(nextOverview);
          setFiles(nextFiles);
        }
      } catch (error) {
        if (!cancelled) {
          setStatus(error instanceof Error ? error.message : String(error));
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleToggle = async () => {
    setIsBusy(true);
    setStatus(null);
    try {
      await window.electronAPI.memory.setEnabled(!enabled);
      await refreshOverview();
      setStatus(!enabled ? t('memory.enabledStatus') : t('memory.disabledStatus'));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsBusy(false);
    }
  };

  const handleSearch = async () => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setSelected(null);
      return;
    }
    setIsBusy(true);
    setStatus(null);
    try {
      const nextResults = await window.electronAPI.memory.search({
        query: trimmed,
        limit: 20,
      });
      setResults(nextResults);
      if (nextResults.length > 0) {
        const detail = await window.electronAPI.memory.read(nextResults[0].id);
        setSelected(detail);
      } else {
        setSelected(null);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsBusy(false);
    }
  };

  const handleSelectResult = async (id: string) => {
    setIsBusy(true);
    setStatus(null);
    try {
      const detail = await window.electronAPI.memory.read(id);
      setSelected(detail);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsBusy(false);
    }
  };

  const handleSelectFile = async (filePath: string) => {
    setIsBusy(true);
    setStatus(null);
    try {
      const nextContent = await window.electronAPI.memory.readFile(filePath);
      setSelectedFilePath(filePath);
      setFileContent(nextContent);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsBusy(false);
    }
  };

  const handleSaveRuntime = async () => {
    setIsBusy(true);
    setStatus(null);
    try {
      await window.electronAPI.config.save({
        memoryRuntime: runtimeDraft,
      });
      await refreshOverview();
      setStatus(t('memory.runtimeSaved', '记忆运行时配置已保存'));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsBusy(false);
    }
  };

  const handleClearCore = async () => {
    if (!window.confirm(t('memory.clearCoreConfirm'))) {
      return;
    }
    setIsBusy(true);
    setStatus(null);
    try {
      await window.electronAPI.memory.clearCoreMemory();
      setResults([]);
      setSelected(null);
      await Promise.all([refreshOverview(), refreshFiles()]);
      setStatus(t('memory.clearCoreSuccess'));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <SettingsContentSection title={t('memory.title')} description={t('memory.description')}>
        <div className="flex flex-col gap-3 rounded-xl border border-border-muted bg-background-secondary/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-body-sm font-medium text-text-primary">
                {enabled ? t('memory.enabled') : t('memory.disabled')}
              </p>
              <p className="mt-1 text-caption text-text-muted">{t('memory.toggleHint')}</p>
            </div>
            <button
              onClick={() => {
                void handleToggle();
              }}
              disabled={isBusy}
              className={`rounded-lg px-4 py-2 text-body-sm font-medium transition-colors ${
                enabled
                  ? 'bg-accent text-on-accent hover:opacity-90'
                  : 'bg-surface hover:bg-surface-hover text-text-primary border border-border'
              } disabled:cursor-not-allowed disabled:opacity-60`}
            >
              {enabled ? t('memory.disableAction') : t('memory.enableAction')}
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <MetricCard label={t('memory.coreCount')} value={overview?.coreCount ?? 0} />
            <InfoCard
              label={t('memory.latestIngestion')}
              value={
                overview?.latestIngestionAt
                  ? new Date(overview.latestIngestionAt).toLocaleString()
                  : t('memory.noIngestionYet')
              }
            />
            <InfoCard
              label={t('memory.health')}
              value={
                overview?.failedSessionCount
                  ? t('memory.failedSessions', { count: overview.failedSessionCount })
                  : t('memory.healthy')
              }
              secondary={overview?.latestError || undefined}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-1">
            <InfoCard
              label={t('memory.storageRoot', '存储根目录')}
              value={overview?.storageRoot || runtimeDraft.storageRoot || 'Default userData/memory'}
            />
          </div>
        </div>
      </SettingsContentSection>

      <SettingsContentSection
        title={t('memory.runtimeTitle', '运行时配置')}
        description={t(
          'memory.runtimeDescription',
          '默认继承当前激活的 API 配置。这里可调节 core memory 使用的模型与落盘目录。'
        )}
      >
        <div className="space-y-4 rounded-xl border border-border-muted bg-background-secondary/60 p-4">
          <div className="grid gap-4 md:grid-cols-2">
            <LabeledField label={t('memory.storageRoot', '存储根目录')}>
              <input
                value={runtimeDraft.storageRoot || ''}
                onChange={(event) =>
                  setRuntimeDraft((prev) => ({ ...prev, storageRoot: event.target.value }))
                }
                placeholder={overview?.storageRoot || ''}
                className="input text-body-sm"
              />
            </LabeledField>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3 rounded-lg border border-border-muted bg-background/80 p-3">
              <p className="text-body-sm font-medium text-text-primary">
                {t('memory.llmConfig', 'Memory LLM')}
              </p>
              <ToggleField
                label={t('memory.inheritActive', '继承当前激活 API')}
                checked={runtimeDraft.llm.inheritFromActive}
                onChange={(checked) =>
                  setRuntimeDraft((prev) => ({
                    ...prev,
                    llm: { ...prev.llm, inheritFromActive: checked },
                  }))
                }
              />
              <LabeledField label={t('memory.modelOverride', '模型覆盖')}>
                <input
                  value={runtimeDraft.llm.model || ''}
                  onChange={(event) =>
                    setRuntimeDraft((prev) => ({
                      ...prev,
                      llm: { ...prev.llm, model: event.target.value },
                    }))
                  }
                  placeholder={appConfig?.model || ''}
                  className="input text-body-sm"
                />
              </LabeledField>
              <LabeledField label={t('memory.baseUrlOverride', 'Base URL 覆盖')}>
                <input
                  value={runtimeDraft.llm.baseUrl || ''}
                  onChange={(event) =>
                    setRuntimeDraft((prev) => ({
                      ...prev,
                      llm: { ...prev.llm, baseUrl: event.target.value },
                    }))
                  }
                  placeholder={appConfig?.baseUrl || ''}
                  className="input text-body-sm"
                />
              </LabeledField>
              <LabeledField label={t('memory.apiKeyOverride', 'API Key 覆盖')}>
                <input
                  type="password"
                  value={runtimeDraft.llm.apiKey || ''}
                  onChange={(event) =>
                    setRuntimeDraft((prev) => ({
                      ...prev,
                      llm: { ...prev.llm, apiKey: event.target.value },
                    }))
                  }
                  className="input text-body-sm"
                />
              </LabeledField>
            </div>
          </div>
          <div className="flex justify-end">
            <button
              onClick={() => {
                void handleSaveRuntime();
              }}
              disabled={isBusy}
              className="rounded-lg bg-accent px-4 py-2.5 text-body-sm font-medium text-on-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
              {t('memory.saveRuntime', '保存运行时配置')}
            </button>
          </div>
        </div>
      </SettingsContentSection>

      <SettingsContentSection
        title={t('memory.searchTitle')}
        description={t('memory.searchDescription')}
      >
        <div className="space-y-3 rounded-xl border border-border-muted bg-background-secondary/60 p-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('memory.searchPlaceholder')}
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2.5 text-body-sm text-text-primary outline-none transition-colors focus:border-accent"
            />
            <button
              onClick={() => {
                void handleSearch();
              }}
              disabled={isBusy || !query.trim()}
              className="rounded-lg bg-accent px-4 py-2.5 text-body-sm font-medium text-on-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
              {t('memory.searchAction')}
            </button>
          </div>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="space-y-4">
              <ResultGroup
                title={t('memory.groupCore')}
                items={results}
                selectedId={selected?.id || null}
                onSelect={handleSelectResult}
                emptyLabel={t('memory.noResults')}
              />
            </div>
            <div className="space-y-4">
              <div className="rounded-xl border border-border-muted bg-background/80 p-4">
                <p className="text-body-sm font-semibold text-text-primary">
                  {t('memory.detailTitle')}
                </p>
                {selected ? (
                  <div className="mt-3 space-y-3">
                    <div>
                      <p className="text-caption uppercase tracking-wide text-text-muted">
                        {selected.kind}
                      </p>
                      <p className="mt-1 text-body-sm font-medium text-text-primary">
                        {selected.title}
                      </p>
                    </div>
                    <p className="text-body-sm text-text-secondary whitespace-pre-wrap">
                      {selected.summary}
                    </p>
                    {selected.sourceFile && (
                      <p className="text-caption text-text-muted">
                        {t('memory.sourceFile', '来源文件')}: {selected.sourceFile}
                      </p>
                    )}
                    {selected.rawText && (
                      <pre className="max-h-64 overflow-auto rounded-lg bg-background-secondary/80 p-3 text-caption leading-5 text-text-secondary whitespace-pre-wrap">
                        {selected.rawText}
                      </pre>
                    )}
                  </div>
                ) : (
                  <p className="mt-3 text-body-sm text-text-muted">{t('memory.noSelection')}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </SettingsContentSection>

      <SettingsContentSection
        title={t('memory.filesTitle', '原始文件查看')}
        description={t(
          'memory.filesDescription',
          '直接查看实际落盘的 core memory 与 session_state。'
        )}
      >
        <div className="grid gap-4 rounded-xl border border-border-muted bg-background-secondary/60 p-4 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-caption font-medium uppercase tracking-wide text-text-muted">
                {t('memory.fileList', '文件列表')}
              </p>
              <button
                onClick={() => {
                  void refreshFiles();
                }}
                className="rounded-lg border border-border bg-background px-3 py-2 text-caption font-medium text-text-primary"
              >
                {t('memory.refreshFiles', '刷新')}
              </button>
            </div>
            {files.length > 0 ? (
              files.map((file) => (
                <button
                  key={file.filePath}
                  onClick={() => {
                    void handleSelectFile(file.filePath);
                  }}
                  className={`w-full rounded-lg border p-3 text-left transition-colors ${
                    selectedFilePath === file.filePath
                      ? 'border-accent bg-accent/5'
                      : 'border-border-muted bg-background/80 hover:bg-surface-hover'
                  }`}
                >
                  <p className="text-body-sm font-medium text-text-primary">{file.label}</p>
                  <p className="mt-1 text-caption text-text-muted">{file.filePath}</p>
                  <p className="mt-2 text-caption text-text-muted">{file.sizeBytes} bytes</p>
                </button>
              ))
            ) : (
              <div className="rounded-lg border border-dashed border-border-muted bg-background/50 p-3 text-body-sm text-text-muted">
                {t('memory.noFiles', '还没有记忆文件')}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border-muted bg-background/80 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-body-sm font-semibold text-text-primary">
                  {t('memory.fileContent', '文件内容')}
                </p>
                {fileContent?.filePath && (
                  <p className="mt-1 text-caption text-text-muted">{fileContent.filePath}</p>
                )}
              </div>
              {fileContent?.filePath && (
                <button
                  onClick={() => {
                    void window.electronAPI.showItemInFolder(fileContent.filePath);
                  }}
                  className="rounded-lg border border-border bg-background px-3 py-2 text-caption font-medium text-text-primary"
                >
                  {t('memory.revealInFinder', '在 Finder 中显示')}
                </button>
              )}
            </div>
            {fileContent ? (
              <pre className="mt-3 max-h-[34rem] overflow-auto rounded-lg bg-background-secondary/80 p-3 text-caption leading-5 text-text-secondary whitespace-pre-wrap">
                {fileContent.parsed
                  ? JSON.stringify(fileContent.parsed, null, 2)
                  : fileContent.text || t('memory.emptyFile', '文件为空')}
              </pre>
            ) : (
              <p className="mt-3 text-body-sm text-text-muted">
                {t('memory.selectFileHint', '选择左侧文件后即可查看原始 JSON')}
              </p>
            )}
          </div>
        </div>
      </SettingsContentSection>

      <SettingsContentSection
        title={t('memory.maintenanceTitle')}
        description={t('memory.maintenanceDescription', '清空全局 core memory。')}
      >
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => {
              void handleClearCore();
            }}
            disabled={isBusy}
            className="rounded-lg border border-error/40 bg-error/10 px-4 py-2.5 text-body-sm font-medium text-error disabled:cursor-not-allowed disabled:opacity-60"
          >
            {t('memory.clearCore')}
          </button>
        </div>
      </SettingsContentSection>

      {status && (
        <div className="rounded-lg border border-border-muted bg-background-secondary/70 px-4 py-3 text-body-sm text-text-secondary">
          {status}
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border-muted bg-background/80 p-3">
      <p className="text-caption text-text-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold text-text-primary">{value}</p>
    </div>
  );
}

function InfoCard({
  label,
  value,
  secondary,
}: {
  label: string;
  value: string;
  secondary?: string;
}) {
  return (
    <div className="rounded-lg border border-border-muted bg-background/80 p-3 text-caption text-text-muted">
      <p className="font-medium text-text-secondary">{label}</p>
      <p className="mt-1 break-all">{value}</p>
      {secondary ? <p className="mt-2 break-all text-error">{secondary}</p> : null}
    </div>
  );
}

function LabeledField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-caption font-medium text-text-muted">{label}</span>
      {children}
    </label>
  );
}

function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-lg border border-border-muted bg-background/70 px-3 py-2.5">
      <span className="text-body-sm text-text-primary">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

function ResultGroup({
  title,
  items,
  selectedId,
  onSelect,
  emptyLabel,
}: {
  title: string;
  items: MemorySearchResult[];
  selectedId: string | null;
  onSelect: (id: string) => void | Promise<void>;
  emptyLabel: string;
}) {
  return (
    <div className="space-y-2">
      <p className="text-caption font-medium uppercase tracking-wide text-text-muted">{title}</p>
      {items.length > 0 ? (
        <div className="space-y-2">
          {items.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                void onSelect(item.id);
              }}
              className={`w-full rounded-lg border p-3 text-left transition-colors ${
                selectedId === item.id
                  ? 'border-accent bg-accent/5'
                  : 'border-border-muted bg-background/80 hover:bg-surface-hover'
              }`}
            >
              <p className="text-body-sm font-medium text-text-primary">{item.title}</p>
              <p className="mt-1 text-caption leading-5 text-text-muted">{item.contentPreview}</p>
              {item.sourceFile && (
                <p className="mt-2 text-caption text-text-muted">{item.sourceFile}</p>
              )}
            </button>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border-muted bg-background/50 p-3 text-body-sm text-text-muted">
          {emptyLabel}
        </div>
      )}
    </div>
  );
}
