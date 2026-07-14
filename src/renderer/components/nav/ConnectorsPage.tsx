import { useTranslation } from 'react-i18next';
import { NavPageShell } from './NavPageShell';
import { SettingsConnectors } from '../settings/SettingsConnectors';

/** Full-page MCP connectors manager (reuses the Settings feature component). */
export function ConnectorsPage({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <NavPageShell
      title={t('nav.connectors')}
      description={t('settings.connectorsDesc')}
      onClose={onClose}
    >
      <SettingsConnectors isActive />
    </NavPageShell>
  );
}
