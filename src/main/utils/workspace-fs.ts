import fs from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import path from 'node:path';

export interface WorkspaceDirEntry {
  name: string;
  /** Path relative to the workspace root, POSIX-style separators. */
  relPath: string;
  /** Absolute path on disk. */
  path: string;
  isDirectory: boolean;
  size: number;
  modifiedAt: number;
}

export interface WorkspaceFilePreview {
  relPath: string;
  path: string;
  /** UTF-8 text content when the file is textual and readable. */
  content: string;
  /** True when content was cut off at the byte cap. */
  truncated: boolean;
  /** True when the file looked binary (content is then empty). */
  isBinary: boolean;
  size: number;
}

const EXCLUDED_DIRS = new Set([
  '.git',
  'node_modules',
  '.cowork-user-data',
  '__pycache__',
  '.pytest_cache',
  '.mypy_cache',
  '.ruff_cache',
  '.turbo',
]);

const EXCLUDED_FILES = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini', '.localized']);

const DEFAULT_PREVIEW_BYTES = 256 * 1024; // 256 KB cap for text preview.

/**
 * Resolve `relPath` against `rootDir` and confirm it stays inside the root.
 * Returns the absolute path, or `null` when the target escapes the workspace.
 */
export function resolveWithinRoot(rootDir: string, relPath: string): string | null {
  const root = path.resolve(rootDir);
  const target = path.resolve(root, relPath || '.');
  if (target === root) {
    return target;
  }
  const withSep = root.endsWith(path.sep) ? root : root + path.sep;
  if (!target.startsWith(withSep)) {
    return null;
  }
  return target;
}

function toRelPosix(rootDir: string, absPath: string): string {
  const rel = path.relative(path.resolve(rootDir), absPath);
  return rel.split(path.sep).join('/');
}

/**
 * List the immediate children of `relPath` inside the workspace root.
 * Directories sort before files; both alphabetically. Hidden noise
 * (`.git`, `node_modules`, OS sidecar files) is filtered out.
 */
export async function listWorkspaceDir(
  rootDir: string,
  relPath: string = ''
): Promise<WorkspaceDirEntry[]> {
  if (!rootDir || !path.isAbsolute(rootDir)) {
    return [];
  }
  const dir = resolveWithinRoot(rootDir, relPath);
  if (!dir) {
    return [];
  }

  let entries: Dirent[] = [];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const results: WorkspaceDirEntry[] = [];
  for (const entry of entries) {
    if (entry.isSymbolicLink()) {
      continue;
    }
    const isDir = entry.isDirectory();
    if (isDir && EXCLUDED_DIRS.has(entry.name)) {
      continue;
    }
    if (!isDir && !entry.isFile()) {
      continue;
    }
    if (!isDir && EXCLUDED_FILES.has(entry.name)) {
      continue;
    }

    const fullPath = path.join(dir, entry.name);
    let size = 0;
    let modifiedAt = 0;
    try {
      const stat = await fs.stat(fullPath);
      size = stat.size;
      modifiedAt = Math.max(stat.mtimeMs, stat.birthtimeMs || 0);
    } catch {
      continue;
    }

    results.push({
      name: entry.name,
      relPath: toRelPosix(rootDir, fullPath),
      path: fullPath,
      isDirectory: isDir,
      size,
      modifiedAt,
    });
  }

  return results.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) {
      return a.isDirectory ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
}

/** Heuristic: a NUL byte in the first chunk means the file is binary. */
function looksBinary(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, Math.min(buffer.length, 8000));
  return sample.includes(0);
}

/**
 * Read a workspace file for preview. Returns UTF-8 text (capped at
 * `maxBytes`), or an `isBinary` flag when the file is not textual.
 */
export async function readWorkspaceFile(
  rootDir: string,
  relPath: string,
  maxBytes: number = DEFAULT_PREVIEW_BYTES
): Promise<WorkspaceFilePreview | null> {
  if (!rootDir || !path.isAbsolute(rootDir)) {
    return null;
  }
  const target = resolveWithinRoot(rootDir, relPath);
  if (!target) {
    return null;
  }

  let stat: Awaited<ReturnType<typeof fs.stat>>;
  try {
    stat = await fs.stat(target);
  } catch {
    return null;
  }
  if (!stat.isFile()) {
    return null;
  }

  let buffer: Buffer;
  try {
    const handle = await fs.open(target, 'r');
    try {
      const readSize = Math.min(stat.size, maxBytes);
      buffer = Buffer.alloc(readSize);
      await handle.read(buffer, 0, readSize, 0);
    } finally {
      await handle.close();
    }
  } catch {
    return null;
  }

  const base: WorkspaceFilePreview = {
    relPath: toRelPosix(rootDir, target),
    path: target,
    content: '',
    truncated: stat.size > maxBytes,
    isBinary: false,
    size: stat.size,
  };

  if (looksBinary(buffer)) {
    return { ...base, isBinary: true };
  }

  return { ...base, content: buffer.toString('utf8') };
}
