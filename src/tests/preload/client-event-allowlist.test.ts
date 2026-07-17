import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Regression guard: the preload `send()` drops any ClientEvent whose type is not in
 * `ALLOWED_CLIENT_EVENTS`. If a new ClientEvent type is added to the union but not the
 * allowlist, the event is silently blocked at the context bridge — the exact bug that made
 * `session.setPersona` (persona binding) a no-op. This test parses both source files and
 * asserts the allowlist covers every ClientEvent type.
 */
function readSrc(rel: string): string {
  return readFileSync(resolve(__dirname, '../../..', rel), 'utf8');
}

function clientEventTypes(): string[] {
  const src = readSrc('src/renderer/types/index.ts');
  const start = src.indexOf('export type ClientEvent =');
  expect(start).toBeGreaterThan(-1);
  const after = src.slice(start + 'export type ClientEvent ='.length);
  // The union ends at the next top-level `export ` declaration.
  const endIdx = after.search(/\nexport /);
  const block = endIdx >= 0 ? after.slice(0, endIdx) : after;
  return [...block.matchAll(/type:\s*'([^']+)'/g)].map((m) => m[1]);
}

function allowedEvents(): Set<string> {
  const src = readSrc('src/preload/index.ts');
  const start = src.indexOf('const ALLOWED_CLIENT_EVENTS');
  expect(start).toBeGreaterThan(-1);
  // The array literal is `new Set<ClientEvent['type']>([ ... ])`; slice the `([ ... ])` region so
  // the `]` inside `ClientEvent['type']` doesn't truncate it early.
  const arrStart = src.indexOf('([', start);
  const arrEnd = src.indexOf('])', arrStart);
  const block = src.slice(arrStart, arrEnd);
  return new Set([...block.matchAll(/'([^']+)'/g)].map((m) => m[1]));
}

describe('preload ALLOWED_CLIENT_EVENTS', () => {
  it('covers every ClientEvent type (so send() never silently blocks an event)', () => {
    const types = clientEventTypes();
    const allowed = allowedEvents();
    expect(types.length).toBeGreaterThan(5);
    const missing = types.filter((t) => !allowed.has(t));
    expect(missing).toEqual([]);
  });

  it('allowlists session.setPersona (persona binding)', () => {
    expect(allowedEvents().has('session.setPersona')).toBe(true);
  });
});
