import { Type } from '@sinclair/typebox';
import type { MemoryService } from './memory-service';
import type { MemoryReadResult, MemorySearchResult, MemoryToolDefinition } from './memory-types';

function formatSearchResult(result: MemorySearchResult): string {
  const lines = [
    `- id: ${result.id}`,
    `  type: ${result.kind}`,
    `  title: ${result.title}`,
    `  summary: ${result.summary}`,
  ];
  if (result.sourceFile) {
    lines.push(`  file: ${result.sourceFile}`);
  }
  return lines.join('\n');
}

function formatReadResult(result: MemoryReadResult): string {
  const lines = [
    `id: ${result.id}`,
    `type: ${result.kind}`,
    `title: ${result.title}`,
    `summary: ${result.summary}`,
  ];
  if (result.sourceFile) {
    lines.push(`file: ${result.sourceFile}`);
  }
  if (result.rawText) {
    lines.push(`raw_text:\n${result.rawText}`);
  }
  return lines.join('\n\n');
}

export function createMemoryTools(memoryService: MemoryService): MemoryToolDefinition[] {
  const searchTool: MemoryToolDefinition = {
    name: 'memory_search',
    label: 'memory_search',
    description: 'Search long-term core memory (durable identity, preferences, skills, interests).',
    parameters: Type.Object({
      query: Type.String({ minLength: 1, description: 'What you want to remember or look up.' }),
      limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 20 })),
    }),
    async execute(_toolCallId: string, params: unknown) {
      const result = memoryService.search({
        query: String((params as { query: string }).query || ''),
        limit:
          typeof (params as { limit?: number }).limit === 'number'
            ? (params as { limit?: number }).limit
            : undefined,
      });

      const text =
        result.length > 0
          ? [`Found ${result.length} memory result(s):`, ...result.map(formatSearchResult)].join(
              '\n\n'
            )
          : 'No relevant memory found.';
      return {
        content: [{ type: 'text' as const, text }],
        details: undefined as unknown,
      };
    },
  };

  const readTool: MemoryToolDefinition = {
    name: 'memory_read',
    label: 'memory_read',
    description: 'Read a core memory item returned by memory_search in full detail.',
    parameters: Type.Object({
      id: Type.String({ minLength: 1, description: 'The id returned by memory_search.' }),
    }),
    async execute(_toolCallId: string, params: unknown) {
      const result = memoryService.read(String((params as { id: string }).id || ''));
      const text = result ? formatReadResult(result) : 'Memory item not found.';
      return {
        content: [{ type: 'text' as const, text }],
        details: undefined as unknown,
      };
    },
  };

  return [searchTool, readTool];
}
