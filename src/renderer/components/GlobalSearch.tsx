import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search as SearchIcon, MessageSquare, Sparkles, CornerDownLeft } from 'lucide-react';
import { useAppStore } from '../store';
import { useIPC } from '../hooks/useIPC';
import { filterSearchItems, type SearchItem } from '../utils/global-search';
import type { Skill } from '../types';

/**
 * G18 — global command-palette search over sessions (from the store) and
 * enabled skills (fetched via IPC, degrading gracefully when unavailable).
 * Triggered from the sidebar or ⌘/Ctrl+K (wired in App.tsx). Selecting a
 * session opens it; selecting a skill jumps to the Skills nav page.
 */
export function GlobalSearch() {
  const { t } = useTranslation();
  const show = useAppStore((s) => s.showGlobalSearch);
  const setShowGlobalSearch = useAppStore((s) => s.setShowGlobalSearch);
  const sessions = useAppStore((s) => s.sessions);
  const setActiveSession = useAppStore((s) => s.setActiveSession);
  const setActiveView = useAppStore((s) => s.setActiveView);
  const setShowSettings = useAppStore((s) => s.setShowSettings);
  const setMessages = useAppStore((s) => s.setMessages);
  const setTraceSteps = useAppStore((s) => s.setTraceSteps);
  const { getSessionMessages, getSessionTraceSteps, isElectron } = useIPC();

  const [query, setQuery] = useState('');
  const [skills, setSkills] = useState<Skill[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Load enabled skills whenever the palette opens; reset transient state.
  useEffect(() => {
    if (!show) return;
    setQuery('');
    setSelectedIndex(0);
    let cancelled = false;
    void (async () => {
      if (typeof window === 'undefined' || !window.electronAPI?.skills?.getAll) return;
      try {
        const all = await window.electronAPI.skills.getAll();
        if (!cancelled) setSkills(all.filter((skill) => skill.enabled));
      } catch (err) {
        console.error('[GlobalSearch] Failed to load skills:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [show]);

  useEffect(() => {
    if (show) inputRef.current?.focus();
  }, [show]);

  const items = useMemo<SearchItem[]>(() => {
    const sessionItems: SearchItem[] = [...sessions]
      .sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt))
      .map((session) => ({ id: session.id, kind: 'session', title: session.title }));
    const skillItems: SearchItem[] = skills.map((skill) => ({
      id: skill.id,
      kind: 'skill',
      title: skill.name,
      subtitle: skill.description,
    }));
    return [...sessionItems, ...skillItems];
  }, [sessions, skills]);

  const results = useMemo(() => filterSearchItems(items, query), [items, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Keep the highlighted row visible as the user arrows through results.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${selectedIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const openSession = useCallback(
    async (sessionId: string) => {
      setShowGlobalSearch(false);
      setShowSettings(false);
      setActiveSession(sessionId);

      const states = useAppStore.getState().sessionStates;
      const existingMessages = states[sessionId]?.messages;
      if ((!existingMessages || existingMessages.length === 0) && isElectron) {
        try {
          const messages = await getSessionMessages(sessionId);
          if (messages && messages.length > 0) setMessages(sessionId, messages);
        } catch (error) {
          console.error('[GlobalSearch] Failed to load messages:', error);
        }
        try {
          const steps = await getSessionTraceSteps(sessionId);
          setTraceSteps(sessionId, steps || []);
        } catch (error) {
          console.error('[GlobalSearch] Failed to load trace steps:', error);
        }
      }
    },
    [
      getSessionMessages,
      getSessionTraceSteps,
      isElectron,
      setActiveSession,
      setMessages,
      setShowGlobalSearch,
      setShowSettings,
      setTraceSteps,
    ]
  );

  const handleSelect = useCallback(
    (item: SearchItem) => {
      if (item.kind === 'session') {
        void openSession(item.id);
      } else {
        setShowGlobalSearch(false);
        setActiveView('skills');
      }
    },
    [openSession, setActiveView, setShowGlobalSearch]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowGlobalSearch(false);
        return;
      }
      if (results.length === 0) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(results.length - 1, prev + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(0, prev - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const item = results[selectedIndex];
        if (item) handleSelect(item);
      }
    },
    [results, selectedIndex, handleSelect, setShowGlobalSearch]
  );

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4 bg-scrim/60 backdrop-blur-sm animate-fade-in"
      onClick={() => setShowGlobalSearch(false)}
    >
      <div
        className="w-full max-w-xl rounded-4xl border border-border-subtle bg-surface shadow-elevated overflow-hidden animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 h-14 border-b border-border-muted">
          <SearchIcon className="w-4 h-4 text-text-muted flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('search.placeholder')}
            className="flex-1 min-w-0 bg-transparent text-body text-text-primary placeholder:text-text-muted focus:outline-none"
          />
          <kbd className="text-caption text-text-muted font-sans">Esc</kbd>
        </div>

        <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-2">
          {results.length === 0 ? (
            <div className="px-4 py-10 text-center text-body-sm text-text-muted">
              {t('search.noResults')}
            </div>
          ) : (
            results.map((item, index) => {
              const isSelected = index === selectedIndex;
              const Icon = item.kind === 'session' ? MessageSquare : Sparkles;
              return (
                <button
                  key={`${item.kind}-${item.id}`}
                  data-index={index}
                  onClick={() => handleSelect(item)}
                  onMouseMove={() => setSelectedIndex(index)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    isSelected ? 'bg-accent/10' : 'hover:bg-surface-hover/60'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 flex-shrink-0 ${
                      item.kind === 'session' ? 'text-text-muted' : 'text-accent'
                    }`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-body-sm font-medium text-text-primary truncate">
                      {item.title}
                    </span>
                    {item.subtitle && (
                      <span className="block text-caption text-text-muted truncate">
                        {item.subtitle}
                      </span>
                    )}
                  </span>
                  <span className="text-caption text-text-muted flex-shrink-0">
                    {item.kind === 'session' ? t('search.sessions') : t('search.skills')}
                  </span>
                  {isSelected && (
                    <CornerDownLeft className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
