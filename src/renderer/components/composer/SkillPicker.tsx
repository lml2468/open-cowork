import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, Search } from 'lucide-react';
import type { Skill } from '../../types';
import { localizeSkill } from '../../utils/localize-skill';
import { matchesQuery } from '../../utils/composer-autocomplete';
import { useEnabledSkills } from '../../hooks/useEnabledSkills';
import { ComposerPopover } from './ComposerPopover';

interface SkillPickerProps {
  /** Called with the chosen skill so the composer can inject its prompt template. */
  onSelectSkill: (skill: Skill) => void;
}

/**
 * G8 — Composer skills quick-picker. A pill that opens a searchable list of the
 * enabled skills; selecting one injects that skill's prompt template into the
 * composer (reuses the existing welcome-card template injection).
 */
export function SkillPicker({ onSelectSkill }: SkillPickerProps) {
  const { t } = useTranslation();
  const skills = useEnabledSkills();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!skills) return [];
    if (!query) return skills;
    return skills.filter((skill) => {
      const { name, description } = localizeSkill(skill, t);
      return matchesQuery(name, query) || matchesQuery(description ?? '', query);
    });
  }, [skills, query, t]);

  return (
    <ComposerPopover
      icon={Sparkles}
      label={t('composer.skills.pill')}
      title={t('composer.skills.title')}
    >
      {(close) => (
        <div className="flex flex-col min-h-0">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border-subtle">
            <Search className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('composer.skills.search')}
              className="flex-1 bg-transparent border-none outline-none text-body-sm text-text-primary placeholder:text-text-muted"
            />
          </div>
          <div className="overflow-y-auto py-1">
            {skills === null ? (
              <div className="px-3 py-4 text-body-sm text-text-muted text-center">
                {t('composer.skills.loading')}
              </div>
            ) : filtered.length === 0 ? (
              <div className="px-3 py-4 text-body-sm text-text-muted text-center">
                {skills.length === 0 ? t('composer.skills.empty') : t('composer.skills.noMatch')}
              </div>
            ) : (
              filtered.map((skill) => {
                const { name, description } = localizeSkill(skill, t);
                return (
                  <button
                    key={skill.id}
                    type="button"
                    onClick={() => {
                      onSelectSkill(skill);
                      close();
                    }}
                    className="w-full flex items-start gap-2.5 px-3 py-2 text-left hover:bg-surface-hover transition-colors"
                  >
                    <span className="w-6 h-6 rounded-lg flex items-center justify-center bg-accent-muted flex-shrink-0 mt-0.5">
                      <Sparkles className="w-3.5 h-3.5 text-accent" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-body-sm font-medium text-text-primary truncate">
                        {name}
                      </span>
                      {description && (
                        <span className="block text-caption text-text-muted line-clamp-2 leading-snug">
                          {description}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </ComposerPopover>
  );
}
