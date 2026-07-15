import { useTranslation } from 'react-i18next';
import { Cpu, Check } from 'lucide-react';
import { useAppConfig } from '../../store/selectors';
import { useAppStore } from '../../store';
import type { ApiConfigSet } from '../../types';
import { ComposerPopover } from './ComposerPopover';

/** Resolve the model string a config-set will run under (its active profile). */
function setModel(set: ApiConfigSet): string {
  return set.profiles[set.activeProfileKey]?.model || set.provider;
}

/**
 * G7 — In-composer model picker. Replaces the read-only model pill with a
 * clickable popover listing the configured API sets (grouped by provider). The
 * active set is checked; selecting one switches the active config set via the
 * existing `config.switchSet` IPC (no new backend surface).
 */
export function ModelPicker() {
  const { t } = useTranslation();
  const appConfig = useAppConfig();
  const setAppConfig = useAppStore((s) => s.setAppConfig);
  const setIsConfigured = useAppStore((s) => s.setIsConfigured);
  const setSettingsTab = useAppStore((s) => s.setSettingsTab);
  const setShowSettings = useAppStore((s) => s.setShowSettings);

  const sets = appConfig?.configSets ?? [];
  const activeSetId = appConfig?.activeConfigSetId;
  const currentModel = appConfig?.model || t('chat.noModel');

  const handleSelect = async (setId: string, close: () => void) => {
    close();
    if (setId === activeSetId) return;
    if (typeof window === 'undefined' || !window.electronAPI) return;
    try {
      const result = await window.electronAPI.config.switchSet({ id: setId });
      if (result?.success && result.config) {
        setAppConfig(result.config);
        setIsConfigured(result.config.isConfigured);
      }
    } catch (err) {
      console.error('[ModelPicker] Failed to switch config set:', err);
    }
  };

  // Group sets by provider for readability.
  const groups = new Map<string, ApiConfigSet[]>();
  for (const set of sets) {
    const list = groups.get(set.provider) ?? [];
    list.push(set);
    groups.set(set.provider, list);
  }

  return (
    <ComposerPopover
      icon={Cpu}
      label={currentModel}
      title={t('composer.model.title')}
      active={sets.length > 1}
    >
      {(close) => (
        <div className="flex flex-col overflow-y-auto py-1.5">
          <div className="px-3 py-1.5 text-label uppercase text-text-muted">
            {t('composer.model.title')}
          </div>
          {sets.length === 0 ? (
            <button
              type="button"
              onClick={() => {
                close();
                setSettingsTab('api');
                setShowSettings(true);
              }}
              className="mx-2 my-1 px-3 py-2 rounded-xl text-left text-body-sm text-accent hover:bg-surface-hover transition-colors"
            >
              {t('composer.model.configure')}
            </button>
          ) : (
            Array.from(groups.entries()).map(([provider, providerSets]) => (
              <div key={provider} className="py-0.5">
                <div className="px-3 py-1 text-caption uppercase text-text-muted/70">
                  {provider}
                </div>
                {providerSets.map((set) => {
                  const isActive = set.id === activeSetId;
                  return (
                    <button
                      key={set.id}
                      type="button"
                      onClick={() => handleSelect(set.id, close)}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${
                        isActive ? 'bg-accent-muted' : 'hover:bg-surface-hover'
                      }`}
                    >
                      <span className="min-w-0 flex-1">
                        <span
                          className={`block text-body-sm font-medium truncate ${
                            isActive ? 'text-accent' : 'text-text-primary'
                          }`}
                        >
                          {set.name}
                        </span>
                        <span className="block text-caption text-text-muted truncate">
                          {setModel(set)}
                        </span>
                      </span>
                      {isActive && <Check className="w-4 h-4 text-accent flex-shrink-0" />}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      )}
    </ComposerPopover>
  );
}
