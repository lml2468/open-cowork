import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Sunrise,
  CalendarCheck,
  Inbox,
  GraduationCap,
  Trash2,
  Wand2,
  Sparkles,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { AUTOMATION_TEMPLATES, type AutomationTemplate } from '../../utils/activation-gallery';

interface AutomationTemplateGalleryProps {
  /** Prefills the scheduled-task create form from the chosen template. */
  onApply: (template: AutomationTemplate) => void;
}

const ICONS: Record<string, LucideIcon> = {
  sunrise: Sunrise,
  'calendar-check': CalendarCheck,
  inbox: Inbox,
  'graduation-cap': GraduationCap,
  'trash-2': Trash2,
};

/**
 * Automation template gallery (G25). Clicking a template prefills the scheduled
 * task create form (prompt + recurrence) so the scheduler has concrete starting
 * points instead of a bare create form. Renderer-only: templates are curated,
 * localized config; no new backend data.
 */
export const AutomationTemplateGallery = memo(function AutomationTemplateGallery({
  onApply,
}: AutomationTemplateGalleryProps) {
  const { t } = useTranslation();

  return (
    <div className="rounded-lg border border-border bg-surface p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-accent" />
        <div>
          <h4 className="text-body-sm font-medium text-text-primary">
            {t('schedule.templates.heading')}
          </h4>
          <p className="text-caption text-text-muted">{t('schedule.templates.hint')}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {AUTOMATION_TEMPLATES.map((template) => {
          const Icon = ICONS[template.icon] ?? Sparkles;
          return (
            <button
              key={template.id}
              type="button"
              onClick={() => onApply(template)}
              className="group flex items-start gap-3 rounded-lg border border-border bg-background px-3 py-2.5 text-left hover:bg-surface-hover hover:shadow-soft transition-colors"
            >
              <span className="w-8 h-8 rounded-xl flex items-center justify-center bg-accent-muted flex-shrink-0">
                <Icon className="w-4 h-4 text-accent" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-body-sm font-medium text-text-primary truncate">
                  {t(`schedule.templates.${template.id}.title`)}
                </span>
                <span className="block text-caption text-text-muted line-clamp-2 leading-snug mt-0.5">
                  {t(`schedule.templates.${template.id}.description`)}
                </span>
                <span className="inline-flex items-center gap-1 text-caption text-accent mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Wand2 className="w-3 h-3" />
                  {t('schedule.templates.use')}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
});
