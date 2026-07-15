/**
 * Pure data + selection logic for the activation / onboarding galleries (B6):
 * expert personas (G23), the inspiration template gallery (G24), automation
 * templates (G25) and the welcome scenario switcher (G26).
 *
 * Kept free of React/DOM so it can be unit-tested in isolation. All curated,
 * user-facing CONTENT (titles / descriptions / seed prompts) is original and
 * lives in i18n (`welcome.experts.*`, `welcome.inspiration.*`,
 * `schedule.templates.*`); this module only carries the stable structure
 * (ids, scenario tags, icon tokens, schedule defaults). Icon tokens are
 * resolved to `lucide-react` components by the consuming component, mirroring
 * `capability-badges.ts`.
 */

/** Welcome scenario segments (G26). */
export type ScenarioId = 'daily' | 'coding' | 'design';

/** A scenario filter, including the "show everything" default. */
export type ScenarioFilter = 'all' | ScenarioId;

/** Ordered list of real scenario segments (excludes the implicit `all`). */
export const SCENARIOS: readonly ScenarioId[] = ['daily', 'coding', 'design'];

export interface ScenarioTagged {
  /** Scenarios the item belongs to; an empty list means "shown in all". */
  scenarios: ScenarioId[];
}

/** True when `item` should be shown under the given scenario filter. */
export function matchesScenario(item: ScenarioTagged, filter: ScenarioFilter): boolean {
  if (filter === 'all') return true;
  if (item.scenarios.length === 0) return true;
  return item.scenarios.includes(filter);
}

/** Filters a list of scenario-tagged items to those visible under `filter`. */
export function filterByScenario<T extends ScenarioTagged>(
  items: readonly T[],
  filter: ScenarioFilter
): T[] {
  return items.filter((item) => matchesScenario(item, filter));
}

/**
 * Expert persona (G23). Selecting one seeds the composer with a persona-framing
 * prompt (`welcome.experts.<id>.prompt`); true system-level persona injection
 * into the agent turn would need a backend field (see report).
 */
export interface ExpertPersona extends ScenarioTagged {
  id: string;
  /** lucide-react icon token, resolved in `ExpertsGallery`. */
  icon: string;
}

export const EXPERT_PERSONAS: readonly ExpertPersona[] = [
  { id: 'writing-coach', icon: 'pen-line', scenarios: ['daily'] },
  { id: 'data-analyst', icon: 'bar-chart', scenarios: ['daily'] },
  { id: 'code-reviewer', icon: 'code', scenarios: ['coding'] },
  { id: 'refactor-guide', icon: 'wrench', scenarios: ['coding'] },
  { id: 'ux-designer', icon: 'layout', scenarios: ['design'] },
  { id: 'brand-designer', icon: 'palette', scenarios: ['design'] },
];

/**
 * Inspiration template (G24) — a clonable starting point. Selecting one seeds
 * the composer prompt (`welcome.inspiration.<id>.prompt`) so the user can start
 * a session from it with one tap; works without configured credentials.
 */
export interface InspirationTemplate extends ScenarioTagged {
  id: string;
  /** lucide-react icon token, resolved in `InspirationGallery`. */
  icon: string;
}

export const INSPIRATION_TEMPLATES: readonly InspirationTemplate[] = [
  { id: 'weekly-report', icon: 'file-text', scenarios: ['daily'] },
  { id: 'meeting-notes', icon: 'notebook-pen', scenarios: ['daily'] },
  { id: 'landing-page', icon: 'layout-template', scenarios: ['design'] },
  { id: 'data-dashboard', icon: 'line-chart', scenarios: ['coding', 'design'] },
  { id: 'api-reference', icon: 'braces', scenarios: ['coding'] },
  { id: 'pitch-deck', icon: 'presentation', scenarios: ['design'] },
];

/** Recurrence supported by the automation template gallery (G25). */
export type AutomationScheduleMode = 'daily' | 'weekly';

/**
 * Automation template (G25). Selecting one prefills the scheduled-task create
 * form (prompt + recurrence). Weekday values follow `ScheduleWeekday`
 * (0 = Sunday, 1 = Monday … 6 = Saturday); `weekdays` is only used for the
 * `weekly` mode.
 */
export interface AutomationTemplate {
  id: string;
  /** lucide-react icon token, resolved in `AutomationTemplateGallery`. */
  icon: string;
  scheduleMode: AutomationScheduleMode;
  /** One or more `HH:mm` run times. */
  times: string[];
  /** Weekdays for `weekly` mode (0–6); empty for `daily`. */
  weekdays: number[];
}

export const AUTOMATION_TEMPLATES: readonly AutomationTemplate[] = [
  { id: 'daily-briefing', icon: 'sunrise', scheduleMode: 'daily', times: ['08:00'], weekdays: [] },
  {
    id: 'weekly-review',
    icon: 'calendar-check',
    scheduleMode: 'weekly',
    times: ['09:00'],
    weekdays: [1],
  },
  { id: 'inbox-triage', icon: 'inbox', scheduleMode: 'daily', times: ['09:30'], weekdays: [] },
  {
    id: 'learning-nudge',
    icon: 'graduation-cap',
    scheduleMode: 'daily',
    times: ['20:00'],
    weekdays: [],
  },
  {
    id: 'cleanup-reminder',
    icon: 'trash-2',
    scheduleMode: 'weekly',
    times: ['17:00'],
    weekdays: [5],
  },
];

/** `HH:mm`, 00:00–23:59. */
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Validates an automation template's schedule fields: at least one valid time,
 * and for weekly mode at least one in-range weekday. Guards the curated set
 * (and is the seam covered by unit tests).
 */
export function isValidAutomationTemplate(template: AutomationTemplate): boolean {
  if (template.times.length === 0) return false;
  if (!template.times.every((time) => TIME_RE.test(time))) return false;
  if (template.scheduleMode === 'weekly') {
    if (template.weekdays.length === 0) return false;
    if (!template.weekdays.every((day) => day >= 0 && day <= 6)) return false;
  }
  return true;
}
