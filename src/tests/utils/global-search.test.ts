import { describe, it, expect } from 'vitest';
import {
  filterSearchItems,
  scoreSearchItem,
  type SearchItem,
} from '../../renderer/utils/global-search';

const items: SearchItem[] = [
  { id: 's1', kind: 'session', title: 'Refactor billing module' },
  { id: 's2', kind: 'session', title: 'Weekly report draft' },
  { id: 'k1', kind: 'skill', title: 'Coding', subtitle: 'Refactor and edit code files' },
  { id: 'k2', kind: 'skill', title: 'Brainstorm', subtitle: 'Generate ideas' },
];

describe('scoreSearchItem', () => {
  it('scores an exact title match highest', () => {
    expect(scoreSearchItem(items[2], 'coding')).toBe(100);
  });

  it('ranks a title prefix above an interior match', () => {
    const prefix = scoreSearchItem({ id: 'a', kind: 'skill', title: 'report card' }, 'report');
    const interior = scoreSearchItem({ id: 'b', kind: 'skill', title: 'weekly report' }, 'report');
    expect(prefix).toBeGreaterThan(interior);
  });

  it('matches on the subtitle when the title does not match', () => {
    expect(scoreSearchItem(items[2], 'edit code')).toBe(20);
  });

  it('returns 0 for no match', () => {
    expect(scoreSearchItem(items[1], 'zzz')).toBe(0);
  });

  it('returns a positive score for an empty query', () => {
    expect(scoreSearchItem(items[0], '')).toBe(1);
  });
});

describe('filterSearchItems', () => {
  it('returns all items unchanged for an empty query', () => {
    expect(filterSearchItems(items, '')).toEqual(items);
    expect(filterSearchItems(items, '   ')).toEqual(items);
  });

  it('filters to matching items only', () => {
    const results = filterSearchItems(items, 'refactor');
    const ids = results.map((r) => r.id);
    expect(ids).toContain('s1'); // title match
    expect(ids).toContain('k1'); // subtitle match
    expect(ids).not.toContain('s2');
    expect(ids).not.toContain('k2');
  });

  it('ranks title matches ahead of subtitle-only matches', () => {
    const results = filterSearchItems(items, 'refactor');
    expect(results[0].id).toBe('s1');
  });

  it('is case-insensitive', () => {
    expect(filterSearchItems(items, 'BRAINSTORM').map((r) => r.id)).toEqual(['k2']);
  });

  it('preserves input order for equal scores', () => {
    const sameScore: SearchItem[] = [
      { id: 'a', kind: 'session', title: 'alpha task' },
      { id: 'b', kind: 'session', title: 'beta task' },
    ];
    // Both match "task" as an interior substring (equal score) → original order kept.
    expect(filterSearchItems(sameScore, 'task').map((r) => r.id)).toEqual(['a', 'b']);
  });
});
