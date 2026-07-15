import { useTranslation } from 'react-i18next';
import { Lock, Plug, Globe, Terminal, KeyRound } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type {
  CapabilityBadgeDescriptor,
  CapabilityBadgeIcon,
  CapabilityBadgeTone,
} from '../utils/capability-badges';

const TONE_CLASSES: Record<CapabilityBadgeTone, string> = {
  muted: 'bg-surface-muted text-text-muted border border-border-subtle',
  accent: 'bg-accent/10 text-accent border border-accent/20',
  warning: 'bg-warning/10 text-warning border border-warning/20',
  network: 'bg-mcp/10 text-mcp border border-mcp/20',
  success: 'bg-success/10 text-success border border-success/20',
};

const ICONS: Record<CapabilityBadgeIcon, LucideIcon> = {
  lock: Lock,
  plug: Plug,
  globe: Globe,
  terminal: Terminal,
  key: KeyRound,
};

interface CapabilityBadgeProps {
  descriptor: CapabilityBadgeDescriptor;
}

/** Renders a single capability/provenance badge from a descriptor. */
export function CapabilityBadge({ descriptor }: CapabilityBadgeProps) {
  const { t } = useTranslation();
  const Icon = ICONS[descriptor.icon];
  return (
    <span
      title={descriptor.titleKey ? t(descriptor.titleKey) : undefined}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-caption font-medium ${TONE_CLASSES[descriptor.tone]}`}
    >
      <Icon className="w-3 h-3" />
      {t(descriptor.labelKey)}
    </span>
  );
}

interface CapabilityBadgeListProps {
  descriptors: CapabilityBadgeDescriptor[];
  className?: string;
}

/** Renders a wrapping row of capability badges. */
export function CapabilityBadgeList({ descriptors, className }: CapabilityBadgeListProps) {
  if (descriptors.length === 0) return null;
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className ?? ''}`}>
      {descriptors.map((descriptor) => (
        <CapabilityBadge key={descriptor.id} descriptor={descriptor} />
      ))}
    </div>
  );
}
