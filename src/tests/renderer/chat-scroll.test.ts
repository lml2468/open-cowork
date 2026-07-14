import { describe, it, expect } from 'vitest';
import { resolveChatFollowOutput } from '@/renderer/components/chat-scroll';

describe('resolveChatFollowOutput', () => {
  it('follows new output smoothly when the user is at the bottom', () => {
    expect(resolveChatFollowOutput(true)).toBe('smooth');
  });

  it('does not scroll when the user has scrolled up to read history', () => {
    expect(resolveChatFollowOutput(false)).toBe(false);
  });
});
