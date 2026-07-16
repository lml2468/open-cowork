import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { PersonaManager } from '@/main/personas/persona-manager';

let root: string;
let builtinDir: string;
let userDir: string;

function write(dir: string, name: string, content: string): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), content, 'utf8');
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'persona-test-'));
  builtinDir = path.join(root, 'builtin');
  userDir = path.join(root, 'user');
  fs.mkdirSync(builtinDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function mgr(): PersonaManager {
  return new PersonaManager({ builtinDir, userDir });
}

describe('PersonaManager', () => {
  it('parses frontmatter incl. inline arrays and Markdown body', () => {
    write(
      builtinDir,
      'code-reviewer.md',
      `---
id: code-reviewer
name: 代码审查员
icon: code
scenarios: [coding]
recommendedSkills: [check, dev-prep]
model: gpt-5   # inline comment stripped
---
你是一位严谨的代码审查员。
第二段正文。`
    );
    const p = mgr().get('code-reviewer');
    expect(p).not.toBeNull();
    expect(p?.name).toBe('代码审查员');
    expect(p?.icon).toBe('code');
    expect(p?.scenarios).toEqual(['coding']);
    expect(p?.recommendedSkills).toEqual(['check', 'dev-prep']);
    expect(p?.model).toBe('gpt-5');
    expect(p?.builtin).toBe(true);
    expect(p?.source).toBe('builtin');
    expect(p?.systemPrompt).toContain('严谨的代码审查员');
    expect(p?.systemPrompt).toContain('第二段正文');
  });

  it('skips bad files (no frontmatter / missing id or name) without throwing', () => {
    write(builtinDir, 'ok.md', `---\nid: ok\nname: OK\n---\nbody`);
    write(builtinDir, 'no-front.md', `just text, no frontmatter`);
    write(builtinDir, 'no-id.md', `---\nname: NoId\n---\nbody`);
    write(builtinDir, 'no-name.md', `---\nid: no-name\n---\nbody`);
    const all = mgr().loadAll();
    expect(all.map((p) => p.id)).toEqual(['ok']);
  });

  it('merges builtin + user, with user overriding builtin by id', () => {
    write(
      builtinDir,
      'code-reviewer.md',
      `---\nid: code-reviewer\nname: Builtin CR\n---\nbuiltin body`
    );
    write(builtinDir, 'writer.md', `---\nid: writer\nname: Writer\n---\nw`);
    write(userDir, 'code-reviewer.md', `---\nid: code-reviewer\nname: My CR\n---\nuser body`);
    write(userDir, 'mine.md', `---\nid: mine\nname: Mine\n---\nm`);
    const all = mgr().loadAll();
    const cr = all.find((p) => p.id === 'code-reviewer');
    expect(cr?.name).toBe('My CR');
    expect(cr?.source).toBe('user');
    expect(cr?.systemPrompt).toBe('user body');
    expect(all.map((p) => p.id).sort()).toEqual(['code-reviewer', 'mine', 'writer']);
  });

  it('save() writes a user persona file that round-trips through loadAll()', () => {
    const m = mgr();
    const saved = m.save({
      name: 'My Expert',
      icon: 'wrench',
      scenarios: ['coding'],
      recommendedSkills: ['check'],
      systemPrompt: 'Line one\nLine two',
    });
    expect(saved.id).toBe('my-expert'); // slugified from name
    expect(saved.source).toBe('user');
    expect(fs.existsSync(path.join(userDir, 'my-expert.md'))).toBe(true);

    const reloaded = new PersonaManager({ builtinDir, userDir }).get('my-expert');
    expect(reloaded?.name).toBe('My Expert');
    expect(reloaded?.scenarios).toEqual(['coding']);
    expect(reloaded?.recommendedSkills).toEqual(['check']);
    expect(reloaded?.systemPrompt).toBe('Line one\nLine two');
  });

  it('delete() removes only user files and returns false for builtin/missing', () => {
    write(builtinDir, 'builtin-one.md', `---\nid: builtin-one\nname: B1\n---\nb`);
    const m = mgr();
    m.save({ id: 'temp', name: 'Temp', systemPrompt: 'x' });
    expect(m.delete('temp')).toBe(true);
    expect(m.get('temp')).toBeNull();
    expect(m.delete('builtin-one')).toBe(false); // builtin file lives in builtinDir, not userDir
    expect(m.delete('nope')).toBe(false);
  });
});
