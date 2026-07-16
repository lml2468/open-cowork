import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import { useTranslation } from 'react-i18next';
import {
  useActiveSessionId,
  useCurrentSession,
  useActiveSessionMessages,
  useActivePartialContent,
  useActiveTurn,
  usePendingTurns,
  useActiveExecutionClock,
  useActiveSessionCwd,
  useActiveSessionMode,
} from '../store/selectors';
import { useAppStore } from '../store';
import { useIPC } from '../hooks/useIPC';
import { useSmoothedStreamingText } from '../hooks/useSmoothedStreamingText';
import { MessageCard } from './MessageCard';
import { SubagentTracker } from './SubagentTracker';
import { ContextUsageBar } from './ContextUsageBar';
import { ModelPicker } from './composer/ModelPicker';
import { PersonaSelector } from './composer/PersonaSelector';
import { SkillPicker } from './composer/SkillPicker';
import { ConnectorPicker } from './composer/ConnectorPicker';
import { ModePicker } from './composer/ModePicker';
import {
  ComposerAutocomplete,
  type ComposerAutocompleteHandle,
} from './composer/ComposerAutocomplete';
import { replaceRange } from '../utils/composer-autocomplete';
import { resolveChatFollowOutput } from './chat-scroll';
import type { Message, ContentBlock, Skill } from '../types';
import {
  Send,
  Square,
  Plus,
  Loader2,
  Plug,
  X,
  Clock,
  Home,
  ChevronRight,
  Search,
  PanelRight,
} from 'lucide-react';

type AttachedFile = {
  name: string;
  path: string;
  size: number;
  type: string;
  inlineDataBase64?: string;
};

// Context passed to the Virtuoso message list's Header/Footer/Empty components.
interface ChatListContext {
  activeSessionId: string | null;
  showProcessing: boolean;
  processingText: string;
  timerText: string | null;
  startConversationText: string;
}

/** Top spacer so the first message isn't flush against the top of the viewport. */
const ChatListHeader = () => <div className="pt-8" />;

/** Renders below the last message (in-scroller): subagent progress + status. */
const ChatListFooter = ({ context }: { context?: ChatListContext }) => {
  if (!context) return null;
  return (
    <div className="w-full max-w-content mx-auto gutter-x pb-8 space-y-6">
      <SubagentTracker sessionId={context.activeSessionId} />
      {context.showProcessing && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-full bg-background/80 border border-border-subtle max-w-fit">
          <Loader2 className="w-4 h-4 text-accent animate-spin" />
          <span className="text-body-sm text-text-secondary">{context.processingText}</span>
        </div>
      )}
      {context.timerText && (
        <div className="flex items-center gap-1.5 text-caption text-text-muted mt-1 ml-0.5">
          <Clock className="w-3 h-3" />
          <span>{context.timerText}</span>
        </div>
      )}
    </div>
  );
};

/** Shown when the session has no messages yet. */
const ChatListEmpty = ({ context }: { context?: ChatListContext }) => (
  <div className="flex flex-col items-center justify-center py-28 text-text-muted space-y-3 text-center">
    <p className="text-label uppercase text-text-muted/80">Open Cowork</p>
    <p className="text-body text-text-secondary">{context?.startConversationText}</p>
  </div>
);

