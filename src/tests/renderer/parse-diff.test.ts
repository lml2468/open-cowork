import { describe, it, expect } from 'vitest';
import { parseFileDiff, parseChanges } from '@/renderer/utils/parse-diff';

describe('parseFileDiff', () => {
  it('parses a modified file with adds and dels', () => {
    const diff = [
      'diff --git a/src/foo.ts b/src/foo.ts',
      'index 111..222 100644',
      '--- a/src/foo.ts',
      '+++ b/src/foo.ts',
      '@@ -1,3 +1,4 @@',
      ' const a = 1;',
      '-const b = 2;',
      '+const b = 3;',
      '+const c = 4;',
      ' const d = 5;',
    ].join('\n');

    const parsed = parseFileDiff(diff, 'fallback');
    expect(parsed.path).toBe('src/foo.ts');
    expect(parsed.status).toBe('modified');
    expect(parsed.additions).toBe(2);
    expect(parsed.deletions).toBe(1);
    expect(parsed.isBinary).toBe(false);

    // First real line is the hunk header.
    expect(parsed.lines[0].type).toBe('hunk');
    const contentLines = parsed.lines.filter((l) => l.type !== 'hunk');
    expect(contentLines[0]).toMatchObject({ type: 'context', oldLine: 1, newLine: 1 });
    expect(contentLines[1]).toMatchObject({ type: 'del', oldLine: 2, newLine: null });
    expect(contentLines[2]).toMatchObject({ type: 'add', oldLine: null, newLine: 2 });
  });

  it('detects an added (new) file', () => {
    const diff = [
      'diff --git a/new.txt b/new.txt',
      'new file mode 100644',
      '--- /dev/null',
      '+++ b/new.txt',
      '@@ -0,0 +1,2 @@',
      '+hello',
      '+world',
    ].join('\n');

    const parsed = parseFileDiff(diff, 'new.txt');
    expect(parsed.status).toBe('added');
    expect(parsed.additions).toBe(2);
    expect(parsed.deletions).toBe(0);
  });

  it('detects a deleted file', () => {
    const diff = [
      'diff --git a/gone.txt b/gone.txt',
      'deleted file mode 100644',
      '--- a/gone.txt',
      '+++ /dev/null',
      '@@ -1,1 +0,0 @@',
      '-bye',
    ].join('\n');

    const parsed = parseFileDiff(diff, 'gone.txt');
    expect(parsed.status).toBe('deleted');
    expect(parsed.deletions).toBe(1);
    expect(parsed.additions).toBe(0);
  });

  it('flags a binary file', () => {
    const diff = [
      'diff --git a/img.png b/img.png',
      'new file mode 100644',
      'Binary files /dev/null and b/img.png differ',
    ].join('\n');

    const parsed = parseFileDiff(diff, 'img.png');
    expect(parsed.isBinary).toBe(true);
    expect(parsed.lines.length).toBe(0);
  });

  it('uses the fallback path when no header path is present', () => {
    const parsed = parseFileDiff('@@ -0,0 +1,1 @@\n+x', 'fallback/path.txt');
    expect(parsed.path).toBe('fallback/path.txt');
    expect(parsed.additions).toBe(1);
  });

  it('ignores content before the first hunk header', () => {
    const parsed = parseFileDiff('diff --git a/x b/x\nsome noise\n+not-a-line', 'x');
    expect(parsed.additions).toBe(0);
    expect(parsed.lines.length).toBe(0);
  });
});

describe('parseChanges', () => {
  it('parses a list of raw file diffs', () => {
    const files = [
      { path: 'a.txt', diff: 'diff --git a/a.txt b/a.txt\n@@ -0,0 +1,1 @@\n+one' },
      { path: 'b.txt', diff: 'diff --git a/b.txt b/b.txt\n@@ -1,1 +0,0 @@\n-two' },
    ];
    const parsed = parseChanges(files);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].additions).toBe(1);
    expect(parsed[1].deletions).toBe(1);
  });
});
