export type FollowOutputResult = 'auto' | 'smooth' | false;

/**
 * Decides react-virtuoso's `followOutput` behavior for the chat message list.
 *
 * When the user is at (or near) the bottom, keep the newest content in view —
 * `smooth` gives a gentle nudge as new turns arrive. When they've scrolled up
 * to read history, return `false` so incoming messages don't yank the viewport
 * back down and interrupt their reading.
 */
export function resolveChatFollowOutput(isAtBottom: boolean): FollowOutputResult {
  return isAtBottom ? 'smooth' : false;
}
