import { Folder, GraduationCap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { NavPageShell } from './NavPageShell';

/** Styled placeholder for nav destinations that have no backend yet. */
export function ComingSoonPage({
  kind,
  onClose,
}: {
  kind: 'files' | 'experts';
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const Icon = kind === 'files' ? Folder : GraduationCap;
  const title = kind === 'files' ? t('nav.files') : t('nav.experts');
  const description = kind === 'files' ? t('nav.filesDescription') : t('nav.expertsDescription');

  return (
    <NavPageShell title={title} onClose={onClose}>
      <div className="flex flex-col items-center justify-center text-center py-24 px-6">
        <div className="w-16 h-16 rounded-4xl flex items-center justify-center bg-surface border border-border-subtle shadow-soft mb-6">
          <Icon className="w-7 h-7 text-text-muted" />
        </div>
        <h2 className="heading-serif text-heading font-semibold text-text-primary mb-2">
          {t('nav.comingSoonTitle')}
        </h2>
        <p className="text-body-sm text-text-muted max-w-md leading-relaxed">{description}</p>
      </div>
    </NavPageShell>
  );
}