export function ChatView() {
  const { t } = useTranslation();
  // Scoped selectors — each subscription only re-renders when its slice changes
  const activeSessionId = useActiveSessionId();
  const activeSession = useCurrentSession();
  const messages = useActiveSessionMessages();
  const { partialMessage, partialThinking } = useActivePartialContent();
  const activeTurn = useActiveTurn();
  const pendingTurns = usePendingTurns();
  const executionClock = useActiveExecutionClock();
  const activeCwd = useActiveSessionCwd();
  const composerMode = useActiveSessionMode();
  const setSessionMode = useAppStore((s) => s.setSessionMode);
  const setGlobalNotice = useAppStore((s) => s.setGlobalNotice);
  const setActiveSession = useAppStore((s) => s.setActiveSession);
  const setShowGlobalSearch = useAppStore((s) => s.setShowGlobalSearch);
  const toggleContextPanel = useAppStore((s) => s.toggleContextPanel);
  const { continueSession, stopSession, isElectron } = useIPC();
  const [prompt, setPrompt] = useState('');
  const autocompleteRef = useRef<ComposerAutocompleteHandle>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeConnectors, setActiveConnectors] = useState<
    { id: string; name: string; connected: boolean; toolCount: number }[]
  >([]);
  const [pastedImages, setPastedImages] = useState<
    Array<{ url: string; base64: string; mediaType: string }>
  >([]);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  // Virtuoso handle + at-bottom tracking drive the stick-to-bottom behavior.
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const isUserAtBottomRef = useRef(true);
  const isComposingRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const hasActiveTurn = Boolean(activeTurn);
  const pendingCount = pendingTurns.length;
  const isSessionRunning = activeSession?.status === 'running';
  const canStop = isSessionRunning || hasActiveTurn || pendingCount > 0;

  // Smooth the streamed answer so the typewriter reads as continuous even when
  // the provider delivers text in coarse ~8/sec chunks.
  const smoothedPartial = useSmoothedStreamingText(partialMessage);

  const displayedMessages = useMemo(() => {
    if (!activeSessionId) return messages;
    // Show streaming message if we have partial text OR partial thinking
    const hasStreamingContent = partialMessage || partialThinking;
    if (!hasStreamingContent || !activeTurn?.userMessageId) return messages;
    const anchorIndex = messages.findIndex((message) => message.id === activeTurn.userMessageId);
    if (anchorIndex === -1) return messages;

    let insertIndex = anchorIndex + 1;
    while (insertIndex < messages.length) {
      if (messages[insertIndex].role === 'user') break;
      insertIndex += 1;
    }

    const contentBlocks: ContentBlock[] = [];
    if (partialThinking) {
      contentBlocks.push({ type: 'thinking', thinking: partialThinking });
    }
    if (partialMessage) {
      contentBlocks.push({ type: 'text', text: smoothedPartial });
    }

    const streamingMessage: Message = {
      id: `partial-${activeSessionId}`,
      sessionId: activeSessionId,
      role: 'assistant',
      content: contentBlocks,
      timestamp: Date.now(),
    };

    return [...messages.slice(0, insertIndex), streamingMessage, ...messages.slice(insertIndex)];
  }, [
    activeSessionId,
    activeTurn?.userMessageId,
    messages,
    partialMessage,
    smoothedPartial,
    partialThinking,
  ]);

  // Format execution time for display
  const formatExecutionTime = useCallback((ms: number): string => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(0);
    return `${minutes}m ${seconds}s`;
  }, []);

  // --- Real-time execution timer ---
  const [clockNow, setClockNow] = useState(() => Date.now());

  useEffect(() => {
    const isActive = Boolean(executionClock?.startAt && executionClock.endAt === null);
    if (!isActive) {
      return;
    }
    setClockNow(Date.now());
    const interval = setInterval(() => {
      setClockNow(Date.now());
    }, 100);
    return () => clearInterval(interval);
  }, [executionClock?.startAt, executionClock?.endAt]);

  const liveElapsed =
    executionClock?.startAt == null
      ? 0
      : Math.max(0, (executionClock.endAt ?? clockNow) - executionClock.startAt);
  const timerActive = Boolean(executionClock?.startAt && executionClock.endAt === null);

  const timerText =
    liveElapsed > 0
      ? timerActive
        ? formatExecutionTime(liveElapsed)
        : t('messageCard.executionTime', { time: formatExecutionTime(liveElapsed) })
      : null;
  const showProcessing =
    hasActiveTurn && (!partialMessage || partialMessage.trim() === '') && !partialThinking;
  const listContext = useMemo<ChatListContext>(
    () => ({
      activeSessionId,
      showProcessing,
      processingText: t('chat.processing'),
      timerText,
      startConversationText: t('chat.startConversation'),
    }),
    [activeSessionId, showProcessing, timerText, t]
  );

  useEffect(() => {
    textareaRef.current?.focus();
  }, [activeSessionId]);

  // Handle paste event for images
  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const imageItems = Array.from(items).filter((item) => item.type.startsWith('image/'));
    if (imageItems.length === 0) return;

    e.preventDefault();

    const newImages: Array<{ url: string; base64: string; mediaType: string }> = [];

    for (const item of imageItems) {
      const blob = item.getAsFile();
      if (!blob) continue;

      try {
        // Resize if needed to stay under API limit
        const resizedBlob = await resizeImageIfNeeded(blob);
        const base64 = await blobToBase64(resizedBlob);
        const url = URL.createObjectURL(resizedBlob);
        newImages.push({
          url,
          base64,
          mediaType: resizedBlob.type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
        });
      } catch (err) {
        // Notify the user instead of silently dropping the error
        setGlobalNotice({
          id: `image-paste-failed-${Date.now()}`,
          type: 'warning',
          message: t('chat.imageProcessFailed'),
        });
      }
    }

    setPastedImages((prev) => [...prev, ...newImages]);
  };

  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result;
        if (typeof result !== 'string') {
          reject(new Error('FileReader result is not a string'));
          return;
        }
        // Remove data URL prefix (e.g., "data:image/png;base64,")
        const parts = result.split(',');
        resolve(parts[1] || '');
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  // Resize and compress image if needed to stay under 5MB base64 limit
  const resizeImageIfNeeded = async (blob: Blob): Promise<Blob> => {
    // Claude API limit is 5MB for base64 encoded images
    // Base64 encoding increases size by ~33%, so we target 3.75MB for the blob
    const MAX_BLOB_SIZE = 3.75 * 1024 * 1024; // 3.75MB

    if (blob.size <= MAX_BLOB_SIZE) {
      return blob; // No need to resize
    }

    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(blob);

      img.onload = () => {
        URL.revokeObjectURL(url);

        // Calculate scaling factor to reduce file size
        // We use a more aggressive approach: scale down until size is acceptable
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        // Start with a scale factor based on size ratio
        const scale = Math.sqrt(MAX_BLOB_SIZE / blob.size);
        const quality = 0.9;

        const attemptCompress = (currentScale: number, currentQuality: number): Promise<Blob> => {
          canvas.width = Math.floor(img.width * currentScale);
          canvas.height = Math.floor(img.height * currentScale);

          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          return new Promise((resolveBlob) => {
            canvas.toBlob(
              (compressedBlob) => {
                if (!compressedBlob) {
                  reject(new Error('Failed to compress image'));
                  return;
                }

                // If still too large, try again with lower quality or scale
                if (
                  compressedBlob.size > MAX_BLOB_SIZE &&
                  (currentQuality > 0.5 || currentScale > 0.3)
                ) {
                  const newQuality = Math.max(0.5, currentQuality - 0.1);
                  const newScale = currentQuality <= 0.5 ? currentScale * 0.9 : currentScale;
                  attemptCompress(newScale, newQuality).then(resolveBlob);
                } else {
                  resolveBlob(compressedBlob);
                }
              },
              blob.type || 'image/jpeg',
              currentQuality
            );
          });
        };

        attemptCompress(scale, quality).then(resolve).catch(reject);
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load image'));
      };

      img.src = url;
    });
  };

  const removeImage = (index: number) => {
    setPastedImages((prev) => {
      const updated = [...prev];
      URL.revokeObjectURL(updated[index].url);
      updated.splice(index, 1);
      return updated;
    });
  };

  const removeFile = (index: number) => {
    setAttachedFiles((prev) => {
      const updated = [...prev];
      updated.splice(index, 1);
      return updated;
    });
  };

  const handleFileSelect = async () => {
    if (!isElectron || !window.electronAPI) {
      console.log('[ChatView] Not in Electron, file selection not available');
      return;
    }

    try {
      const filePaths = await window.electronAPI.selectFiles();
      if (filePaths.length === 0) return;

      // Get file info for each selected file
      const newFiles = filePaths.map((filePath) => {
        const fileName = filePath.split(/[/\\]/).pop() || 'unknown';
        return {
          name: fileName,
          path: filePath,
          size: 0, // Will be set by backend when copying
          type: 'application/octet-stream',
        };
      });

      setAttachedFiles((prev) => [...prev, ...newFiles]);
    } catch (error) {
      console.error('[ChatView] Error selecting files:', error);
    }
  };

  // Handle drag and drop for images
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    const imageFiles = files.filter((file) => file.type.startsWith('image/'));
    const otherFiles = files.filter((file) => !file.type.startsWith('image/'));

    // Process images
    if (imageFiles.length > 0) {
      const newImages: Array<{ url: string; base64: string; mediaType: string }> = [];

      for (const file of imageFiles) {
        try {
          // Resize if needed to stay under API limit
          const resizedBlob = await resizeImageIfNeeded(file);
          const base64 = await blobToBase64(resizedBlob);
          const url = URL.createObjectURL(resizedBlob);
          newImages.push({
            url,
            base64,
            mediaType: resizedBlob.type,
          });
        } catch (err) {
          // Notify the user instead of silently dropping the error
          setGlobalNotice({
            id: `image-drop-failed-${Date.now()}`,
            type: 'warning',
            message: t('chat.imageProcessFailed'),
          });
        }
      }

      setPastedImages((prev) => [...prev, ...newImages]);
    }

    // Process other files
    if (otherFiles.length > 0) {
      const newFiles = await Promise.all(
        otherFiles.map(async (file) => {
          const droppedPath = 'path' in file && typeof file.path === 'string' ? file.path : '';
          const inlineDataBase64 = droppedPath ? undefined : await blobToBase64(file);

          return {
            name: file.name,
            path: droppedPath,
            size: file.size,
            type: file.type || 'application/octet-stream',
            inlineDataBase64,
          };
        })
      );

      setAttachedFiles((prev) => [...prev, ...newFiles]);
    }
  };

  // Load active MCP connectors
  useEffect(() => {
    if (isElectron && typeof window !== 'undefined' && window.electronAPI) {
      const loadConnectors = async () => {
        try {
          const statuses = await window.electronAPI.mcp.getServerStatus();
          const active =
            (
              statuses as Array<{ id: string; name: string; connected: boolean; toolCount: number }>
            )?.filter((s) => s.connected && s.toolCount > 0) || [];
          setActiveConnectors(active);
        } catch (err) {
          console.error('Failed to load MCP connectors:', err);
        }
      };
      loadConnectors();
      // Refresh every 5 seconds
      const interval = setInterval(loadConnectors, 5000);
      return () => clearInterval(interval);
    }
  }, [isElectron]);

  // Build the prompt template injected when a skill is picked (reuses the
  // welcome-card template so behaviour is consistent across composers).
  const skillTemplate = useCallback(
    (name: string) => t('welcome.skillPromptTemplate', { name }),
    [t]
  );

  const setComposerValue = useCallback((next: string, caret?: number) => {
    setPrompt(next);
    const el = textareaRef.current;
    if (el) {
      el.value = next;
      el.focus();
      if (caret !== undefined) el.setSelectionRange(caret, caret);
    }
  }, []);

  // Insert a skill's prompt template into the composer (G8 skill pill).
  const handleInsertSkill = useCallback(
    (skill: Skill) => {
      const template = skillTemplate(skill.name);
      const current = textareaRef.current?.value ?? prompt;
      const next = current.trim() ? `${current.trimEnd()}\n${template}` : template;
      setComposerValue(next, next.length);
    },
    [prompt, skillTemplate, setComposerValue]
  );

  // Replace an autocomplete trigger token with the chosen insert text (G10/G11).
  const handleComposerReplace = useCallback(
    (start: number, end: number, insert: string) => {
      const current = textareaRef.current?.value ?? prompt;
      const { text, caret } = replaceRange(current, start, end, insert);
      setComposerValue(text, caret);
    },
    [prompt, setComposerValue]
  );

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const currentPrompt = textareaRef.current?.value || prompt;

    if (
      (!currentPrompt.trim() && pastedImages.length === 0 && attachedFiles.length === 0) ||
      !activeSessionId ||
      isSubmitting
    )
      return;

    setIsSubmitting(true);
    try {
      // Build content blocks
      const contentBlocks: ContentBlock[] = [];

      // Add images first
      pastedImages.forEach((img) => {
        contentBlocks.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: img.mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
            data: img.base64,
          },
        });
      });

      // Add file attachments
      attachedFiles.forEach((file) => {
        contentBlocks.push({
          type: 'file_attachment',
          filename: file.name,
          relativePath: file.path, // Will be processed by backend to copy to .tmp
          size: file.size,
          mimeType: file.type,
          inlineDataBase64: file.inlineDataBase64,
        });
      });

      // Add text if present
      if (currentPrompt.trim()) {
        contentBlocks.push({
          type: 'text',
          text: currentPrompt.trim(),
        });
      }

      // Send message with content blocks
      await continueSession(activeSessionId, contentBlocks);

      // Clean up
      setPrompt('');
      if (textareaRef.current) {
        textareaRef.current.value = '';
      }
      pastedImages.forEach((img) => URL.revokeObjectURL(img.url));
      setPastedImages([]);
      setAttachedFiles([]);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStop = () => {
    if (activeSessionId) {
      stopSession(activeSessionId);
    }
  };

  // Basename of the working directory, shown as the "workspace" breadcrumb crumb.
  const workspaceName = useMemo(() => {
    if (!activeCwd) return null;
    const parts = activeCwd.split(/[\\/]/).filter(Boolean);
    return parts.length > 0 ? parts[parts.length - 1] : null;
  }, [activeCwd]);

  if (!activeSession) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-muted">
        <span>{t('chat.loadingConversation')}</span>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background">
      {/* Header — breadcrumb location + workspace actions (G19) */}
      <div className="h-header border-b border-border-muted flex items-center gap-2 gutter-x bg-background/88 backdrop-blur-md">
        {/* Left: breadcrumb (home › workspace › session) */}
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <button
            onClick={() => setActiveSession(null)}
            className="icon-btn w-7 h-7 flex-shrink-0"
            title={t('chat.backToHome')}
          >
            <Home className="w-3.5 h-3.5" />
          </button>
          {workspaceName && (
            <>
              <ChevronRight className="w-3 h-3 text-text-muted/60 flex-shrink-0" />
              <span
                className="text-caption text-text-muted truncate max-w-[8rem] flex-shrink-0"
                title={activeCwd ?? undefined}
              >
                {workspaceName}
              </span>
            </>
          )}
          <ChevronRight className="w-3 h-3 text-text-muted/60 flex-shrink-0" />
          <h2 className="text-body font-medium text-text-primary truncate">
            {activeSession.title}
          </h2>
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {activeConnectors.length > 0 && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-mcp/8 border border-mcp/15">
              <Plug className="w-3.5 h-3.5 text-mcp" />
              <span className="text-caption text-mcp font-medium">
                {t('chat.connectorCount', { count: activeConnectors.length })}
              </span>
            </span>
          )}
          <button
            onClick={() => setShowGlobalSearch(true)}
            className="icon-btn w-8 h-8"
            title={t('search.open')}
          >
            <Search className="w-4 h-4" />
          </button>
          <button
            onClick={toggleContextPanel}
            className="icon-btn w-8 h-8"
            title={t('chat.toggleWorkspace')}
          >
            <PanelRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Context Usage Bar */}
      <ContextUsageBar />

      {/* Messages — virtualized so long histories don't inflate the DOM */}
      <Virtuoso
        ref={virtuosoRef}
        className="flex-1 min-h-0"
        data={displayedMessages}
        context={listContext}
        computeItemKey={(_index, message) => message.id}
        followOutput={(isAtBottom) => resolveChatFollowOutput(isAtBottom)}
        atBottomThreshold={80}
        atBottomStateChange={(atBottom) => {
          isUserAtBottomRef.current = atBottom;
        }}
        components={{
          Header: ChatListHeader,
          Footer: ChatListFooter,
          EmptyPlaceholder: ChatListEmpty,
        }}
        itemContent={(_index, message) => {
          const isStreaming = typeof message.id === 'string' && message.id.startsWith('partial-');
          return (
            <div className="w-full max-w-content mx-auto gutter-x pb-6">
              <MessageCard message={message} isStreaming={isStreaming} />
            </div>
          );
        }}
      />

      {/* Input */}
      <div className="border-t border-border-muted bg-background/92 backdrop-blur-md">
        <div className="max-w-content mx-auto gutter-x py-5">
          <form
            onSubmit={handleSubmit}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className="relative w-full"
          >
            {/* Image previews */}
            {pastedImages.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 mb-3">
                {pastedImages.map((img, index) => (
                  <div key={img.url || `pasted-image-${index}`} className="relative group">
                    <img
                      src={img.url}
                      alt={t('common.pastedImageAlt', { index: index + 1 })}
                      className="w-full aspect-square object-cover rounded-lg border border-border block"
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(index)}
                      className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-error text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* File attachments */}
            {attachedFiles.length > 0 && (
              <div className="space-y-2 mb-3">
                {attachedFiles.map((file, index) => (
                  <div
                    key={file.path || `attached-file-${index}`}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-muted border border-border group"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-body-sm text-text-primary truncate">{file.name}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFile(index)}
                      className="w-6 h-6 rounded-full bg-error/10 hover:bg-error/20 text-error flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <ComposerAutocomplete
              ref={autocompleteRef}
              textareaRef={textareaRef}
              value={prompt}
              cwd={activeCwd}
              enableCommands
              onReplace={handleComposerReplace}
              skillTemplate={skillTemplate}
            />

            <div
              className={`flex flex-col gap-2 p-3.5 rounded-4xl bg-background/88 border border-border-muted shadow-soft transition-colors ${
                isDragging ? 'ring-2 ring-accent bg-accent/5' : ''
              }`}
            >
              <div className="flex items-end gap-2">
                <button
                  type="button"
                  onClick={handleFileSelect}
                  className="icon-btn w-9 h-9"
                  title={t('welcome.attachFiles')}
                >
                  <Plus className="w-5 h-5" />
                </button>

                <textarea
                  ref={textareaRef}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onCompositionStart={() => {
                    isComposingRef.current = true;
                  }}
                  onCompositionEnd={() => {
                    isComposingRef.current = false;
                  }}
                  onPaste={handlePaste}
                  onKeyDown={(e) => {
                    // Autocomplete menu navigation takes priority over submit.
                    if (autocompleteRef.current?.handleKeyDown(e)) {
                      return;
                    }
                    // Enter to send, Shift+Enter for new line
                    if (e.key === 'Enter' && !e.shiftKey) {
                      if (
                        e.nativeEvent.isComposing ||
                        isComposingRef.current ||
                        e.keyCode === 229
                      ) {
                        return;
                      }
                      e.preventDefault();
                      handleSubmit();
                    }
                  }}
                  placeholder={t('chat.typeMessage')}
                  disabled={isSubmitting}
                  rows={1}
                  className="flex-1 resize-none bg-transparent border-none outline-none text-text-primary placeholder:text-text-muted text-body py-2"
                />
              </div>

              {/* Per-turn composer controls (G7–G9, G12) */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <ModelPicker />
                <PersonaSelector />
                <SkillPicker onSelectSkill={handleInsertSkill} />
                <ConnectorPicker />
                <ModePicker
                  mode={composerMode}
                  onChange={(m) => {
                    if (activeSessionId) setSessionMode(activeSessionId, m);
                  }}
                />

                <div className="ml-auto flex items-center gap-2">
                  {canStop && (
                    <button
                      type="button"
                      onClick={handleStop}
                      className="w-9 h-9 rounded-2xl flex items-center justify-center bg-error/10 text-error hover:bg-error/20 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-error focus-visible:ring-opacity-50"
                      title={t('chat.stop')}
                    >
                      <Square className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={
                      (!prompt.trim() &&
                        !textareaRef.current?.value.trim() &&
                        pastedImages.length === 0 &&
                        attachedFiles.length === 0) ||
                      isSubmitting
                    }
                    className="w-9 h-9 rounded-2xl flex items-center justify-center bg-accent text-on-accent disabled:opacity-50 disabled:cursor-not-allowed hover:bg-accent-hover transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-opacity-50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    title={t('chat.sendMessage')}
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            <p className="text-caption text-text-muted/60 text-center mt-2.5">
              {t('chat.disclaimer')}
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
