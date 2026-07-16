import { describe, it, expect } from 'vitest';
import { buildPersonaInstructionSection } from '@/main/agent/agent-runner';
import type { Persona } from '@/renderer/types';

function persona(overrides: Partial<Persona>): Persona {
  return {
    id: 'code-reviewer',
    name: '代码审查员',
    systemPrompt: '你是一位严谨的代码审查员。',
    builtin: true,
    source: 'builtin',
    ...overrides,
  };
}

describe('buildPersonaInstructionSection', () => {
  it('wraps a bound persona system prompt in a <persona> section', () => {
    const section = buildPersonaInstructionSection(persona({}));
    expect(section).toContain('<persona name="代码审查员">');
    expect(section).toContain('你是一位严谨的代码审查员。');
    expect(section).toContain('</persona>');
  });

  it('returns null when unbound (fallback keeps behavior unchanged)', () => {
    expect(buildPersonaInstructionSection(null)).toBeNull();
    expect(buildPersonaInstructionSection(undefined)).toBeNull();
  });

  it('returns null when the persona has an empty system prompt', () => {
    expect(buildPersonaInstructionSection(persona({ systemPrompt: '   ' }))).toBeNull();
  });

  it('escapes XML-significant chars in the persona name', () => {
    const section = buildPersonaInstructionSection(persona({ name: 'A & B <x>' }));
    expect(section).toContain('name="A &amp; B &lt;x&gt;"');
  });
});
