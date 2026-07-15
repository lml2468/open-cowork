import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FileText,
  NotebookPen,
  LayoutTemplate,
  LineChart,
  Braces,
  Presentation,
  Sparkles,
  Wand2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  INSPIRATION_TEMPLATES,
  filterByScenario,
  type ScenarioFilter,
} from '../utils/activation-gallery';
import { EmptyState } from './EmptyState';

interface InspirationGalleryProps {
  scenario: ScenarioFilter;
  /** Seeds the composer with the template's starting prompt. */
  onSeed: (prompt: string) => void;
}

const ICONS: Record<string, LucideIcon> = {
  'file-text': FileText,
  'notebook-pen': NotebookPen,
  'layout-template': LayoutTemplate,
  'line-chart': LineChart,
  braces: Braces,
  presentation: Presentation,
};

/**
 * Inspiration gallery of clonable starting points (G24). Each card seeds the
 * composer with a curated prompt ("make one like this") so a session can be
 * started with one tap — works without configured credentials.
 */
export const InspirationGallery = memo(function InspirationGallery({
  scenario,
  onSeed,
}: InspirationGalleryProps) {
  const { t } = useTranslation();
  const templates = useMemo(() => filterByScenario(INSPIRATION_TEMPLATES, scenario), [scenario]);

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2 px-1">
        <Sparkles className="w-3.5 h-3.5 text-text-muted" />
        <span className="text-label font-medium uppercase text-text-muted">
          {t('welcome.inspiration.heading')}
        </span>
      </div>
      {templates.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title={t('welcome.inspiration.emptyTitle')}
          description={t('welcome.inspiration.emptyDescription')}
          size="compact"
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {templates.map((template) => {
            const Icon = ICONS[template.icon] ?? Sparkles;
            return (
              <button
                key={template.id}
                type="button"
                onClick={() => onSeed(t(`welcome.inspiration.${template.id}.prompt`))}
                className="card group px-4 py-3.5 text-left flex items-start gap-3 hover:bg-surface-hover hover:shadow-soft transition-colors"
              >
                <span className="w-8 h-8 rounded-xl flex items-center justify-center bg-accent-muted flex-shrink-0">
                  <Icon className="w-4 h-4 text-accent" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-body-sm font-semibold text-text-primary truncate">
                    {t(`welcome.inspiration.${template.id}.title`)}
                  </span>
                  <span className="block text-caption text-text-muted line-clamp-2 leading-snug mt-0.5">
                    {t(`welcome.inspiration.${template.id}.description`)}
                  </span>
                  <span className="inline-flex items-center gap-1 text-caption text-accent mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Wand2 className="w-3 h-3" />
                    {t('welcome.inspiration.makeOne')}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});
