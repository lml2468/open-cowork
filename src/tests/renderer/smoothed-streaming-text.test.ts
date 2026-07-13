import { describe, it, expect } from 'vitest';
import { nextRevealCount } from '@/renderer/hooks/useSmoothedStreamingText';

describe('nextRevealCount', () => {
  it('returns target immediately when already caught up', () => {
    expect(nextRevealCount(100, 100, 16)).toBe(100);
  });

  it('snaps down when the buffer shrank (reset/commit)', () => {
    expect(nextRevealCount(200, 0, 16)).toBe(0);
    expect(nextRevealCount(200, 50, 16)).toBe(50);
  });

  it('advances by at least one char per frame even with a tiny backlog', () => {
    expect(nextRevealCount(10, 11, 16)).toBe(11);
  });

  it('reveals gradually rather than jumping the whole backlog', () => {
    // 80-char backlog at min rate over one ~16ms frame reveals a few chars.
    const next = nextRevealCount(0, 80, 16);
    expect(next).toBeGreaterThan(0);
    expect(next).toBeLessThan(80);
  });

  it('catches up faster when the backlog is large (no long tail)', () => {
    const smallBacklog = nextRevealCount(0, 40, 16) - 0;
    const largeBacklog = nextRevealCount(0, 4000, 16) - 0;
    expect(largeBacklog).toBeGreaterThan(smallBacklog);
  });

  it('never overshoots the target', () => {
    expect(nextRevealCount(78, 80, 1000)).toBe(80);
  });

  it('monotonically converges to target over successive frames', () => {
    let shown = 0;
    const target = 300;
    for (let i = 0; i < 200 && shown < target; i++) {
      const next = nextRevealCount(shown, target, 16);
      expect(next).toBeGreaterThanOrEqual(shown);
      shown = next;
    }
    expect(shown).toBe(target);
  });
});
