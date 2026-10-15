import { describe, expect, it } from 'vitest';
import { advanceMonth, checkInvariants, newScenario, scenarioGoals, toMonthIndex, yearOf } from '../src/engine/index';
import { SCENARIOS } from '../src/data/scenarios';

describe('scenarios (M8)', () => {
  it.each(SCENARIOS.map((s) => [s.id, s.year]))('%s hands over an established co-op in %i', (id, year) => {
    const s = newScenario(id as string);
    expect(yearOf(s.clock.monthIndex + 1)).toBe(year);
    expect(s.outcome).toBeFalsy();
    expect(s.coop.facilities.length).toBeGreaterThan(0);
    expect(s.reports.length).toBeGreaterThan(0);
    expect(s.setup.scenarioId).toBe(id);
    expect(s.inbox.some((i) => i.title.startsWith('Scenario:') && !i.read)).toBe(true);
    const g = scenarioGoals(s)!;
    expect(g.goals.length).toBeGreaterThan(0);
    expect(g.judged).toBe(false);
    expect(checkInvariants(s)).toEqual([]);
  });

  it('judges the goals at the deadline with a memo', () => {
    let s = newScenario('ethanol-boom-2005');
    const deadline = toMonthIndex(SCENARIOS.find((x) => x.id === 'ethanol-boom-2005')!.deadlineYear, 1);
    while (!s.outcome && s.clock.monthIndex < deadline) s = advanceMonth(s).state;
    if (s.outcome) return; // the GM can fail before the deadline; the goal check is then moot
    expect(s.inbox.some((i) => i.title.startsWith('Scenario complete'))).toBe(true);
    expect(scenarioGoals(s)!.judged).toBe(true);
  });
});
