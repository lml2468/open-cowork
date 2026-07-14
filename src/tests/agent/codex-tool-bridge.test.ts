import { describe, it, expect, vi } from 'vitest';
import {
  CodexToolBridge,
  TOOL_CALL_METHOD,
  type CodexHostTool,
} from '@/main/agent/codex-runtime/codex-tool-bridge';
import type { CodexServerRequest } from '@/main/agent/codex-runtime/codex-client';

function toolCall(params: unknown): CodexServerRequest {
  return { id: 7, method: TOOL_CALL_METHOD, params };
}

const echoTool: CodexHostTool = {
  name: 'echo',
  description: 'Echoes its input',
  parameters: { type: 'object', properties: { text: { type: 'string' } } },
  execute: (args) => ({ content: `echo:${String(args.text)}` }),
};

describe('CodexToolBridge', () => {
  it('claims only the item/tool/call method', () => {
    const bridge = new CodexToolBridge([echoTool]);
    expect(bridge.canHandle(TOOL_CALL_METHOD)).toBe(true);
    expect(bridge.canHandle('item/commandExecution/requestApproval')).toBe(false);
  });

  it('builds codex dynamic_tools registration specs from host tools', () => {
    const bridge = new CodexToolBridge([
      echoTool,
      { ...echoTool, name: 'lazy', deferLoading: true },
    ]);
    const specs = bridge.buildDynamicToolSpecs();
    expect(specs).toContainEqual({
      type: 'function',
      name: 'echo',
      description: 'Echoes its input',
      inputSchema: echoTool.parameters,
    });
    const lazy = specs.find((s) => s.name === 'lazy');
    expect(lazy?.deferLoading).toBe(true);
  });

  it('dispatches a call to the matching tool and returns a success envelope', async () => {
    const execute = vi.fn(echoTool.execute);
    const bridge = new CodexToolBridge([{ ...echoTool, execute }]);
    const res = await bridge.handle(toolCall({ tool: 'echo', arguments: { text: 'hi' } }));
    expect(execute).toHaveBeenCalledWith({ text: 'hi' });
    expect(res).toEqual({ content_items: [{ type: 'text', text: 'echo:hi' }], success: true });
  });

  it('marks a tool result as unsuccessful when the tool reports isError', async () => {
    const bridge = new CodexToolBridge([
      {
        name: 'boom',
        description: '',
        parameters: {},
        execute: () => ({ content: 'nope', isError: true }),
      },
    ]);
    const res = await bridge.handle(toolCall({ tool: 'boom', arguments: {} }));
    expect(res).toEqual({ content_items: [{ type: 'text', text: 'nope' }], success: false });
  });

  it('returns an error envelope for an unknown tool', async () => {
    const bridge = new CodexToolBridge([echoTool]);
    const res = await bridge.handle(toolCall({ tool: 'missing', arguments: {} }));
    expect(res.success).toBe(false);
    expect(res.content_items[0].text).toContain('Unknown tool: missing');
  });

  it('converts a thrown tool error into an error envelope (never rejects)', async () => {
    const bridge = new CodexToolBridge([
      {
        name: 'throws',
        description: '',
        parameters: {},
        execute: () => {
          throw new Error('kaboom');
        },
      },
    ]);
    const res = await bridge.handle(toolCall({ tool: 'throws', arguments: {} }));
    expect(res).toEqual({ content_items: [{ type: 'text', text: 'kaboom' }], success: false });
  });

  it('supports late registration via register()', async () => {
    const bridge = new CodexToolBridge();
    bridge.register(echoTool);
    const res = await bridge.handle(toolCall({ tool: 'echo', arguments: { text: 'x' } }));
    expect(res.success).toBe(true);
  });
});
