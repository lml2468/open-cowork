import { useTranslation } from 'react-i18next';
import { NavPageShell } from './NavPageShell';
import { SettingsSchedule } from '../settings/SettingsSchedule';

/** Full-page scheduled-tasks manager (reuses the Settings feature component). */
export function TasksPage({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <NavPageShell title={t('nav.tasks')} description={t('settings.scheduleDesc')} onClose={onClose}>
      <SettingsSchedule isActive />
    </NavPageShell>
  );
}
