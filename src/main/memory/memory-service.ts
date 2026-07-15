import * as fs from 'node:fs';
import * as path from 'node:path';
import { configStore } from '../config/config-store';
import type { DatabaseInstance } from '../db/database';
import { getFileSizeBytes, getFileTimestampMs } from './memory-utils';
import type { MemoryDebugFileContent, MemoryDebugFileInfo, MemoryOverview } from './memory-types';
import {
  MEMORY_INDEX_FILE,
  buildMemoryPreamble,
  ensureMemoryScaffold,
  getGlobalMemoryRoot,
  getProjectMemoryRoot,
  readMemoryIndex,
} from './markdown-memory';

/**
 * MemoryService — thin coordinator for the agent-managed Markdown memory
 * (see {@link ./markdown-memory}). It no longer stores memory itself (no JSON, no LLM
 * extractor, no custom tools): the agent reads/writes the Markdown files with its own tools.
 * This service (1) seeds/migrates the memory dirs, (2) builds the per-session injection
 * preamble, and (3) backs the memory Settings view (overview + file browser).
 */
export class MemoryService {
  // `db` retained for signature compatibility with existing call sites; not used now that
  // memory is file-based and agent-managed.
  constructor(_db: DatabaseInstance) {}

  isEnabled(): boolean {
    return configStore.get('memoryEnabled') !== false;
  }

  setEnabled(enabled: boolean): { success: boolean; enabled: boolean } {
    configStore.update({ memoryEnabled: enabled });
    return { success: true, enabled };
  }

  /**
   * Build the memory preamble injected into a turn: agent instructions (paths + how to manage
   * memory) plus the current global + project MEMORY.md contents. Also seeds the dirs and runs
   * the one-time legacy JSON→Markdown migration.
   */
  buildPromptPrefix(session: { cwd?: string }, _prompt: string): string {
    if (!this.isEnabled()) return '';

    const globalRoot = getGlobalMemoryRoot();
    ensureMemoryScaffold(globalRoot);

    const projectRoot = getProjectMemoryRoot(session.cwd);
    if (projectRoot) ensureMemoryScaffold(projectRoot);

    return buildMemoryPreamble({ globalRoot, projectRoot });
  }

  /** Overview for the Settings memory view. */
  getOverview(): MemoryOverview {
    const globalRoot = getGlobalMemoryRoot();
    const indexFile = path.join(globalRoot, MEMORY_INDEX_FILE);
    const index = readMemoryIndex(globalRoot) ?? '';
    // "coreCount" ≈ number of index bullet/heading lines (a rough durable-fact count).
    const coreCount = index.split('\n').filter((l) => /^\s*(-|\*|\d+\.)\s+/.test(l)).length;
    return {
      enabled: this.isEnabled(),
      storageRoot: globalRoot,
      coreFilePath: indexFile,
      stateFilePath: indexFile,
      coreCount,
      failedSessionCount: 0,
      latestIngestionAt: getFileTimestampMs(indexFile),
      latestError: null,
    };
  }

  /** List the Markdown memory files (global scope) for the Settings file browser. */
  listFiles(): MemoryDebugFileInfo[] {
    const globalRoot = getGlobalMemoryRoot();
    return this.listMarkdownFiles(globalRoot);
  }

  readFile(filePath: string): MemoryDebugFileContent {
    const normalizedPath = this.resolveReadablePath(filePath);
    const raw = fs.readFileSync(normalizedPath, 'utf8');
    return {
      kind: 'core',
      filePath: normalizedPath,
      text: raw,
      parsed: null,
      sizeBytes: getFileSizeBytes(normalizedPath),
      updatedAt: getFileTimestampMs(normalizedPath),
    };
  }

  /** Reset the global MEMORY.md index (Settings "clear memory"). */
  clearCoreMemory(): { success: boolean } {
    try {
      const globalRoot = getGlobalMemoryRoot();
      ensureMemoryScaffold(globalRoot);
      fs.writeFileSync(path.join(globalRoot, MEMORY_INDEX_FILE), '# Memory\n', 'utf8');
      return { success: true };
    } catch {
      return { success: false };
    }
  }

  /** No-op: memory is no longer keyed per session (agent-managed files). */
  async deleteSession(_sessionId: string): Promise<void> {}

  private listMarkdownFiles(root: string): MemoryDebugFileInfo[] {
    let names: string[] = [];
    try {
      names = fs.existsSync(root)
        ? fs.readdirSync(root).filter((n) => n.toLowerCase().endsWith('.md'))
        : [];
    } catch {
      names = [];
    }
    // MEMORY.md first, then the rest alphabetically.
    names.sort((a, b) =>
      a === MEMORY_INDEX_FILE ? -1 : b === MEMORY_INDEX_FILE ? 1 : a.localeCompare(b)
    );
    return names.map((name) => {
      const filePath = path.join(root, name);
      return {
        kind: 'core',
        label: name,
        filePath,
        exists: true,
        sizeBytes: getFileSizeBytes(filePath),
        updatedAt: getFileTimestampMs(filePath),
      };
    });
  }

  private resolveReadablePath(filePath: string): string {
    const requestedPath = path.resolve(filePath);
    if (!fs.existsSync(requestedPath)) {
      throw new Error('Requested file does not exist');
    }
    const normalizedPath = fs.realpathSync(requestedPath);
    // Only allow reading Markdown files inside a memory root.
    const globalRoot = fs.existsSync(getGlobalMemoryRoot())
      ? fs.realpathSync(getGlobalMemoryRoot())
      : getGlobalMemoryRoot();
    const withinGlobal = normalizedPath.startsWith(`${globalRoot}${path.sep}`);
    if (!withinGlobal || !normalizedPath.toLowerCase().endsWith('.md')) {
      throw new Error('Requested file is outside allowed memory files');
    }
    return normalizedPath;
  }
}
