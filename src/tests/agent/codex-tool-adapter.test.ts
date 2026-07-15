import { describe, it, expect } from 'vitest';
import { Type } from '@sinclair/typebox';
import {
  adaptCustomToolToCodexHostTool,
  adaptCustomToolsToCodexHostTools,
} from '@/main/agent/codex-runtime/codex-tool-adapter';
import type { AgentRuntimeCustomTool } from '@/main/extensions/agent-runtime-extension';

/**
 * Build a minimal fake host custom tool. Uses a real TypeBox schema so the JSON-Schema
 * conversion is exercised against actual TypeBox `Symbol` keys, not a hand-rolled object.
 */
function makeFakeTool(
  execute: (
    params: unknown
  ) => Promise<{ content: { type: string; text?: string }[]; isError?: boolean; details?: unknown }>
): AgentRuntimeCustomTool {
  const tool = {
    name: 'fake_tool',
    description: 'A fake tool for testing',
    parameters: Type.Object({
      query: Type.String({ description: 'the query' }),
      limit: Type.Optional(Type.Number()),
    }),
    execute,
  };
  return tool as unknown as AgentRuntimeCustomTool;
}

describe('adaptCustomToolToCodexHostTool', () => {
  it('maps name and description straight through', () => {
    const codexTool = adaptCustomToolToCodexHostTool(
      makeFakeTool(async () => ({ content: [{ type: 'text', text: 'ok' }], details: undefined }))
    );
    expect(codexTool.name).toBe('fake_tool');
    expect(codexTool.description).toBe('A fake tool for testing');
  });

  it('converts the TypeBox schema into a plain JSON-Schema object (no Symbol keys)', () => {
    const codexTool = adaptCustomToolToCodexHostTool(
      makeFakeTool(async () => ({ content: [{ type: 'text', text: 'ok' }], details: undefined }))
    );
    // Structural JSON-Schema shape survives.
    expect(codexTool.parameters.type).toBe('object');
    const props = codexTool.parameters.properties as Record<string, unknown>;
    expect(props.query).toMatchObject({ type: 'string', description: 'the query' });
    expect(props.limit).toMatchObject({ type: 'number' });
    // No TypeBox Symbol keys leak into the plain object.
    expect(Object.getOwnPropertySymbols(codexTool.parameters)).toHaveLength(0);
    // It is a clone, not the original schema object.
    expect(codexTool.parameters).not.toBe(
      (makeFakeTool(async () => ({ content: [], details: undefined })) as { parameters: unknown })
        .parameters
    );
  });

  it('delegates execute and flattens text content to a string', async () => {
    let receivedParams: unknown;
    const codexTool = adaptCustomToolToCodexHostTool(
      makeFakeTool(async (params) => {
        receivedParams = params;
        return {
          content: [
            { type: 'text', text: 'line one' },
            { type: 'text', text: 'line two' },
          ],
          details: undefined,
        };
      })
    );

    const result = await codexTool.execute({ query: 'hello' });
    expect(result.content).toBe('line one\nline two');
    expect(result.isError).toBeUndefined();
    expect(receivedParams).toEqual({ query: 'hello' });
  });

  it('represents non-text content by its type marker', async () => {
    const codexTool = adaptCustomToolToCodexHostTool(
      makeFakeTool(async () => ({
        content: [{ type: 'text', text: 'caption' }, { type: 'image' }],
        details: undefined,
      }))
    );
    const result = await codexTool.execute({ query: 'x' });
    expect(result.content).toBe('caption\n[image]');
  });

  it('maps an isError flag from the pi result', async () => {
    const codexTool = adaptCustomToolToCodexHostTool(
      makeFakeTool(async () => ({
        content: [{ type: 'text', text: 'something went wrong' }],
        isError: true,
        details: undefined,
      }))
    );
    const result = await codexTool.execute({ query: 'x' });
    expect(result.isError).toBe(true);
    expect(result.content).toBe('something went wrong');
  });

  it('converts a thrown pi execute into an error result instead of throwing', async () => {
    const codexTool = adaptCustomToolToCodexHostTool(
      makeFakeTool(async () => {
        throw new Error('boom');
      })
    );
    const result = await codexTool.execute({ query: 'x' });
    expect(result.isError).toBe(true);
    expect(result.content).toBe('boom');
  });

  it('handles a non-Error throw', async () => {
    const codexTool = adaptCustomToolToCodexHostTool(
      makeFakeTool(async () => {
        throw 'plain string failure';
      })
    );
    const result = await codexTool.execute({ query: 'x' });
    expect(result.isError).toBe(true);
    expect(result.content).toBe('plain string failure');
  });

  it('tolerates a result with missing content', async () => {
    const codexTool = adaptCustomToolToCodexHostTool(
      makeFakeTool(async () => ({ content: undefined as unknown as { type: string }[] }))
    );
    const result = await codexTool.execute({ query: 'x' });
    expect(result.content).toBe('');
    expect(result.isError).toBeUndefined();
  });
});

describe('adaptCustomToolsToCodexHostTools', () => {
  it('adapts a list of tools preserving order', () => {
    const first = makeFakeTool(async () => ({ content: [{ type: 'text', text: 'a' }] }));
    const second = { ...makeFakeTool(async () => ({ content: [] })), name: 'second' };
    const adapted = adaptCustomToolsToCodexHostTools([
      first,
      second as unknown as AgentRuntimeCustomTool,
    ]);
    expect(adapted).toHaveLength(2);
    expect(adapted[0].name).toBe('fake_tool');
    expect(adapted[1].name).toBe('second');
  });
});
