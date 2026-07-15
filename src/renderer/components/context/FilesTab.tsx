import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../../store';
import {
  ChevronRight,
  Folder,
  File,
  FileText,
  Image as ImageIcon,
  ArrowLeft,
  FolderOpen,
  Loader2,
  ExternalLink,
} from 'lucide-react';

interface DirEntry {
  name: string;
  relPath: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modifiedAt: number;
}

interface FilePreview {
  relPath: string;
  path: string;
  content: string;
  truncated: boolean;
  isBinary: boolean;
  size: number;
}

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico']);

function extOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}

function formatSize(bytes: number): string {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

export function FilesTab() {
  const { t } = useTranslation();
  const activeSessionId = useAppStore((s) => s.activeSessionId);
  const sessions = useAppStore((s) => s.sessions);
  const workingDir = useAppStore((s) => s.workingDir);

  const activeSession = activeSessionId ? sessions.find((s) => s.id === activeSessionId) : null;
  const currentWorkingDir = activeSession?.cwd || workingDir;

  const [relPath, setRelPath] = useState('');
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<FilePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const canReveal = typeof window !== 'undefined' && !!window.electronAPI?.showItemInFolder;

  const loadDir = useCallback(
    async (dir: string) => {
      if (typeof window === 'undefined' || !window.electronAPI?.artifacts?.listDir) {
        setEntries([]);
        return;
      }
      if (!currentWorkingDir) {
        setEntries([]);
        return;
      }
      setLoading(true);
      try {
        const result = await window.electronAPI.artifacts.listDir(currentWorkingDir, dir);
        setEntries(result || []);
      } catch (error) {
        console.error('Failed to list workspace directory:', error);
        setEntries([]);
      } finally {
        setLoading(false);
      }
    },
    [currentWorkingDir]
  );

  useEffect(() => {
    setRelPath('');
    setPreview(null);
  }, [currentWorkingDir]);

  useEffect(() => {
    if (!preview) {
      void loadDir(relPath);
    }
  }, [loadDir, relPath, preview]);

  const openFile = useCallback(
    async (entry: DirEntry) => {
      if (typeof window === 'undefined' || !window.electronAPI?.artifacts?.readFile) {
        return;
      }
      if (!currentWorkingDir) return;
      setPreviewLoading(true);
      try {
        const result = await window.electronAPI.artifacts.readFile(
          currentWorkingDir,
          entry.relPath
        );
        if (result) {
          setPreview(result);
        }
      } catch (error) {
        console.error('Failed to read workspace file:', error);
      } finally {
        setPreviewLoading(false);
      }
    },
    [currentWorkingDir]
  );

  const breadcrumbs = useMemo(() => {
    const parts = relPath ? relPath.split('/').filter(Boolean) : [];
    const crumbs: Array<{ label: string; path: string }> = [{ label: '/', path: '' }];
    let acc = '';
    for (const part of parts) {
      acc = acc ? `${acc}/${part}` : part;
      crumbs.push({ label: part, path: acc });
    }
    return crumbs;
  }, [relPath]);

  if (!currentWorkingDir) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-10 px-4 text-center">
        <FolderOpen className="w-6 h-6 text-text-muted/60" />
        <p className="text-caption text-text-muted">{t('context.files.noWorkingDir')}</p>
      </div>
    );
  }

  // File preview view.
  if (preview) {
    const ext = extOf(preview.relPath);
    const isImage = IMAGE_EXT.has(ext);
    return (
      <div className="flex flex-col overflow-hidden">
        <div className="px-3 py-2 flex items-center gap-2 border-b border-border-muted shrink-0">
          <button
            onClick={() => setPreview(null)}
            className="icon-btn w-6 h-6"
            title={t('context.files.back')}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>
          <span className="text-caption text-text-primary truncate flex-1" title={preview.relPath}>
            {preview.relPath}
          </span>
          <span className="text-caption text-text-muted shrink-0">{formatSize(preview.size)}</span>
          {canReveal && (
            <button
              onClick={() => window.electronAPI.showItemInFolder(preview.path, currentWorkingDir)}
              className="text-text-muted hover:text-text-primary transition-colors shrink-0"
              title={t('context.openInFileManager')}
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="overflow-auto">
          {isImage ? (
            <div className="p-3 flex items-center justify-center">
              <img
                src={`file://${preview.path}`}
                alt={preview.relPath}
                className="max-w-full h-auto rounded-lg"
              />
            </div>
          ) : preview.isBinary ? (
            <p className="p-4 text-caption text-text-muted">{t('context.files.binary')}</p>
          ) : (
            <>
              <pre className="p-3 text-caption font-mono whitespace-pre-wrap break-all text-text-secondary">
                {preview.content}
              </pre>
              {preview.truncated && (
                <p className="px-3 pb-3 text-caption text-text-muted">
                  {t('context.files.truncated')}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col overflow-hidden">
      {/* Breadcrumbs */}
      <div className="px-3 py-2 flex items-center gap-0.5 flex-wrap border-b border-border-muted shrink-0">
        {breadcrumbs.map((crumb, index) => (
          <span key={crumb.path} className="flex items-center gap-0.5">
            {index > 0 && <ChevronRight className="w-3 h-3 text-text-muted/60" />}
            <button
              onClick={() => setRelPath(crumb.path)}
              className={`text-caption px-1 rounded hover:bg-surface-hover transition-colors ${
                index === breadcrumbs.length - 1 ? 'text-text-primary' : 'text-text-muted'
              }`}
            >
              {crumb.label}
            </button>
          </span>
        ))}
      </div>

      <div className="overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-caption text-text-muted">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>{t('context.files.loading')}</span>
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 px-4 text-center">
            <Folder className="w-6 h-6 text-text-muted/60" />
            <p className="text-caption text-text-muted">{t('context.files.empty')}</p>
          </div>
        ) : (
          entries.map((entry) => {
            const Icon = entry.isDirectory
              ? Folder
              : IMAGE_EXT.has(extOf(entry.name))
                ? ImageIcon
                : isTextExt(extOf(entry.name))
                  ? FileText
                  : File;
            return (
              <button
                key={entry.relPath}
                onClick={() => (entry.isDirectory ? setRelPath(entry.relPath) : openFile(entry))}
                className="w-full px-4 py-1.5 flex items-center gap-2 hover:bg-surface-hover transition-colors text-left"
              >
                <Icon
                  className={`w-3.5 h-3.5 shrink-0 ${entry.isDirectory ? 'text-accent' : 'text-text-muted'}`}
                />
                <span className="text-caption text-text-primary truncate flex-1">{entry.name}</span>
                {!entry.isDirectory && (
                  <span className="text-caption text-text-muted shrink-0">
                    {formatSize(entry.size)}
                  </span>
                )}
                {entry.isDirectory && (
                  <ChevronRight className="w-3.5 h-3.5 text-text-muted shrink-0" />
                )}
              </button>
            );
          })
        )}
        {previewLoading && (
          <div className="flex items-center justify-center gap-2 py-3 text-caption text-text-muted">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>{t('context.files.loading')}</span>
          </div>
        )}
      </div>
    </div>
  );
}

const TEXT_EXT = new Set([
  'txt',
  'md',
  'markdown',
  'json',
  'yaml',
  'yml',
  'js',
  'ts',
  'tsx',
  'jsx',
  'py',
  'sh',
  'css',
  'html',
  'xml',
  'csv',
  'log',
  'toml',
  'ini',
  'env',
]);

function isTextExt(ext: string): boolean {
  return TEXT_EXT.has(ext);
}
