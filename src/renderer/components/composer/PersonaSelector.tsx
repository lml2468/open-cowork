import { useTranslation } from 'react-i18next';
import { GraduationCap, Check, Sparkles, Settings2, X } from 'lucide-react';
import { usePersonas, useActiveSessionId, useActiveSessionPersonaId } from '../../store/selectors';
import { useAppStore } from '../../store';
import { ComposerPopover } from './ComposerPopover';

/**
 * In-composer persona (expert) picker. Binds a persona to the active session — its system
 * prompt is injected into the agent turn (see agent-runner). Selecting a persona also offers a
 * one-click enable of its recommended skills (soft, skippable). "Manage" opens the persona
 * manager modal. Uses the existing personas.* / skills.setEnabled IPC — no new backend surface.
 */
export function PersonaSelector() {
  const { t } = useTranslation();
  const personas = usePersonas();
  const activeSessionId = useActiveSessionId();
  const boundId = useActiveSessionPersonaId();
  const bindPersona = useAppStore((s) => s.bindPersona);
  const setShowPersonaManager = useAppStore((s) => s.setShowPersonaManager);

  const current = personas.find((p) => p.id === boundId) ?? null;

  const handleSelect = (personaId: string | null, close: () => void) => {
    close();
    if (!activeSessionId || personaId === boundId) return;
    bindPersona(activeSessionId, personaId);
  };

  const enableRecommendedSkills = async (skillIds: string[]) => {
    if (typeof window === 'undefined' || !window.electronAPI) return;
    await Promise.all(
      skillIds.map((id) => window.electronAPI!.skills.setEnabled(id, true).catch(() => undefined))
    );
  };

  return (
    <ComposerPopover
      icon={GraduationCap}
      label={current?.name ?? t('composer.persona.none')}
      title={t('composer.persona.title')}
      active={!!current}
    >
      {(close) => (
        <div className="flex flex-col overflow-y-auto py-1.5">
          <div className="px-3 py-1.5 text-label uppercase text-text-muted">
            {t('composer.persona.title')}
          </div>

          {/* Clear / no persona */}
          <button
            type="button"
            onClick={() => handleSelect(null, close)}
            className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${
              !boundId ? 'bg-accent-muted' : 'hover:bg-surface-hover'
            }`}
          >
            <X className="w-4 h-4 flex-shrink-0 text-text-muted" />
            <span className="min-w-0 flex-1 text-body-sm text-text-primary">
              {t('composer.persona.none')}
            </span>
            {!boundId && <Check className="w-4 h-4 text-accent flex-shrink-0" />}
          </button>

          {personas.map((persona) => {
            const isActive = persona.id === boundId;
            return (
              <button
                key={persona.id}
                type="button"
                onClick={() => handleSelect(persona.id, close)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${
                  isActive ? 'bg-accent-muted' : 'hover:bg-surface-hover'
                }`}
              >
                <GraduationCap
                  className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-accent' : 'text-text-muted'}`}
                />
                <span className="min-w-0 flex-1">
                  <span
                    className={`block text-body-sm font-medium truncate ${
                      isActive ? 'text-accent' : 'text-text-primary'
                    }`}
                  >
                    {persona.name}
                  </span>
                  {persona.description && (
                    <span className="block text-caption text-text-muted truncate">
                      {persona.description}
                    </span>
                  )}
                </span>
                {isActive && <Check className="w-4 h-4 text-accent flex-shrink-0" />}
              </button>
            );
          })}

          {/* One-click enable of the bound persona's recommended skills (soft, skippable) */}
          {current?.recommendedSkills && current.recommendedSkills.length > 0 && (
            <button
              type="button"
              onClick={() => {
                void enableRecommendedSkills(current.recommendedSkills!);
                close();
              }}
              className="mx-2 my-1 flex items-center gap-2 px-3 py-2 rounded-xl text-left text-body-sm text-accent hover:bg-surface-hover transition-colors"
            >
              <Sparkles className="w-4 h-4 flex-shrink-0" />
              {t('composer.persona.enableSkills', { count: current.recommendedSkills.length })}
            </button>
          )}

          <div className="my-1 border-t border-border-muted" />
          <button
            type="button"
            onClick={() => {
              close();
              setShowPersonaManager(true);
            }}
            className="mx-2 mb-1 flex items-center gap-2 px-3 py-2 rounded-xl text-left text-body-sm text-text-secondary hover:bg-surface-hover transition-colors"
          >
            <Settings2 className="w-4 h-4 flex-shrink-0" />
            {t('composer.persona.manage')}
          </button>
        </div>
      )}
    </ComposerPopover>
  );
}
