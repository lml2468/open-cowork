import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'node:fs';
import { initDatabase, type DatabaseInstance, type SessionRow } from '@/main/db/database';

// electron mock points userData at /tmp/open-cowork-test → db at <that>/data/cowork.db
const DB_DIR = '/tmp/open-cowork-test/data';

function baseRow(overrides: Partial<SessionRow>): SessionRow {
  return {
    id: 's-persona',
    title: 'T',
    claude_session_id: null,
    openai_thread_id: null,
    codex_runtime_signature: null,
    persona_id: null,
    status: 'idle',
    cwd: null,
    mounted_paths: '[]',
    allowed_tools: '[]',
    memory_enabled: 0,
    model: null,
    created_at: 1,
    updated_at: 1,
    ...overrides,
  };
}

let db: DatabaseInstance;

// initDatabase() is a module singleton; open once against a clean file, reuse across tests
// with distinct ids (no per-test close/rm, which would break the shared connection).
beforeAll(() => {
  fs.rmSync(DB_DIR, { recursive: true, force: true });
  db = initDatabase();
});

describe('session.persona_id persistence', () => {
  it('round-trips a bound persona through create → get', () => {
    db.sessions.create(baseRow({ id: 's-bound', persona_id: 'code-reviewer' }));
    expect(db.sessions.get('s-bound')?.persona_id).toBe('code-reviewer');
  });

  it('clears persona_id via update(null)', () => {
    db.sessions.create(baseRow({ id: 's-clear', persona_id: 'code-reviewer' }));
    db.sessions.update('s-clear', { persona_id: null });
    expect(db.sessions.get('s-clear')?.persona_id).toBeNull();
  });

  it('defaults persona_id to null when unset', () => {
    db.sessions.create(baseRow({ id: 's-unset' }));
    expect(db.sessions.get('s-unset')?.persona_id).toBeNull();
  });
});
