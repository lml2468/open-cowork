import { describe, it, expect } from 'vitest';
import {
  detectTrigger,
  replaceRange,
  toRelativePath,
  matchesQuery,
} from '../../renderer/utils/composer-autocomplete';

describe('detectTrigger', () => {
  it('detects an @ trigger at the start of the text', () => {
    expect(detectTrigger('@rea', 4)).toEqual({ type: '@', query: 'rea', start: 0, end: 4 });
  });

  it('detects a / trigger at the start of the text', () => {
    expect(detectTrigger('/pla', 4)).toEqual({ type: '/', query: 'pla', start: 0, end: 4 });
  });

  it('detects a trigger after whitespace', () => {
    expect(detectTrigger('hello @foo', 10)).toEqual({
      type: '@',
      query: 'foo',
      start: 6,
      end: 10,
    });
  });

  it('returns null when the trigger char is mid-token (e.g. email)', () => {
    expect(detectTrigger('user@host', 9)).toBeNull();
  });

  it('returns null when whitespace sits between the trigger and the caret', () => {
    expect(detectTrigger('@foo bar', 8)).toBeNull();
  });

  it('returns null when there is no trigger char before the caret', () => {
    expect(detectTrigger('plain text', 10)).toBeNull();
  });

  it('honors the allowed-trigger list', () => {
    expect(detectTrigger('/cmd', 4, ['@'])).toBeNull();
    expect(detectTrigger('@cmd', 4, ['@'])).not.toBeNull();
  });

  it('returns an empty query for a bare trigger char', () => {
    expect(detectTrigger('@', 1)).toEqual({ type: '@', query: '', start: 0, end: 1 });
  });
});

describe('replaceRange', () => {
  it('splices insert text into the given range and returns the new caret', () => {
    const result = replaceRange('type @re here', 5, 8, '@readme.md ');
    expect(result.text).toBe('type @readme.md  here');
    expect(result.caret).toBe(5 + '@readme.md '.length);
  });

  it('clamps out-of-range indices', () => {
    const result = replaceRange('abc', 10, 20, 'X');
    expect(result.text).toBe('abcX');
    expect(result.caret).toBe(4);
  });
});

describe('toRelativePath', () => {
  it('strips the cwd prefix (posix)', () => {
    expect(toRelativePath('/home/u/proj/src/a.ts', '/home/u/proj')).toBe('src/a.ts');
  });

  it('strips the cwd prefix with a trailing slash', () => {
    expect(toRelativePath('/home/u/proj/a.ts', '/home/u/proj/')).toBe('a.ts');
  });

  it('strips the cwd prefix (windows separators)', () => {
    expect(toRelativePath('C:\\p\\proj\\src\\a.ts', 'C:\\p\\proj')).toBe('src\\a.ts');
  });

  it('falls back to the basename outside the cwd', () => {
    expect(toRelativePath('/other/a.ts', '/home/u/proj')).toBe('a.ts');
  });

  it('returns the basename when cwd is missing', () => {
    expect(toRelativePath('/a/b/c.ts', null)).toBe('c.ts');
  });
});

describe('matchesQuery', () => {
  it('matches everything for an empty query', () => {
    expect(matchesQuery('anything', '')).toBe(true);
  });

  it('is case-insensitive substring match', () => {
    expect(matchesQuery('ReadmeFile', 'readme')).toBe(true);
    expect(matchesQuery('ReadmeFile', 'xyz')).toBe(false);
  });
});
