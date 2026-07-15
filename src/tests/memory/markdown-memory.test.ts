import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  MEMORY_INDEX_FILE,
  buildMemoryPreamble,
  ensureMemoryScaffold,
  readMemoryIndex,
} from '../../main/memory/markdown-memory';

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mem-test-'));
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('markdown-memory', () => {
  it('ensureMemoryScaffold seeds MEMORY.md when missing and is idempotent', () => {
    const root = path.join(tmp, 'memory');
    ensureMemoryScaffold(root);
    const file = path.join(root, MEMORY_INDEX_FILE);
    expect(fs.existsSync(file)).toBe(true);
    fs.appendFileSync(file, '\n- a durable fact\n');
    ensureMemoryScaffold(root); // must not clobber
    expect(fs.readFileSync(file, 'utf8')).toContain('a durable fact');
  });

  it('readMemoryIndex returns null when absent, content when present', () => {
    const root = path.join(tmp, 'memory');
    expect(readMemoryIndex(root)).toBeNull();
    ensureMemoryScaffold(root);
    expect(readMemoryIndex(root)).toContain('# Memory');
  });

  it('buildMemoryPreamble teaches paths and embeds present indexes', () => {
    const globalRoot = path.join(tmp, 'global', 'memory');
    const projectRoot = path.join(tmp, 'proj', 'memory');
    ensureMemoryScaffold(globalRoot);
    fs.writeFileSync(path.join(globalRoot, MEMORY_INDEX_FILE), '# Memory\n- global fact\n', 'utf8');
    ensureMemoryScaffold(projectRoot);
    fs.writeFileSync(
      path.join(projectRoot, MEMORY_INDEX_FILE),
      '# Memory\n- project fact\n',
      'utf8'
    );

    const preamble = buildMemoryPreamble({ globalRoot, projectRoot });
    expect(preamble).toContain('<memory>');
    expect(preamble).toContain(path.join(globalRoot, MEMORY_INDEX_FILE));
    expect(preamble).toContain(path.join(projectRoot, MEMORY_INDEX_FILE));
    expect(preamble).toContain('global fact');
    expect(preamble).toContain('project fact');
    expect(preamble).toContain('scope="global"');
    expect(preamble).toContain('scope="project"');
  });

  it('buildMemoryPreamble still teaches paths when indexes are empty', () => {
    const globalRoot = path.join(tmp, 'g', 'memory');
    const preamble = buildMemoryPreamble({ globalRoot, projectRoot: null });
    expect(preamble).toContain('<memory>');
    expect(preamble).toContain('Read/Write/Edit');
  });
});
