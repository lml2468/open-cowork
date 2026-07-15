/**
 * Pure helpers for the composer's inline autocomplete (G10 `@`-file mentions and
 * G11 `/`-command palette). Kept free of React/DOM so they can be unit-tested.
 */

export type TriggerChar = '@' | '/';

export interface TriggerMatch {
  /** Which trigger fired. */
  type: TriggerChar;
  /** Query text typed after the trigger char (may be empty). */
  query: string;
  /** Index of the trigger char within the source string. */
  start: number;
  /** Caret index (exclusive end of the trigger token). */
  end: number;
}

/**
 * Detects an active autocomplete trigger immediately to the left of the caret.
 *
 * A trigger is only recognized when its trigger char begins a token — i.e. it
 * sits at the very start of the text or is preceded by whitespace — and the
 * text between the trigger char and the caret contains no whitespace. This
 * prevents matching e.g. an email address (`a@b`) or a path (`src/foo`).
 */
export function detectTrigger(
  text: string,
  caret: number,
  triggers: readonly TriggerChar[] = ['@', '/']
): TriggerMatch | null {
  if (caret < 0 || caret > text.length) return null;

  // Walk backwards from the caret looking for a trigger char. Stop at the first
  // whitespace (token boundary) — a trigger token cannot contain whitespace.
  for (let i = caret - 1; i >= 0; i -= 1) {
    const ch = text[i];
    if (ch === ' ' || ch === '\n' || ch === '\t') {
      return null;
    }
    if ((triggers as readonly string[]).includes(ch)) {
      const prev = i > 0 ? text[i - 1] : '';
      const atTokenStart = i === 0 || prev === ' ' || prev === '\n' || prev === '\t';
      if (!atTokenStart) return null;
      return {
        type: ch as TriggerChar,
        query: text.slice(i + 1, caret),
        start: i,
        end: caret,
      };
    }
  }
  return null;
}

/**
 * Splices `insert` into `text`, replacing the half-open range [start, end).
 * Returns the new text plus the caret position that should follow the insert.
 */
export function replaceRange(
  text: string,
  start: number,
  end: number,
  insert: string
): { text: string; caret: number } {
  const safeStart = Math.max(0, Math.min(start, text.length));
  const safeEnd = Math.max(safeStart, Math.min(end, text.length));
  const next = text.slice(0, safeStart) + insert + text.slice(safeEnd);
  return { text: next, caret: safeStart + insert.length };
}

/**
 * Converts an absolute file path to a workspace-relative path for display in a
 * mention chip. Falls back to the basename when the file is outside `cwd`.
 */
export function toRelativePath(absolutePath: string, cwd: string | null | undefined): string {
  if (!cwd) return basename(absolutePath);
  // Normalize trailing separators on cwd.
  const normalizedCwd = cwd.replace(/[\\/]+$/, '');
  const prefix = `${normalizedCwd}/`;
  const prefixWin = `${normalizedCwd}\\`;
  if (absolutePath.startsWith(prefix)) return absolutePath.slice(prefix.length);
  if (absolutePath.startsWith(prefixWin)) return absolutePath.slice(prefixWin.length);
  return basename(absolutePath);
}

/** Case-insensitive subsequence-friendly filter used by the mention/command lists. */
export function matchesQuery(candidate: string, query: string): boolean {
  if (!query) return true;
  return candidate.toLowerCase().includes(query.toLowerCase());
}

function basename(p: string): string {
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1] || p;
}
