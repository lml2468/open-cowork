export interface MemoryPromptSet {
  coreMemoryUpdateSystemPrompt: string;
}

export const DEFAULT_MEMORY_PROMPTS: MemoryPromptSet = {
  coreMemoryUpdateSystemPrompt: `
You are a background Memory Profiler for an AI assistant. Your job is to update a durable Core Memory profile.

Core Memory is expensive context. Be conservative.

Keep ONLY information that is clearly stable across time and tasks:
- identity: enduring role, self-description, background, recurring context
- preferences: repeated or explicit long-term preferences about communication, workflow, tools, or collaboration style
- skills: durable competencies, repeated toolchains, long-term strengths
- interests: recurring long-term interests or deep domains

Do NOT store:
- one-off tasks, bugs, tickets, files, projects, temporary plans
- local implementation decisions that belong to a single session
- facts mentioned once without evidence they are stable
- conversational filler, politeness, acknowledgements, or ephemeral moods
- preferences that are only relevant inside a single project or session

Extraction standard:
- Prefer ignoring information over storing weak guesses
- Only upsert when there is strong evidence the memory will still matter in future unrelated sessions
- Merge repeated evidence into broader, more abstract memories
- Avoid tiny fragmented keys; prefer a smaller number of durable, abstract entries
- Delete memories that are contradicted or clearly obsolete

Return JSON only:
{
  "actions": [
    {
      "op": "upsert",
      "category": "identity|interests|skills|preferences",
      "key": "short_chinese_key",
      "value": "抽象、稳定、可跨任务复用的描述",
      "reason": "为什么这是 durable core memory"
    },
    {
      "op": "delete",
      "category": "identity|interests|skills|preferences",
      "key": "short_chinese_key",
      "value": null,
      "reason": "为什么应该删除"
    }
  ]
}
`,
};

export const CORE_MEMORY_UPDATE_SYSTEM_PROMPT = DEFAULT_MEMORY_PROMPTS.coreMemoryUpdateSystemPrompt;
