import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface WorkspaceChangeFile {
  /** File path relative to the repo root, POSIX separators. */
  path: string;
  /** Raw unified-diff text for this single file (parsed by the renderer). */
  diff: string;
}

export interface WorkspaceChanges {
  isGitRepo: boolean;
  files: WorkspaceChangeFile[];
}

const MAX_FILES = 300;
const MAX_UNTRACKED_BYTES = 256 * 1024;
const GIT_MAX_BUFFER = 32 * 1024 * 1024; // 32 MB diff cap.

async function runGit(rootDir: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['-C', rootDir, ...args], {
      maxBuffer: GIT_MAX_BUFFER,
      windowsHide: true,
    });
    return stdout;
  } catch {
    return null;
  }
}

/** Split a combined `git diff` payload into one chunk per file. */
export function splitGitDiff(diffText: string): string[] {
  if (!diffText.trim()) {
    return [];
  }
  const chunks: string[] = [];
  const lines = diffText.split('\n');
  let current: string[] = [];
  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      if (current.length > 0) {
        chunks.push(current.join('\n'));
      }
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) {
    chunks.push(current.join('\n'));
  }
  return chunks;
}

/** Extract the `b/<path>` (or `a/<path>`) file path from a diff chunk header. */
export function chunkFilePath(chunk: string): string {
  const header = chunk.split('\n', 1)[0];
  const match = header.match(/^diff --git a\/(.+?) b\/(.+)$/);
  if (match) {
    return match[2];
  }
  const plus = chunk.match(/^\+\+\+ b\/(.+)$/m);
  if (plus && plus[1] !== '/dev/null') {
    return plus[1];
  }
  const minus = chunk.match(/^--- a\/(.+)$/m);
  if (minus && minus[1] !== '/dev/null') {
    return minus[1];
  }
  return header.replace(/^diff --git /, '').trim();
}

function hasNul(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, Math.min(buffer.length, 8000));
  return sample.includes(0);
}

/** Build a synthetic "new file" unified diff for an untracked file. */
async function buildUntrackedDiff(rootDir: string, relPath: string): Promise<string | null> {
  const abs = path.join(rootDir, relPath);
  let buffer: Buffer;
  try {
    const handle = await fs.open(abs, 'r');
    try {
      const stat = await handle.stat();
      const readSize = Math.min(stat.size, MAX_UNTRACKED_BYTES);
      buffer = Buffer.alloc(readSize);
      await handle.read(buffer, 0, readSize, 0);
    } finally {
      await handle.close();
    }
  } catch {
    return null;
  }

  const head = `diff --git a/${relPath} b/${relPath}\nnew file mode 100644`;
  if (hasNul(buffer)) {
    return `${head}\nBinary files /dev/null and b/${relPath} differ`;
  }

  const text = buffer.toString('utf8');
  const lines = text.length === 0 ? [] : text.replace(/\n$/, '').split('\n');
  const count = lines.length;
  const body = lines.map((l) => `+${l}`).join('\n');
  return `${head}\n--- /dev/null\n+++ b/${relPath}\n@@ -0,0 +1,${count} @@\n${body}`;
}

/**
 * Compute the working-directory changes for `rootDir` using git. Covers
 * tracked (staged + unstaged) modifications and untracked files. Degrades to
 * `{ isGitRepo: false }` when the directory is not a git repo or git is
 * unavailable. Sandbox-VM working dirs are not covered (host filesystem only).
 */
export async function getWorkspaceChanges(rootDir: string): Promise<WorkspaceChanges> {
  if (!rootDir || !path.isAbsolute(rootDir)) {
    return { isGitRepo: false, files: [] };
  }

  const inside = await runGit(rootDir, ['rev-parse', '--is-inside-work-tree']);
  if (inside === null || inside.trim() !== 'true') {
    return { isGitRepo: false, files: [] };
  }

  const byPath = new Map<string, string>();

  // Tracked changes vs HEAD (staged + unstaged). Falls back to index/worktree
  // diffs for a repo without any commits.
  let tracked = await runGit(rootDir, ['diff', '--no-color', 'HEAD']);
  if (tracked === null) {
    const cached = (await runGit(rootDir, ['diff', '--no-color', '--cached'])) ?? '';
    const unstaged = (await runGit(rootDir, ['diff', '--no-color'])) ?? '';
    tracked = `${cached}\n${unstaged}`;
  }
  for (const chunk of splitGitDiff(tracked)) {
    byPath.set(chunkFilePath(chunk), chunk);
  }

  // Untracked files.
  const untracked = await runGit(rootDir, ['ls-files', '--others', '--exclude-standard']);
  if (untracked) {
    const paths = untracked
      .split('\n')
      .map((p) => p.trim())
      .filter(Boolean);
    for (const relPath of paths) {
      if (byPath.has(relPath)) {
        continue;
      }
      const chunk = await buildUntrackedDiff(rootDir, relPath);
      if (chunk) {
        byPath.set(relPath, chunk);
      }
      if (byPath.size >= MAX_FILES) {
        break;
      }
    }
  }

  const files: WorkspaceChangeFile[] = [];
  for (const [filePath, diff] of byPath) {
    files.push({ path: filePath, diff });
    if (files.length >= MAX_FILES) {
      break;
    }
  }
  files.sort((a, b) => a.path.localeCompare(b.path));

  return { isGitRepo: true, files };
}
