/**
 * Tests for src/renderer/utils/capability-badges.
 *
 * These helpers derive informational badges from real skill/connector metadata.
 */
import { describe, it, expect } from 'vitest';
import {
  getSkillCapabilityBadges,
  getConnectorCapabilityBadges,
} from '../../renderer/utils/capability-badges';

describe('getSkillCapabilityBadges', () => {
  it('marks built-in and custom skills as local-only', () => {
    expect(getSkillCapabilityBadges({ type: 'builtin' }).map((b) => b.id)).toEqual(['local-only']);
    expect(getSkillCapabilityBadges({ type: 'custom' }).map((b) => b.id)).toEqual(['local-only']);
  });

  it('marks mcp skills as connector-backed', () => {
    const badges = getSkillCapabilityBadges({ type: 'mcp' });
    expect(badges.map((b) => b.id)).toEqual(['connector']);
    expect(badges[0].tone).toBe('network');
  });
});

describe('getConnectorCapabilityBadges', () => {
  it('marks stdio connectors as a local process', () => {
    const badges = getConnectorCapabilityBadges({ type: 'stdio', hasCredentials: false });
    expect(badges.map((b) => b.id)).toEqual(['local-process']);
  });

  it('marks remote transports as network', () => {
    expect(
      getConnectorCapabilityBadges({ type: 'sse', hasCredentials: false }).map((b) => b.id)
    ).toEqual(['network']);
    expect(
      getConnectorCapabilityBadges({ type: 'streamable-http', hasCredentials: false }).map(
        (b) => b.id
      )
    ).toEqual(['network']);
  });

  it('adds a credentials badge when credentials are required', () => {
    const badges = getConnectorCapabilityBadges({ type: 'sse', hasCredentials: true });
    expect(badges.map((b) => b.id)).toEqual(['network', 'credentials']);
    expect(badges[1].tone).toBe('warning');
  });
});
