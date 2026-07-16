import * as fs from 'node:fs';
import * as path from 'node:path';
import { app } from 'electron';
import type { Persona, PersonaSaveInput } from '../../renderer/types';
import { log, logWarn } from '../utils/logger';

/**
 * PersonaManager — the agent "expert" layer. Personas are Markdown files with a small YAML-ish
 * frontmatter block:
 *
 *   ---
 *   id: code-reviewer
 *   name: 代码审查员
 *   icon: code
 *   scenarios: [coding]
 *   recommendedSkills: [check]
 *   ---
 *   <system prompt body>
 *
 * Two sources: builtin (bundled under resources/personas, read-only) and user
 * (`<userData>/personas/*.md`, editable). They merge by id — a user file with the same id
 * overrides the builtin. A bound persona's system prompt is injected into the agent turn's
 * developerInstructions (see agent-runner). Bad files are skipped, not fatal.
 *
 * Frontmatter is parsed with a small self-contained parser (scalars + inline `[a, b]` arrays)
 * rather than a YAML dependency — the schema is tiny and fully controlled, and the only
 * runtime-available yaml libs are transitive devDeps (pruned in production).
 */
export class PersonaManager {
  private cache: Persona[] | null = null;
  private readonly builtinDirOverride?: string;
  private readonly userDirOverride?: string;

  /** `opts` overrides are for tests; production uses the electron resource/userData paths. */
  constructor(opts?: { builtinDir?: string; userDir?: string }) {
    this.builtinDirOverride = opts?.builtinDir;
    this.userDirOverride = opts?.userDir;
  }

  /** Bundled builtin personas dir (resources/personas). */
  private builtinDir(): string {
    if (this.builtinDirOverride) return this.builtinDirOverride;
    return app.isPackaged
      ? path.join(process.resourcesPath, 'personas')
      : path.join(__dirname, '../../resources/personas');
  }

  /** User personas dir (`<userData>/personas`), created on demand for writes. */
  getUserDir(): string {
    return this.userDirOverride ?? path.join(app.getPath('userData'), 'personas');
  }

  /** Load builtin + user personas, merged (user overrides builtin by id). Cached. */
  loadAll(): Persona[] {
    if (this.cache) return this.cache;
    const byId = new Map<string, Persona>();
    for (const p of this.readDir(this.builtinDir(), 'builtin')) byId.set(p.id, p);
    for (const p of this.readDir(this.getUserDir(), 'user')) byId.set(p.id, p);
    this.cache = Array.from(byId.values());
    return this.cache;
  }

  /** Re-read from disk on next access (call after CRUD). */
  reload(): void {
    this.cache = null;
  }

  get(id: string): Persona | null {
    return this.loadAll().find((p) => p.id === id) ?? null;
  }

  /** Create/update a user persona; writes `<userData>/personas/<id>.md`. Returns the saved persona. */
  save(input: PersonaSaveInput): Persona {
    const id = (input.id?.trim() || slugify(input.name)).trim();
    if (!id) throw new Error('Persona id/name is required');
    const dir = this.getUserDir();
    fs.mkdirSync(dir, { recursive: true });
    const lines: string[] = [`id: ${serializeScalar(id)}`, `name: ${serializeScalar(input.name)}`];
    if (input.icon) lines.push(`icon: ${serializeScalar(input.icon)}`);
    if (input.description) lines.push(`description: ${serializeScalar(input.description)}`);
    if (input.scenarios?.length) lines.push(`scenarios: ${serializeArray(input.scenarios)}`);
    if (input.recommendedSkills?.length)
      lines.push(`recommendedSkills: ${serializeArray(input.recommendedSkills)}`);
    if (input.recommendedConnectors?.length)
      lines.push(`recommendedConnectors: ${serializeArray(input.recommendedConnectors)}`);
    if (input.model) lines.push(`model: ${serializeScalar(input.model)}`);
    const body = (input.systemPrompt ?? '').trim();
    fs.writeFileSync(
      path.join(dir, `${id}.md`),
      `---\n${lines.join('\n')}\n---\n${body}\n`,
      'utf8'
    );
    this.reload();
    log('[PersonaManager] saved user persona', id);
    const saved = this.get(id);
    if (!saved) throw new Error(`Failed to reload saved persona ${id}`);
    return saved;
  }

