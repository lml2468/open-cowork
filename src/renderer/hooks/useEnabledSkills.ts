import { useEffect, useState } from 'react';
import { useAppStore } from '../store';
import type { Skill } from '../types';

/**
 * Loads the set of enabled skills for composer pickers (G8 skill pill and G11
 * `/` command palette). Reuses the existing `skills.getAll` IPC and reloads when
 * the skills storage changes. Returns `null` while loading, `[]` when none.
 */
export function useEnabledSkills(): Skill[] | null {
  const [skills, setSkills] = useState<Skill[] | null>(null);
  const skillsStorageChangedAt = useAppStore((s) => s.skillsStorageChangedAt);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.electronAPI) {
      setSkills([]);
      return;
    }
    let cancelled = false;
    window.electronAPI.skills
      .getAll()
      .then((all) => {
        if (!cancelled) setSkills(all.filter((s) => s.enabled));
      })
      .catch(() => {
        if (!cancelled) setSkills([]);
      });
    return () => {
      cancelled = true;
    };
  }, [skillsStorageChangedAt]);

  return skills;
}
