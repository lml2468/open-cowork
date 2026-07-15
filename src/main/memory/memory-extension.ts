import type {
  AgentRuntimeExtension,
  BeforeSessionRunResult,
} from '../extensions/agent-runtime-extension';
import type { MemoryService } from './memory-service';

/**
 * MemoryExtension — injects the agent-managed Markdown memory preamble (global + project
 * MEMORY.md + instructions) into each session. There is no post-session extraction: the agent
 * writes memory itself via its Read/Write/Edit tools.
 */
export class MemoryExtension implements AgentRuntimeExtension {
  readonly name = 'memory';

  constructor(private readonly memoryService: MemoryService) {}

  async beforeSessionRun({
    session,
    prompt,
  }: Parameters<
    NonNullable<AgentRuntimeExtension['beforeSessionRun']>
  >[0]): Promise<BeforeSessionRunResult | void> {
    if (!this.memoryService.isEnabled() || !session.memoryEnabled) {
      return;
    }
    return {
      promptPrefix: this.memoryService.buildPromptPrefix(session, prompt),
    };
  }
}
