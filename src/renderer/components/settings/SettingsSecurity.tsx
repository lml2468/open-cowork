import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, Trash2, FolderLock, Ban, HandMetal, Info, CheckCircle } from 'lucide-react';
import { SettingsContentSection } from './shared';
import { SettingsSandbox } from './SettingsSandbox';
import { useDeletionProtection } from '../../store/selectors';
import { useAppStore } from '../../store';

/**
 * Security Center — a single, plain-language surface consolidating open-cowork's
 * real safety posture: sandbox isolation, deletion protection, the always-on
 * path/command guards, and the per-tool approval prompts.
 *
 * Accuracy note: every claim here reflects real backend behavior.
 *  - The deletion-protection toggle is enforced in `decidePermission` (main).
 *  - The guard/approval sections are INFORMATIONAL (read-only) — they describe
 *    what `PathGuard` and the permission gate already do; they are not toggles.
 */
export function SettingsSecurity() {
  const { t } = useTranslation();
  const deletionProtection = useDeletionProtection();
  const updateSettings = useAppStore((s) => s.updateSettings);

  const handleToggleDeletionProtection = useCallback(() => {
    updateSettings({ deletionProtection: !deletionProtection });
  }, [deletionProtection, updateSettings]);

  return (
    <div className="space-y-2">
      {/* Overview */}
      <div className="p-5 rounded-lg bg-surface border border-border flex items-start gap-4">
        <div className="w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0 bg-accent/10 text-accent">
          <ShieldCheck className="w-6 h-6" />
        </div>
        <div className="min-w-0">
          <h3 className="text-body font-semibold text-text-primary">
            {t('security.overviewTitle')}
          </h3>
          <p className="mt-1 text-body-sm text-text-muted">{t('security.overviewDesc')}</p>
        </div>
      </div>

      {/* Deletion protection (real, enforced) */}
      <SettingsContentSection
        title={t('security.deletionTitle')}
        description={t('security.deletionDesc')}
      >
        <div className="rounded-lg border border-border-subtle bg-background px-4 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <Trash2 className="w-4.5 h-4.5 text-text-secondary mt-0.5 flex-shrink-0" />
              <div className="min-w-0">
                <h4 className="text-body-sm font-semibold text-text-primary">
                  {t('security.deletionToggleLabel')}
                </h4>
                <p className="mt-1 text-caption leading-5 text-text-muted">
                  {t('security.deletionToggleDesc')}
                </p>
              </div>
            </div>
            <button
              role="switch"
              aria-checked={deletionProtection}
              onClick={handleToggleDeletionProtection}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 flex-shrink-0 ${
                deletionProtection ? 'bg-accent' : 'bg-surface-muted'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-text-primary transition-transform ${
                  deletionProtection ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
          <div className="mt-3 flex items-start gap-2 rounded-md bg-surface-muted px-3 py-2 text-caption text-text-muted">
            <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span>{t('security.deletionGapNote')}</span>
          </div>
        </div>
      </SettingsContentSection>

      {/* Path & command guards (informational) */}
      <SettingsContentSection
        title={t('security.guardsTitle')}
        description={t('security.guardsDesc')}
      >
        <GuardRow
          icon={<FolderLock className="w-4 h-4" />}
          title={t('security.guardPathTitle')}
          description={t('security.guardPathDesc')}
        />
        <GuardRow
          icon={<Ban className="w-4 h-4" />}
          title={t('security.guardCommandTitle')}
          description={t('security.guardCommandDesc')}
        />
        <div className="flex items-start gap-2 rounded-md bg-surface-muted px-3 py-2 text-caption text-text-muted">
          <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>{t('security.guardScopeNote')}</span>
        </div>
      </SettingsContentSection>

      {/* Approval posture (informational) */}
      <SettingsContentSection
        title={t('security.approvalTitle')}
        description={t('security.approvalDesc')}
      >
        <GuardRow
          icon={<HandMetal className="w-4 h-4" />}
          title={t('security.approvalHighRiskTitle')}
          description={t('security.approvalHighRiskDesc')}
        />
      </SettingsContentSection>

      {/* Sandbox isolation (real toggle + status, reused) */}
      <SettingsContentSection
        title={t('security.sandboxTitle')}
        description={t('security.sandboxDesc')}
      >
        <SettingsSandbox />
      </SettingsContentSection>
    </div>
  );
}

function GuardRow({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border-subtle bg-background px-4 py-3">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-success/10 text-success">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h4 className="text-body-sm font-semibold text-text-primary">{title}</h4>
          {/* Always-on guards: this reflects PathGuard's real, unconditional behavior. */}
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-caption font-medium bg-success/10 text-success border border-success/20">
            <CheckCircle className="w-3 h-3" />
            {t('security.guardActive')}
          </span>
        </div>
        <p className="mt-1 text-caption leading-5 text-text-muted">{description}</p>
      </div>
    </div>
  );
}
