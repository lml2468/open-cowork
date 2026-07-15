import type { TFunction } from 'i18next';
import type { Skill } from '../types';

/**
 * Built-in skill metadata (name/description) is sourced from disk (SKILL.md
 * frontmatter) by the main process, so it ships in English regardless of UI
 * language. This renderer-side, display-only overlay maps a built-in skill's
 * slug to localized i18n keys under `skills.builtin.<slug>.{name,description}`,
 * falling back to the disk-provided values when no translation exists.
 *
 * NOTE: the underlying source of truth is the main process. Deeper localization
 * (localized frontmatter) would require a main-process change.
 */
export function localizeSkill(
  skill: Skill,
  t: TFunction
): { name: string; description: string | undefined } {
  if (skill.type !== 'builtin' || !skill.id.startsWith('builtin-')) {
    return { name: skill.name, description: skill.description };
  }
  const slug = skill.id.slice('builtin-'.length);
  const name = t(`skills.builtin.${slug}.name`, { defaultValue: skill.name });
  const description = t(`skills.builtin.${slug}.description`, {
    defaultValue: skill.description ?? '',
  });
  return { name, description: description || undefined };
}
