import { describe, expect, it } from 'vitest';
import { advanceMonth, applyCommand, checkInvariants, confidenceWhy, DEFAULT_SETUP, newGame, satisfactionWhy, scorecard, toMonthIndex, type GameState } from '../src/engine/index';
import { migrate } from '../src/engine/save/migrations';
import { SCHEMA_VERSION } from '../src/engine/types';

function coop(year: number, seed: number): GameState {
  let s = newGame({ ...DEFAULT_SETUP, startYear: year, startingMembers: 400, gameSeed: seed, mapSeed: seed, capitalPreset: 'well', historyMode: 'strict' });
  s = applyCommand(s, { type: 'buyFacility', offerId: s.coop.offers.find((o) => o.kind === 'elevator')!.id, financePct: 0.5 }, { boardApproved: true }).state;
  return s;
}
const runTo = (s: GameState, year: number, month: number) => {
  while (!s.outcome && s.clock.monthIndex < toMonthIndex(year, month)) s = advanceMonth(s).state;
  return s;
};

describe('annual reports and scorecard (M8)', () => {
  it('records one report per closed fiscal year that agrees with the fiscal close', () => {
    const s = runTo(coop(1990, 2), 1993, 12);
    const fys = s.reports.map((r) => r.fy);
    expect(fys.length).toBeGreaterThanOrEqual(3);
    expect(new Set(fys).size).toBe(fys.length);
    for (const r of s.reports) {
      const h = s.coop.equityProgram.history.find((x) => x.fy === r.fy);
      if (h) expect(r.savingsBeforeTax).toBe(h.savingsBeforeTax);
      expect(r.totalAssets).toBeGreaterThan(0);
      expect(r.divisions.some((d) => d.division === 'GRAIN')).toBe(true);
    }
  });

  it('grades the co-op from its measures', () => {
    const s = runTo(coop(1990, 3), 1994, 1);
    const sc = scorecard(s);
    expect(sc.measures.length).toBe(9);
    for (const m of sc.measures) expect(m.score).toBeGreaterThanOrEqual(0);
    expect(['A', 'B', 'C', 'D', 'F']).toContain(sc.grade);
    expect(sc.overall).toBeGreaterThanOrEqual(0);
    expect(sc.overall).toBeLessThanOrEqual(100);
  });

  it('explains board confidence and member satisfaction', () => {
    const s = runTo(coop(1990, 5), 1992, 1);
    const c = confidenceWhy(s);
    expect(c.value).toBe(s.governance.boardConfidence);
    expect(c.components!.length).toBeGreaterThanOrEqual(3);
    const m = satisfactionWhy(s);
    expect(Number.isFinite(m.value)).toBe(true);
    for (const k of m.components!) expect(Object.is(k.value, -0)).toBe(false);
  });

  it('migrates a v7 save by adding an empty report list', () => {
    const v8 = runTo(coop(1990, 4), 1990, 6);
    const v7 = JSON.parse(JSON.stringify(v8));
    v7.schemaVersion = 7;
    delete v7.reports;
    const m = migrate(v7);
    expect(m.schemaVersion).toBe(SCHEMA_VERSION);
    expect(m.reports).toEqual([]);
    expect(checkInvariants(runTo(m, 1991, 9))).toEqual([]);
  });
});
