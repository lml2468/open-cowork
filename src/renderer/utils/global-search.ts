/**
 * Pure search/ranking logic for the global command-palette search (G18).
 * Kept free of React/DOM so it can be unit-tested in isolation. The renderer
 * (`GlobalSearch.tsx`) builds `SearchItem`s from the Zustand session list and
 * the skills IPC, then delegates filtering + ordering here.
 */

export type SearchItemKind = 'session' | 'skill';

export interface SearchItem {
  id: string;
  kind: SearchItemKind;
  title: string;
  subtitle?: string;
}

/**
 * Scores how well an item matches a normalized (lowercase, trimmed) query.
 * Higher is better; `0` means "no match" and the item is dropped. Prefix hits
 * on the title rank above interior hits, which rank above subtitle-only hits.
 */
export function scoreSearchItem(item: SearchItem, normalizedQuery: string): number {
  if (!normalizedQuery) return 1;

  const title = item.title.toLowerCase();
  const subtitle = item.subtitle?.toLowerCase() ?? '';

  if (title === normalizedQuery) return 100;
  if (title.startsWith(normalizedQuery)) return 60;
  if (title.includes(normalizedQuery)) return 40;
  if (subtitle.includes(normalizedQuery)) return 20;
  return 0;
}

/**
 * Filters + ranks items for a raw query string. Empty queries return the input
 * order unchanged (so the palette can show recents). Ties preserve the original
 * order, so callers control the default ordering (e.g. most-recent sessions).
 */
export function filterSearchItems(items: SearchItem[], query: string): SearchItem[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return items.slice();

  const scored = items
    .map((item, index) => ({ item, index, score: scoreSearchItem(item, normalizedQuery) }))
    .filter((entry) => entry.score > 0);

  scored.sort((a, b) => (b.score !== a.score ? b.score - a.score : a.index - b.index));

  return scored.map((entry) => entry.item);
}
