import { useTranslation } from 'react-i18next';
import { NavPageShell } from './NavPageShell';
import { SettingsSkills } from '../settings/SettingsSkills';

/** Full-page Skills manager (reuses the Settings feature component standalone). */
export function SkillsPage({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <NavPageShell title={t('nav.skills')} description={t('settings.skillsDesc')} onClose={onClose}>
      <SettingsSkills isActive />
    </NavPageShell>
  );
}
