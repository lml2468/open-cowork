import { describe, it, expect } from 'vitest';
import {
  matchesScenario,
  filterByScenario,
  isValidAutomationTemplate,
  EXPERT_PERSONAS,
  INSPIRATION_TEMPLATES,
  AUTOMATION_TEMPLATES,
  SCENARIOS,
  type ScenarioTagged,
  type AutomationTemplate,
} from '@/renderer/utils/activation-gallery';

describe('matchesScenario', () => {
  it('shows everything under the "all" filter', () => {
    expect(matchesScenario({ scenarios: ['coding'] }, 'all')).toBe(true);
    expect(matchesScenario({ scenarios: [] }, 'all')).toBe(true);
  });

  it('shows scenario-agnostic items (empty tags) in every scenario', () => {
    expect(matchesScenario({ scenarios: [] }, 'daily')).toBe(true);
    expect(matchesScenario({ scenarios: [] }, 'design')).toBe(true);
  });

  it('matches only tagged scenarios otherwise', () => {
    const item: ScenarioTagged = { scenarios: ['coding', 'design'] };
    expect(matchesScenario(item, 'coding')).toBe(true);
    expect(matchesScenario(item, 'design')).toBe(true);
    expect(matchesScenario(item, 'daily')).toBe(false);
  });
});

describe('filterByScenario', () => {
  const items: ScenarioTagged[] = [
    { scenarios: ['daily'] },
    { scenarios: ['coding'] },
    { scenarios: [] },
  ];

  it('returns all items for "all"', () => {
    expect(filterByScenario(items, 'all')).toHaveLength(3);
  });

  it('returns matching + agnostic items for a specific scenario', () => {
    expect(filterByScenario(items, 'daily')).toEqual([{ scenarios: ['daily'] }, { scenarios: [] }]);
    expect(filterByScenario(items, 'design')).toEqual([{ scenarios: [] }]);
  });

  it('does not mutate the input', () => {
    const before = items.slice();
    filterByScenario(items, 'coding');
    expect(items).toEqual(before);
  });
});

describe('curated gallery data', () => {
  it('every persona/template scenario tag is a known scenario', () => {
    const known = new Set<string>(SCENARIOS);
    for (const item of [...EXPERT_PERSONAS, ...INSPIRATION_TEMPLATES]) {
      for (const s of item.scenarios) {
        expect(known.has(s)).toBe(true);
      }
    }
  });

  it('ids are unique within each gallery', () => {
    const uniq = (ids: string[]) => new Set(ids).size === ids.length;
    expect(uniq(EXPERT_PERSONAS.map((p) => p.id))).toBe(true);
    expect(uniq(INSPIRATION_TEMPLATES.map((t) => t.id))).toBe(true);
    expect(uniq(AUTOMATION_TEMPLATES.map((t) => t.id))).toBe(true);
  });

  it('every scenario is represented by at least one persona and template', () => {
    for (const scenario of SCENARIOS) {
      expect(filterByScenario(EXPERT_PERSONAS, scenario).length).toBeGreaterThan(0);
      expect(filterByScenario(INSPIRATION_TEMPLATES, scenario).length).toBeGreaterThan(0);
    }
  });
});

describe('isValidAutomationTemplate', () => {
  it('accepts every curated automation template', () => {
    for (const template of AUTOMATION_TEMPLATES) {
      expect(isValidAutomationTemplate(template)).toBe(true);
    }
  });

  it('rejects a template with no times', () => {
    const t: AutomationTemplate = {
      id: 'x',
      icon: 'inbox',
      scheduleMode: 'daily',
      times: [],
      weekdays: [],
    };
    expect(isValidAutomationTemplate(t)).toBe(false);
  });

  it('rejects a malformed time', () => {
    const t: AutomationTemplate = {
      id: 'x',
      icon: 'inbox',
      scheduleMode: 'daily',
      times: ['25:00'],
      weekdays: [],
    };
    expect(isValidAutomationTemplate(t)).toBe(false);
  });

  it('requires an in-range weekday for weekly templates', () => {
    const noDay: AutomationTemplate = {
      id: 'x',
      icon: 'inbox',
      scheduleMode: 'weekly',
      times: ['09:00'],
      weekdays: [],
    };
    const badDay: AutomationTemplate = { ...noDay, weekdays: [9] };
    expect(isValidAutomationTemplate(noDay)).toBe(false);
    expect(isValidAutomationTemplate(badDay)).toBe(false);
  });
});
