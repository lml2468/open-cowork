import { describe, it, expect } from 'vitest';
import { splitGitDiff, chunkFilePath } from '@/main/utils/git-changes';

describe('splitGitDiff', () => {
  it('returns an empty array for blank input', () => {
    expect(splitGitDiff('')).toEqual([]);
    expect(splitGitDiff('   \n  ')).toEqual([]);
  });

  it('splits a combined diff into one chunk per file', () => {
    const combined = [
      'diff --git a/one.txt b/one.txt',
      '--- a/one.txt',
      '+++ b/one.txt',
      '@@ -1 +1 @@',
      '-a',
      '+b',
      'diff --git a/two.txt b/two.txt',
      '--- a/two.txt',
      '+++ b/two.txt',
      '@@ -1 +1 @@',
      '-c',
      '+d',
    ].join('\n');

    const chunks = splitGitDiff(combined);
    expect(chunks).toHaveLength(2);
    expect(chunks[0].startsWith('diff --git a/one.txt')).toBe(true);
    expect(chunks[1].startsWith('diff --git a/two.txt')).toBe(true);
  });
});

describe('chunkFilePath', () => {
  it('reads the path from the diff --git header', () => {
    expect(chunkFilePath('diff --git a/src/foo.ts b/src/foo.ts\n...')).toBe('src/foo.ts');
  });

  it('falls back to the +++ header for renames', () => {
    const chunk = 'diff --git\n+++ b/src/bar.ts';
    expect(chunkFilePath(chunk)).toBe('src/bar.ts');
  });

  it('falls back to the --- header for deletions', () => {
    const chunk = 'diff --git\n--- a/src/baz.ts\n+++ /dev/null';
    expect(chunkFilePath(chunk)).toBe('src/baz.ts');
  });
});
