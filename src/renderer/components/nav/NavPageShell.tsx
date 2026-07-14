import type { ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface NavPageShellProps {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Generic full-width page shell for nav-rail destinations. Its scroll body
 * replicates SettingsPanel's content column (see SettingsPanel.tsx:237-238) so
 * the feature components reused inside look native.
 */
export function NavPageShell({ title, description, onClose, children }: NavPageShellProps) {
  const { t } = useTranslation();
  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background">
      <header className="flex items-center gap-3 gutter-x py-4 border-b border-border-muted flex-shrink-0 bg-background/88 backdrop-blur-sm">
        <button onClick={onClose} className="icon-btn w-8 h-8 flex-shrink-0" title={t('nav.back')}>
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="min-w-0">
          <h1 className="text-title font-semibold text-text-primary truncate">{title}</h1>
          {description && <p className="text-body-sm text-text-muted truncate">{description}</p>}
        </div>
      </header>
      <div className="flex-1 overflow-y-auto overflow-x-hidden gutter-x py-6 lg:py-8">
        <div className="max-w-content-narrow w-full min-w-0 mx-auto">{children}</div>
      </div>
    </div>
  );
}
