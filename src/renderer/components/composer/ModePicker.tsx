import { useTranslation } from 'react-i18next';
import { Compass, Hammer, Check } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ChatMode } from '../../store';
import { ComposerPopover } from './ComposerPopover';

interface ModePickerProps {
  mode: ChatMode;
  onChange: (mode: ChatMode) => void;
}

const MODE_META: Record<ChatMode, { icon: LucideIcon; labelKey: string; descKey: string }> = {
  build: { icon: Hammer, labelKey: 'composer.mode.build', descKey: 'composer.mode.buildDesc' },
  plan: { icon: Compass, labelKey: 'composer.mode.plan', descKey: 'composer.mode.planDesc' },
};

/**
 * G12 — Plan vs Build mode toggle. A composer pill showing the current mode with
 * a popover describing each mode. Persisted per session in the store; wiring the
 * flag into codex-runtime requires a backend change (documented in the report).
 */
export function ModePicker({ mode, onChange }: ModePickerProps) {
  const { t } = useTranslation();
  const CurrentIcon = MODE_META[mode].icon;

  return (
    <ComposerPopover
      icon={CurrentIcon}
      label={t(MODE_META[mode].labelKey)}
      title={t('composer.mode.title')}
      active={mode === 'plan'}
    >
      {(close) => (
        <div className="flex flex-col py-1.5">
          <div className="px-3 py-1.5 text-label uppercase text-text-muted">
            {t('composer.mode.title')}
          </div>
          {(Object.keys(MODE_META) as ChatMode[]).map((m) => {
            const Icon = MODE_META[m].icon;
            const isActive = m === mode;
            return (
              <button
                key={m}
                type="button"
                onClick={() => {
                  onChange(m);
                  close();
                }}
                className={`w-full flex items-start gap-2.5 px-3 py-2 text-left transition-colors ${
                  isActive ? 'bg-accent-muted' : 'hover:bg-surface-hover'
                }`}
              >
                <Icon
                  className={`w-4 h-4 flex-shrink-0 mt-0.5 ${isActive ? 'text-accent' : 'text-text-muted'}`}
                />
                <span className="min-w-0 flex-1">
                  <span
                    className={`block text-body-sm font-medium ${isActive ? 'text-accent' : 'text-text-primary'}`}
                  >
                    {t(MODE_META[m].labelKey)}
                  </span>
                  <span className="block text-caption text-text-muted leading-snug">
                    {t(MODE_META[m].descKey)}
                  </span>
                </span>
                {isActive && <Check className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />}
              </button>
            );
          })}
        </div>
      )}
    </ComposerPopover>
  );
}
