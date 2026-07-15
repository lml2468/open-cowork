/**
 * Types for the agent-managed Markdown memory Settings view (overview + file browser).
 * The memory data itself is plain Markdown the agent manages; these describe the read-only
 * views the renderer shows.
 */

export interface MemoryDebugFileInfo {
  kind: 'core' | 'state';
  label: string;
  filePath: string;
  exists: boolean;
  sizeBytes: number;
  updatedAt: number | null;
}

export interface MemoryDebugFileContent {
  kind: MemoryDebugFileInfo['kind'];
  filePath: string;
  text: string;
  parsed: unknown | null;
  sizeBytes: number;
  updatedAt: number | null;
}

export interface MemoryOverview {
  enabled: boolean;
  storageRoot: string;
  coreFilePath: string;
  stateFilePath: string;
  coreCount: number;
  failedSessionCount: number;
  latestIngestionAt: number | null;
  latestError: string | null;
}
