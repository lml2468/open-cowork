import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import type { TSchema } from '@sinclair/typebox';
import type { Message, Session } from '../../renderer/types';

export type CoreMemoryCategory = 'identity' | 'preferences' | 'skills' | 'interests';
export type MemorySearchKind = 'core';

export interface MemoryTranscriptTurn {
  role: string;
  content: string;
  messageId?: string;
  timestamp?: number;
}

export interface CoreMemoryActionInput {
  op: 'add' | 'update' | 'upsert' | 'delete';
  category?: CoreMemoryCategory;
  key: string;
  value?: string | null;
  reason?: string;
}

export interface AppliedCoreMemoryAction {
  op: 'add' | 'update' | 'upsert' | 'delete';
  category?: CoreMemoryCategory;
  key: string;
  value?: string | null;
  combinedKey: string;
}

export interface CoreMemoryEntry {
  combinedKey: string;
  category?: CoreMemoryCategory;
  key: string;
  value: string;
}

export interface MemorySearchParams {
  query: string;
  limit?: number;
}

export interface MemorySearchResult {
  id: string;
  recordId: string;
  kind: MemorySearchKind;
  title: string;
  summary: string;
  contentPreview: string;
  category?: CoreMemoryCategory;
  score: number;
  createdAt: number;
  updatedAt?: number;
  keywords?: string[];
  sourceFile?: string;
}

export interface MemoryReadResult extends MemorySearchResult {
  rawText?: string;
}

export interface MemoryIngestionInput {
  session: Session;
  prompt: string;
  messages: Message[];
}

export interface MemorySessionStateRecord {
  sessionId: string;
  sourceWorkspace?: string | null;
  lastProcessedMessageCount: number;
  lastIngestedAt?: number | null;
  lastError?: string | null;
  createdAt: number;
  updatedAt: number;
}

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

export interface MemoryToolDefinition extends ToolDefinition<TSchema, unknown> {}
