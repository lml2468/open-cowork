import { useEffect, useRef, useState } from 'react';

// Reveal tuning. The rate scales with the backlog so large deltas catch up
// quickly (no long tail at end-of-stream) while small gaps still animate.
const MIN_CHARS_PER_SEC = 120;
const CATCHUP_PER_SEC = 8;

/**
 * Pure per-frame reveal step. Given the currently-shown character count, the
 * target length, and the elapsed time since the last frame, returns the next
 * shown count. Extracted for unit testing (the hook itself is RAF-driven).
 */
export function nextRevealCount(shown: number, target: number, dtMs: number): number {
  if (target <= shown) return target; // caught up or the buffer shrank (reset)
  const backlog = target - shown;
  const charsPerSec = Math.max(MIN_CHARS_PER_SEC, backlog * CATCHUP_PER_SEC);
  const add = Math.max(1, Math.round((charsPerSec * dtMs) / 1000));
  return Math.min(target, shown + add);
}

/**
 * Smooths streaming text: instead of jumping to `target` whenever a provider
 * delta lands (coarse, ~8/sec on some gateways), reveal characters at a steady
 * per-frame rate so the typewriter reads as continuous. Returns the substring
 * of `target` revealed so far.
 *
 * Reset semantics: when `target` gets shorter than what's shown (new turn or
 * commit clearing the partial), it snaps instantly — no stale tail.
 */
export function useSmoothedStreamingText(target: string): string {
  const [shown, setShown] = useState(target);
  const shownCountRef = useRef(target.length);
  const targetRef = useRef(target);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef(0);

  useEffect(() => {
    targetRef.current = target;

    // Snap on reset / replacement (target shorter than what we've revealed).
    if (target.length < shownCountRef.current) {
      shownCountRef.current = target.length;
      setShown(target);
    }

    // Start the reveal loop if there's a backlog and it isn't already running.
    if (shownCountRef.current < target.length && rafRef.current == null) {
      lastTsRef.current = 0;
      const tick = (ts: number) => {
        if (!lastTsRef.current) lastTsRef.current = ts;
        const dt = ts - lastTsRef.current;
        lastTsRef.current = ts;

        const next = nextRevealCount(shownCountRef.current, targetRef.current.length, dt);
        shownCountRef.current = next;
        setShown(targetRef.current.slice(0, next));

        if (next < targetRef.current.length) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          rafRef.current = null;
        }
      };
      rafRef.current = requestAnimationFrame(tick);
    }
  }, [target]);

  useEffect(
    () => () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    },
    []
  );

  return shown;
}
