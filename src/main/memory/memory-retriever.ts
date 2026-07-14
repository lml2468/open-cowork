import type {
  CoreMemoryEntry,
  MemoryReadResult,
  MemorySearchParams,
  MemorySearchResult,
} from './memory-types';
import { lexicalScore, summarizeText } from './memory-utils';

function buildSearchId(kind: string, recordId: string): string {
  return `${kind}|${encodeURIComponent(recordId)}`;
}

function parseSearchId(id: string): { kind: string; recordId: string } | null {
  const separator = id.indexOf('|');
  if (separator <= 0) {
    return null;
  }
  return {
    kind: id.slice(0, separator),
    recordId: decodeURIComponent(id.slice(separator + 1)),
  };
}

export class MemoryRetriever {
  constructor(
    private readonly deps: {
      getCoreEntries: () => CoreMemoryEntry[];
      getCoreFilePath: () => string;
      getSessionTitle: (sessionId: string) => string | undefined;
    }
  ) {}

  search(params: MemorySearchParams): MemorySearchResult[] {
    const query = params.query.trim();
    if (!query) {
      return [];
    }

    const limit = Math.min(Math.max(params.limit || 8, 1), 50);
    return this.searchCore(query)
      .sort(
        (a, b) => b.score - a.score || (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt)
      )
      .slice(0, limit);
  }

  read(id: string): MemoryReadResult | null {
    const parsed = parseSearchId(id);
    if (!parsed || parsed.kind !== 'core') {
      return null;
    }
    return this.readCore(parsed.recordId);
  }

  private searchCore(query: string): MemorySearchResult[] {
    return this.deps
      .getCoreEntries()
      .map((entry): MemorySearchResult | null => {
        const score = lexicalScore(query, `${entry.combinedKey} ${entry.value}`);
        if (score <= 0) {
          return null;
        }
        return {
          id: buildSearchId('core', entry.combinedKey),
          recordId: entry.combinedKey,
          kind: 'core',
          title: entry.combinedKey,
          summary: entry.value,
          contentPreview: summarizeText(entry.value, 220),
          category: entry.category,
          sourceFile: this.deps.getCoreFilePath(),
          score,
          createdAt: 0,
          updatedAt: 0,
        };
      })
      .filter((item): item is MemorySearchResult => Boolean(item));
  }

  private readCore(combinedKey: string): MemoryReadResult | null {
    const entry = this.deps.getCoreEntries().find((item) => item.combinedKey === combinedKey);
    if (!entry) {
      return null;
    }
    return {
      id: buildSearchId('core', entry.combinedKey),
      recordId: entry.combinedKey,
      kind: 'core',
      title: entry.combinedKey,
      summary: entry.value,
      contentPreview: summarizeText(entry.value, 220),
      rawText: entry.value,
      category: entry.category,
      score: 0,
      createdAt: 0,
      updatedAt: 0,
      sourceFile: this.deps.getCoreFilePath(),
    };
  }
}
