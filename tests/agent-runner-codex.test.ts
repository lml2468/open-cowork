import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const agentRunnerPath = path.resolve(process.cwd(), 'src/main/agent/agent-runner.ts');
const agentRunnerContent = readFileSync(agentRunnerPath, 'utf8');

describe('CoworkAgentRunner Codex runtime integration', () => {
  it('avoids dynamic re-import shadowing for config store singletons', () => {
    expect(agentRunnerContent).toContain(
      "import { mcpConfigStore } from '../mcp/mcp-config-store'"
    );
    expect(agentRunnerContent).not.toContain(
      "const { configStore } = await import('../config/config-store')"
    );
    expect(agentRunnerContent).not.toContain(
      "const { mcpConfigStore } = await import('../mcp/mcp-config-store')"
    );
  });

  it('keeps MCP config build resilient', () => {
    expect(agentRunnerContent).toContain('function safeStringify');
    expect(agentRunnerContent).toContain('Failed to prepare MCP server config, skipping server');
  });

  it('uses standard markdown link guidance for sources citations', () => {
    expect(agentRunnerContent).toContain(
      'otherwise use standard Markdown links: [Title](https://claude.ai/chat/URL)'
    );
  });

  it('avoids duplicating the current user prompt in contextual history assembly', () => {
    expect(agentRunnerContent).toContain('const conversationMessages = existingMessages');
    // Image-containing messages are filtered out individually (not skipping entire history)
    expect(agentRunnerContent).toContain('const textOnlyMessages = conversationMessages');
    expect(agentRunnerContent).toContain('textOnlyMessages.slice(0, -1)');
    expect(agentRunnerContent).toContain(
      "textOnlyMessages[textOnlyMessages.length - 1]?.role === 'user'"
    );
  });

  it('keeps MCP server logging compact unless full debug logging is enabled', () => {
    expect(agentRunnerContent).toContain("log('[CoworkAgentRunner] Final mcpServers summary:'");
    expect(agentRunnerContent).toContain("if (process.env.COWORK_LOG_SDK_MESSAGES_FULL === '1') {");
    expect(agentRunnerContent).toContain("log('[CoworkAgentRunner] Final mcpServers config:'");
  });

  it('drives a codex turn through the shared runtime instead of a pi session', () => {
    // Pi's createAgentSession / prompt / subscribe loop is gone.
    expect(agentRunnerContent).not.toContain('createAgentSession');
    expect(agentRunnerContent).not.toContain('piSession.prompt(');
    expect(agentRunnerContent).not.toContain('piSession.subscribe(');
    // The turn now runs on the long-lived CodexRuntime.
    expect(agentRunnerContent).toContain('const runtime = this.ensureCodexRuntime();');
    expect(agentRunnerContent).toContain('await runtime.runTurn({');
    expect(agentRunnerContent).toContain('new CodexEventTranslator({');
  });

  it('reuses the shared user-facing error helper', () => {
    expect(agentRunnerContent).toContain("from './agent-runner-message-end'");
    expect(agentRunnerContent).toContain('toUserFacingErrorText');
    expect(agentRunnerContent).toContain(
      'const errorText = toUserFacingErrorText(toErrorText(error));'
    );
  });

  it('seeds the codex system prompt as developer instructions', () => {
    expect(agentRunnerContent).toContain('developerInstructions: coworkAppendPrompt');
    expect(agentRunnerContent).not.toContain('systemPromptOverride');
    expect(agentRunnerContent).not.toContain('DefaultResourceLoader');
  });

  it('disposes the codex thread when the runtime signature changes', () => {
    expect(agentRunnerContent).toContain('const sessionRuntimeSignature = JSON.stringify({');
    expect(agentRunnerContent).toContain(
      'sessionMeta.runtimeSignature !== sessionRuntimeSignature'
    );
    expect(agentRunnerContent).toContain('this.codexRuntime?.disposeSession(session.id);');
    expect(agentRunnerContent).toContain('runtimeSignature: sessionRuntimeSignature');
  });

  it('resolves the model/provider through the codex model-config mapper', () => {
    expect(agentRunnerContent).toContain(
      "import { buildCodexModelConfig } from './codex-runtime/codex-model-config'"
    );
    expect(agentRunnerContent).toContain('const modelConfigResult = buildCodexModelConfig({');
    // Unsupported providers fail closed with a user-facing configuration error.
    expect(agentRunnerContent).toContain('if (!modelConfigResult.supported) {');
  });

  it('nudges the model to proceed with reasonable assumptions', () => {
    expect(agentRunnerContent).toContain('proceed immediately with reasonable assumptions');
    expect(agentRunnerContent).toContain('within two days');
    expect(agentRunnerContent).toContain('most recent two relevant publication days');
  });

  it('registers MCP servers with codex natively instead of proxying MCP tools', () => {
    // MCP tools are no longer wrapped as host dynamic_tools (that collided with codex's
    // reserved `mcp__` namespace). codex connects to the servers natively via `mcp_servers`.
    expect(agentRunnerContent).toContain(
      "import { buildCodexMcpServersConfig } from './codex-runtime/codex-mcp-config'"
    );
    expect(agentRunnerContent).toContain(
      'resolveCodexServerSpecs(mcpConfigStore.getEnabledServers())'
    );
    expect(agentRunnerContent).toContain('...mcpServersConfig');
    // The old app-side MCP tool proxy is gone.
    expect(agentRunnerContent).not.toContain('function buildMcpCustomTools');
    expect(agentRunnerContent).not.toContain('normalizeMcpToolResultForModel');
  });

  it('adapts extension tools into codex host tools per turn', () => {
    expect(agentRunnerContent).toContain(
      "import { adaptPiToolsToCodexHostTools } from './codex-runtime/codex-tool-adapter'"
    );
    expect(agentRunnerContent).toContain(
      'this.codexToolBridge?.setTools(adaptPiToolsToCodexHostTools(customTools));'
    );
  });

  it('does not reference removed AskUserQuestion or TodoWrite tools', () => {
    expect(agentRunnerContent).not.toContain('AskUserQuestion');
    expect(agentRunnerContent).not.toContain('TodoWrite');
    expect(agentRunnerContent).not.toContain('pendingQuestions');
  });

  it('chat-first behavioral rules are present', () => {
    expect(agentRunnerContent).toContain('CHAT FIRST');
    expect(agentRunnerContent).toContain(
      'Do NOT create, write, or edit files unless the user explicitly asks'
    );
    expect(agentRunnerContent).toContain('START DOING IT');
  });
});
