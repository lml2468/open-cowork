import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, Sparkles } from 'lucide-react';
import { useEnabledSkills } from '../../hooks/useEnabledSkills';
import { localizeSkill } from '../../utils/localize-skill';
import {
  detectTrigger,
  matchesQuery,
  toRelativePath,
  type TriggerMatch,
} from '../../utils/composer-autocomplete';

/** Imperative surface the parent composer drives from its textarea handlers. */
export interface ComposerAutocompleteHandle {
  /** Recompute the active trigger from the textarea's current value + caret. */
  sync: () => void;
  /** Handle a textarea keydown; returns true when the event was consumed (menu nav). */
  handleKeyDown: (e: React.KeyboardEvent) => boolean;
  /** Whether an autocomplete menu is currently open. */
  isOpen: () => boolean;
}

interface ComposerAutocompleteProps {
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  /** Current composer text (drives re-detection). */
  value: string;
  /** Working directory whose files back the `@` mention list. */
  cwd: string | null;
  /** Enable the `/` command palette (skills) in addition to `@` mentions. */
  enableCommands?: boolean;
  /** Replace [start, end) of the text with `insert`; parent owns the textarea. */
  onReplace: (start: number, end: number, insert: string) => void;
  /** Build the injected prompt template for a chosen skill (reuses welcome template). */
  skillTemplate: (name: string) => string;
}

interface MenuItem {
  id: string;
  label: string;
  sublabel?: string;
  insert: string;
}

const MAX_ITEMS = 8;

/**
 * G10 + G11 — inline composer autocomplete. Typing `@` surfaces working-dir
 * files (via `artifacts.listRecentFiles`, no new backend); typing `/` surfaces
 * enabled skills as a command palette. Selecting inserts a `@path` reference or
 * the skill's prompt template. Keyboard-navigable; rendered above the composer.
 */
export const ComposerAutocomplete = forwardRef<
  ComposerAutocompleteHandle,
  ComposerAutocompleteProps
>(function ComposerAutocomplete(
  { textareaRef, value, cwd, enableCommands = false, onReplace, skillTemplate },
  ref
) {
  const { t } = useTranslation();
  const skills = useEnabledSkills();
  const [trigger, setTrigger] = useState<TriggerMatch | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [files, setFiles] = useState<Array<{ path: string; rel: string }>>([]);
  const loadedCwdRef = useRef<string | null>(null);

  const triggers = useMemo<Array<'@' | '/'>>(
    () => (enableCommands ? ['@', '/'] : ['@']),
    [enableCommands]
  );

  const loadFiles = useCallback(async () => {
    if (!cwd || typeof window === 'undefined' || !window.electronAPI) {
      setFiles([]);
      return;
    }
    if (loadedCwdRef.current === cwd) return;
    loadedCwdRef.current = cwd;
    try {
      const recent = await window.electronAPI.artifacts.listRecentFiles(cwd, 0, 200);
      setFiles(recent.map((f) => ({ path: f.path, rel: toRelativePath(f.path, cwd) })));
    } catch (err) {
      console.error('[ComposerAutocomplete] Failed to list files:', err);
      setFiles([]);
    }
  }, [cwd]);

  const sync = useCallback(() => {
    const el = textareaRef.current;
    if (!el) {
      setTrigger(null);
      return;
    }
    const caret = el.selectionStart ?? el.value.length;
    const match = detectTrigger(el.value, caret, triggers);
    setTrigger(match);
    setActiveIndex(0);
    if (match?.type === '@') void loadFiles();
  }, [textareaRef, triggers, loadFiles]);

  // Re-detect whenever the composed value changes (covers typing + programmatic edits).
  useEffect(() => {
    sync();
  }, [value, sync]);

  const items = useMemo<MenuItem[]>(() => {
    if (!trigger) return [];
    if (trigger.type === '@') {
      return files
        .filter((f) => matchesQuery(f.rel, trigger.query))
        .slice(0, MAX_ITEMS)
        .map((f) => ({ id: f.path, label: f.rel, insert: `@${f.rel} ` }));
    }
    // '/' command palette → enabled skills.
    if (!skills) return [];
    return skills
      .map((skill) => {
        const { name, description } = localizeSkill(skill, t);
        return { skill, name, description };
      })
      .filter(({ name }) => matchesQuery(name, trigger.query))
      .slice(0, MAX_ITEMS)
      .map(({ name, description }) => ({
        id: name,
        label: name,
        sublabel: description,
        insert: skillTemplate(name),
      }));
  }, [trigger, files, skills, t, skillTemplate]);

  const select = useCallback(
    (item: MenuItem) => {
      if (!trigger) return;
      const el = textareaRef.current;
      const end = el?.selectionStart ?? trigger.end;
      onReplace(trigger.start, end, item.insert);
      setTrigger(null);
    },
    [trigger, textareaRef, onReplace]
  );

  useImperativeHandle(
    ref,
    () => ({
      sync,
      isOpen: () => trigger !== null && items.length > 0,
      handleKeyDown: (e) => {
        if (!trigger || items.length === 0) return false;
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setActiveIndex((i) => (i + 1) % items.length);
          return true;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setActiveIndex((i) => (i - 1 + items.length) % items.length);
          return true;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          select(items[activeIndex] ?? items[0]);
          return true;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          setTrigger(null);
          return true;
        }
        return false;
      },
    }),
    [sync, trigger, items, activeIndex, select]
  );

  if (!trigger || items.length === 0) return null;

  const Icon = trigger.type === '@' ? FileText : Sparkles;
  const heading = trigger.type === '@' ? t('composer.mention.title') : t('composer.command.title');

  return (
    <div className="absolute bottom-full left-0 right-0 mb-2 z-30 max-h-72 overflow-y-auto rounded-2xl card-elevated animate-slide-up py-1.5">
      <div className="px-3 py-1 text-label uppercase text-text-muted">{heading}</div>
      {items.map((item, index) => (
        <button
          key={item.id}
          type="button"
          onMouseEnter={() => setActiveIndex(index)}
          onMouseDown={(e) => {
            // Keep textarea focus; select before blur.
            e.preventDefault();
            select(item);
          }}
          className={`w-full flex items-start gap-2.5 px-3 py-2 text-left transition-colors ${
            index === activeIndex ? 'bg-accent-muted' : 'hover:bg-surface-hover'
          }`}
        >
          <Icon
            className={`w-3.5 h-3.5 flex-shrink-0 mt-0.5 ${
              index === activeIndex ? 'text-accent' : 'text-text-muted'
            }`}
          />
          <span className="min-w-0 flex-1">
            <span className="block text-body-sm font-medium text-text-primary truncate">
              {item.label}
            </span>
            {item.sublabel && (
              <span className="block text-caption text-text-muted line-clamp-1">
                {item.sublabel}
              </span>
            )}
          </span>
        </button>
      ))}
    </div>
  );
});
