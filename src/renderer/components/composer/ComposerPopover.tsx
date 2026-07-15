import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

interface ComposerPopoverProps {
  /** Pill label (text/count). */
  label: ReactNode;
  icon: LucideIcon;
  /** Native tooltip / accessible title. */
  title?: string;
  /** Highlight the pill in the accent style when true. */
  active?: boolean;
  disabled?: boolean;
  /** Which edge of the pill the popover aligns to. */
  align?: 'left' | 'right';
  /** Popover body. Receives a `close` callback so items can dismiss on click. */
  children: (close: () => void) => ReactNode;
}

/**
 * A composer pill that toggles a popover anchored above it (composer sits at the
 * bottom of the viewport). Dismisses on outside click and Escape. Shared by the
 * model / skill / connector / mode pickers so dismiss logic isn't duplicated.
 */
export function ComposerPopover({
  label,
  icon: Icon,
  title,
  active = false,
  disabled = false,
  align = 'left',
  children,
}: ComposerPopoverProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointer = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        title={title}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-caption transition-colors disabled:opacity-50 disabled:cursor-not-allowed outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-opacity-50 ${
          active
            ? 'border-accent/40 bg-accent-muted text-accent'
            : 'border-border-subtle bg-background/60 text-text-secondary hover:bg-surface-hover hover:text-text-primary'
        }`}
      >
        <Icon className="w-3.5 h-3.5" />
        <span className="whitespace-nowrap max-w-[10rem] truncate">{label}</span>
      </button>

      {open && (
        <div
          className={`absolute bottom-full mb-2 z-30 w-72 max-h-80 overflow-hidden flex flex-col rounded-2xl card-elevated animate-slide-up ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {children(close)}
        </div>
      )}
    </div>
  );
}
