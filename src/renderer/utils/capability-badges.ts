/**
 * Pure helpers that derive capability / provenance badges for skills and
 * connectors from the metadata the main process already exposes.
 *
 * These badges are INFORMATIONAL: each one reflects a real property of the
 * skill/connector (where it runs, whether it needs credentials), never an
 * aspirational claim. No new backend data is invented here — if a field is
 * missing we simply omit the badge.
 */

export type CapabilityBadgeTone = 'muted' | 'accent' | 'warning' | 'network' | 'success';

export type CapabilityBadgeIcon = 'lock' | 'plug' | 'globe' | 'terminal' | 'key';

export interface CapabilityBadgeDescriptor {
  /** Stable id used as a React key. */
  id: string;
  /** i18n key resolved by the consuming component. */
  labelKey: string;
  tone: CapabilityBadgeTone;
  icon: CapabilityBadgeIcon;
  /** Optional i18n key for a hover tooltip explaining the badge. */
  titleKey?: string;
}

/** Skill shape (subset of `Skill`) needed to derive capability badges. */
export interface SkillBadgeInput {
  type: 'builtin' | 'mcp' | 'custom';
}

/**
 * Built-in and custom skills are local prompt/skill templates that run from
 * disk — they carry no network access or credentials on their own. `mcp`
 * skills are backed by an MCP connector, so they inherit that connector's
 * network/credential surface.
 */
export function getSkillCapabilityBadges(skill: SkillBadgeInput): CapabilityBadgeDescriptor[] {
  if (skill.type === 'mcp') {
    return [
      {
        id: 'connector',
        labelKey: 'security.badges.connector',
        titleKey: 'security.badges.connectorHint',
        tone: 'network',
        icon: 'plug',
      },
    ];
  }
  return [
    {
      id: 'local-only',
      labelKey: 'security.badges.localOnly',
      titleKey: 'security.badges.localOnlyHint',
      tone: 'muted',
      icon: 'lock',
    },
  ];
}

/** Connector shape needed to derive capability badges. */
export interface ConnectorBadgeInput {
  type: 'stdio' | 'sse' | 'streamable-http';
  /** True when the connector needs an API token / secret to work. */
  hasCredentials: boolean;
}

/**
 * `stdio` connectors run as a local child process; `sse` / `streamable-http`
 * connectors talk to a remote server over the network. A credentials badge is
 * added when the connector requires or already stores a token/secret.
 */
export function getConnectorCapabilityBadges(
  connector: ConnectorBadgeInput
): CapabilityBadgeDescriptor[] {
  const badges: CapabilityBadgeDescriptor[] = [];

  if (connector.type === 'stdio') {
    badges.push({
      id: 'local-process',
      labelKey: 'security.badges.localProcess',
      titleKey: 'security.badges.localProcessHint',
      tone: 'muted',
      icon: 'terminal',
    });
  } else {
    badges.push({
      id: 'network',
      labelKey: 'security.badges.network',
      titleKey: 'security.badges.networkHint',
      tone: 'network',
      icon: 'globe',
    });
  }

  if (connector.hasCredentials) {
    badges.push({
      id: 'credentials',
      labelKey: 'security.badges.credentials',
      titleKey: 'security.badges.credentialsHint',
      tone: 'warning',
      icon: 'key',
    });
  }

  return badges;
}
