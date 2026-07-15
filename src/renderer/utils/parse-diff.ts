// Pure unified-diff parser used by the Changes tab / DiffViewer.
// Consumes the per-file raw diff text emitted by the main process
// (`artifacts.getChanges`) and produces structured hunks plus +N/-N stats.

export type DiffLineType = 'add' | 'del' | 'context' | 'hunk';

export interface DiffLine {
  type: DiffLineType;
  /** Line content without the leading +/-/space marker. */
  text: string;
  /** Line number in the old file (null for added / hunk lines). */
  oldLine: number | null;
  /** Line number in the new file (null for deleted / hunk lines). */
  newLine: number | null;
}

export type DiffFileStatus = 'added' | 'deleted' | 'modified' | 'renamed';

export interface ParsedDiffFile {
  path: string;
  status: DiffFileStatus;
  additions: number;
  deletions: number;
  isBinary: boolean;
  lines: DiffLine[];
}

const HUNK_RE = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/**
 * Parse a single file's unified diff text into structured lines and stats.
 * `fallbackPath` is used when the diff header does not carry a usable path.
 */
export function parseFileDiff(diff: string, fallbackPath: string): ParsedDiffFile {
  const rawLines = diff.split('\n');
  const lines: DiffLine[] = [];
  let additions = 0;
  let deletions = 0;
  let isBinary = false;
  let status: DiffFileStatus = 'modified';
  let path = fallbackPath;
  let oldLine = 0;
  let newLine = 0;
  let inHunk = false;

  for (const raw of rawLines) {
    if (raw.startsWith('diff --git ')) {
      const m = raw.match(/^diff --git a\/(.+?) b\/(.+)$/);
      if (m) {
        path = m[2];
      }
      continue;
    }
    if (raw.startsWith('new file mode')) {
      status = 'added';
      continue;
    }
    if (raw.startsWith('deleted file mode')) {
      status = 'deleted';
      continue;
    }
    if (raw.startsWith('rename from') || raw.startsWith('rename to')) {
      status = 'renamed';
      continue;
    }
    if (raw.startsWith('Binary files')) {
      isBinary = true;
      continue;
    }
    if (
      raw.startsWith('index ') ||
      raw.startsWith('--- ') ||
      raw.startsWith('+++ ') ||
      raw.startsWith('similarity index') ||
      raw.startsWith('old mode') ||
      raw.startsWith('new mode') ||
      raw.startsWith('\\ No newline')
    ) {
      continue;
    }

    const hunkMatch = raw.match(HUNK_RE);
    if (hunkMatch) {
      oldLine = Number(hunkMatch[1]);
      newLine = Number(hunkMatch[2]);
      inHunk = true;
      lines.push({ type: 'hunk', text: raw, oldLine: null, newLine: null });
      continue;
    }

    if (!inHunk) {
      continue;
    }

    if (raw.startsWith('+')) {
      additions += 1;
      lines.push({ type: 'add', text: raw.slice(1), oldLine: null, newLine });
      newLine += 1;
    } else if (raw.startsWith('-')) {
      deletions += 1;
      lines.push({ type: 'del', text: raw.slice(1), oldLine, newLine: null });
      oldLine += 1;
    } else {
      // Context line (leading space) or an empty trailing line.
      const text = raw.startsWith(' ') ? raw.slice(1) : raw;
      lines.push({ type: 'context', text, oldLine, newLine });
      oldLine += 1;
      newLine += 1;
    }
  }

  return { path, status, additions, deletions, isBinary, lines };
}

export interface RawChangeFile {
  path: string;
  diff: string;
}

/** Parse a list of raw per-file diffs into structured files. */
export function parseChanges(files: RawChangeFile[]): ParsedDiffFile[] {
  return files.map((f) => parseFileDiff(f.diff, f.path));
}
