import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { PenLine, BarChart3, Code2, Wrench, Layout, Palette, GraduationCap } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  EXPERT_PERSONAS,
  filterByScenario,
  type ScenarioFilter,
} from '../utils/activation-gallery';

interface ExpertsGalleryProps {
  scenario: ScenarioFilter;
  /** Bind this persona to the (next) session and seed a persona-framing prompt. */
  onPick: (personaId: string, seedPrompt: string) => void;
  /** The currently selected persona id (highlighted), if any. */
  selectedId?: string | null;
}

const ICONS: Record<string, LucideIcon> = {
  'pen-line': PenLine,
  'bar-chart': BarChart3,
  code: Code2,
  wrench: Wrench,
  layout: Layout,
  palette: Palette,
};

/**
 * Expert/persona discovery gallery (G23). Re-homed to the Welcome screen after
 * B4 removed the Experts nav destination. Selecting a persona seeds the composer
 * with a persona-framing prompt (reusing the same prompt-seeding mechanism as
 * the skill cards); true system-level persona injection into the agent turn
 * would need a backend field (see report). Works without credentials.
 */
export const ExpertsGallery = memo(function ExpertsGallery({
  scenario,
  onPick,
  selectedId,
}: ExpertsGalleryProps) {
  const { t } = useTranslation();
  const personas = useMemo(() => filterByScenario(EXPERT_PERSONAS, scenario), [scenario]);

  if (personas.length === 0) return null;

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2 px-1">
        <GraduationCap className="w-3.5 h-3.5 text-text-muted" />
        <span className="text-label font-medium uppercase text-text-muted">
          {t('welcome.experts.heading')}
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {personas.map((persona) => {
          const Icon = ICONS[persona.icon] ?? GraduationCap;
          const isSelected = persona.id === selectedId;
          return (
            <button
              key={persona.id}
              type="button"
              onClick={() => onPick(persona.id, t(`welcome.experts.${persona.id}.prompt`))}
              className={`card px-4 py-3.5 text-left flex items-start gap-3 hover:bg-surface-hover hover:shadow-soft transition-colors ${
                isSelected ? 'ring-2 ring-accent bg-accent-muted/40' : ''
              }`}
            >
              <span className="w-8 h-8 rounded-full flex items-center justify-center bg-accent-muted flex-shrink-0">
                <Icon className="w-4 h-4 text-accent" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-body-sm font-semibold text-text-primary truncate">
                  {t(`welcome.experts.${persona.id}.name`)}
                </span>
                <span className="block text-caption text-text-muted line-clamp-2 leading-snug mt-0.5">
                  {t(`welcome.experts.${persona.id}.role`)}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
});