  /** Delete a user persona file. Builtin personas cannot be deleted (returns false). */
  delete(id: string): boolean {
    const file = path.join(this.getUserDir(), `${id}.md`);
    try {
      if (!fs.existsSync(file)) return false;
      fs.rmSync(file);
      this.reload();
      log('[PersonaManager] deleted user persona', id);
      return true;
    } catch (err: unknown) {
      logWarn('[PersonaManager] delete failed', id, err);
      return false;
    }
  }

  private readDir(dir: string, source: 'builtin' | 'user'): Persona[] {
    let names: string[] = [];
    try {
      names = fs.existsSync(dir)
        ? fs.readdirSync(dir).filter((n) => n.toLowerCase().endsWith('.md'))
        : [];
    } catch {
      return [];
    }
    const out: Persona[] = [];
    for (const name of names) {
      const p = this.parseFile(path.join(dir, name), source);
      if (p) out.push(p);
    }
    return out;
  }

  private parseFile(filePath: string, source: 'builtin' | 'user'): Persona | null {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
      if (!match) {
        logWarn('[PersonaManager] no frontmatter, skipping', filePath);
        return null;
      }
      const meta = parseFrontmatter(match[1]);
      const body = (match[2] ?? '').trim();
      const id = asStr(meta.id);
      const name = asStr(meta.name);
      if (!id || !name) {
        logWarn('[PersonaManager] missing id/name, skipping', filePath);
        return null;
      }
      return {
        id,
        name,
        icon: asStrOrUndef(meta.icon),
        description: asStrOrUndef(meta.description),
        scenarios: asArrOrUndef(meta.scenarios),
        recommendedSkills: asArrOrUndef(meta.recommendedSkills),
        recommendedConnectors: asArrOrUndef(meta.recommendedConnectors),
        model: asStrOrUndef(meta.model),
        systemPrompt: body,
        builtin: source === 'builtin',
        source,
      };
    } catch (err: unknown) {
      logWarn('[PersonaManager] failed to parse', filePath, err);
      return null;
    }
  }
}

type FrontValue = string | string[];

/** Minimal frontmatter parser: `key: scalar` or `key: [a, b]`. Ignores blank/comment lines. */
function parseFrontmatter(block: string): Record<string, FrontValue> {
  const out: Record<string, FrontValue> = {};
  for (const raw of block.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    const rest = line.slice(idx + 1).trim();
    if (!key) continue;
    if (rest.startsWith('[') && rest.endsWith(']')) {
      out[key] = rest
        .slice(1, -1)
        .split(',')
        .map((s) => unquote(s.trim()))
        .filter((s) => s.length > 0);
    } else {
      out[key] = unquote(stripInlineComment(rest));
    }
  }
  return out;
}

/** Strip a trailing ` # comment` only when the value is not quoted. */
function stripInlineComment(v: string): string {
  if (v.startsWith('"') || v.startsWith("'")) return v;
  const m = v.match(/\s+#.*$/);
  return m ? v.slice(0, m.index).trim() : v;
}

function unquote(v: string): string {
  if (
    v.length >= 2 &&
    ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
  ) {
    return v.slice(1, -1).replace(/\\"/g, '"');
  }
  return v;
}

/** Quote a scalar when it contains YAML-significant chars, else emit bare. */
function serializeScalar(v: string): string {
  return /[:#[\]"']|^\s|\s$/.test(v) ? `"${v.replace(/"/g, '\\"')}"` : v;
}

function serializeArray(arr: string[]): string {
  return `[${arr.map(serializeScalar).join(', ')}]`;
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'persona'
  );
}

function asStr(v: FrontValue | undefined): string {
  return typeof v === 'string' ? v.trim() : '';
}

function asStrOrUndef(v: FrontValue | undefined): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function asArrOrUndef(v: FrontValue | undefined): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const arr = v.filter((x) => x.trim().length > 0);
  return arr.length ? arr : undefined;
}
