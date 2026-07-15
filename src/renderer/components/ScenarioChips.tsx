import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { LayoutGrid, Sun, Code2, Palette } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { SCENARIOS, type ScenarioFilter, type ScenarioId } from '../utils/activation-gallery';

interface ScenarioChipsProps {
  value: ScenarioFilter;
  onChange: (value: ScenarioFilter) => void;
}

const SCENARIO_ICONS: Record<ScenarioId, LucideIcon> = {
  daily: Sun,
  coding: Code2,
  design: Palette,
};

/**
 * Segmented scenario switcher on the Welcome screen (G26). Selecting a segment
 * re-filters the discovery galleries + quick-action chips by task intent.
 * `all` is the default "everything" segment.
 */
export const ScenarioChips = memo(function ScenarioChips({ value, onChange }: ScenarioChipsProps) {
  const { t } = useTranslation();

  const segments: Array<{ id: ScenarioFilter; label: string; icon: LucideIcon }> = [
    { id: 'all', label: t('welcome.scenarios.all'), icon: LayoutGrid },
    ...SCENARIOS.map((id) => ({
      id,
      label: t(`welcome.scenarios.${id}`),
      icon: SCENARIO_ICONS[id],
    })),
  ];

  return (
    <div className="flex flex-wrap items-center justify-center gap-2" role="tablist">
      {segments.map((segment) => {
        const isActive = segment.id === value;
        const Icon = segment.icon;
        return (
          <button
            key={segment.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(segment.id)}
            className={`tag rounded-full transition-colors ${
              isActive
                ? 'border-accent/40 bg-accent-muted text-accent hover:bg-accent-muted'
                : 'text-text-secondary'
            }`}
          >
            <Icon className={`w-4 h-4 ${isActive ? 'text-accent' : 'text-text-muted'}`} />
            <span>{segment.label}</span>
          </button>
        );
      })}
    </div>
  );
});
