import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Trap keyboard focus inside a modal dialog while it is open.
 *
 * - Returns a ref to attach to the dialog container.
 * - On activate: if focus isn't already inside (e.g. an element used autoFocus),
 *   moves focus to the first focusable element.
 * - While active: Tab / Shift+Tab cycle within the container (focus can't escape
 *   to the background page).
 * - On deactivate/unmount: returns focus to whatever was focused before it opened.
 *
 * Accessibility is part of the design bar — every modal should own its focus.
 */
export function useFocusTrap<T extends HTMLElement>(active: boolean) {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!active) return;
    const container = ref.current;
    if (!container) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusable = () => Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));

    // Respect an existing autoFocus target inside the dialog; otherwise focus the first control.
    if (!container.contains(document.activeElement)) {
      const els = focusable();
      (els[0] ?? container).focus();
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const els = focusable();
      if (els.length === 0) {
        e.preventDefault();
        return;
      }
      const first = els[0];
      const last = els[els.length - 1];
      const activeEl = document.activeElement as HTMLElement | null;
      const outside = !activeEl || !container.contains(activeEl);
      if (e.shiftKey) {
        if (outside || activeEl === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (outside || activeEl === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      // Restore focus to the trigger, if it's still in the document.
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
  }, [active]);

  return ref;
}
