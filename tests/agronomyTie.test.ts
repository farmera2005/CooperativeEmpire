import { describe, expect, it } from 'vitest';
import { advanceMonth, agronomyTieActive, applyCommand, checkInvariants, DEFAULT_SETUP, incomeStatement, newGame, tiedBeetAcres, type GameState } from '../src/engine/index';
import { TYPICAL_SITE } from '../src/data/facilities';

const run = (s: GameState, months: number) => {
  for (let i = 0; i < months && !s.outcome; i++) s = advanceMonth(s).state;
  return s;
};
const sugarCoop = () => newGame({ ...DEFAULT_SETUP, coopType: 'sugar', startYear: 1990, gameSeed: 3, mapSeed: 3, debugMode: true });

describe('beet agronomy and the requirement to buy it from us (D-148)', () => {
  it('needs an agronomy business', () => {
    const s = sugarCoop();
    const r = applyCommand(s, { type: 'setSugarPolicy', policy: { agronomyTie: true } });
    expect(r.ok).toBe(false);
    expect(agronomyTieActive(s)).toBe(false);
  });

  it('shareholders growing beets buy their beet agronomy from us, and do not like being told to', () => {
    let s = sugarCoop();
    // The sugar start is levered: pay for the plant with cash (debug capital, outside results).
    s = applyCommand(s, { type: 'debug', action: { kind: 'addCash', amount: 20_000_000_00 } }).state;
    const b = applyCommand(s, { type: 'buildFacility', kind: 'agronomy', townId: s.coop.homeTownId, components: TYPICAL_SITE.agronomy, financePct: 0 }, { boardApproved: true });
    expect(b.ok, b.messages.map((m) => m.text).join()).toBe(true);
    s = b.state;
    // Through the build, to the January before a growing season.
    for (let i = 0; i < 40 && !(s.coop.facilities.some((f) => f.division === 'AGRONOMY' && f.status === 'operating') && s.clock.monthIndex % 12 === 0); i++) s = advanceMonth(s).state;
    expect(s.coop.facilities.some((f) => f.division === 'AGRONOMY' && f.status === 'operating')).toBe(true);
    const on = applyCommand(s, { type: 'setSugarPolicy', policy: { agronomyTie: true } });
    expect(on.ok, on.messages.map((m) => m.text).join()).toBe(true);
    expect(agronomyTieActive(on.state)).toBe(true);
    const from = s.clock.monthIndex + 1;
    // Spring: contracts in February, then planting, spraying and fertilizing.
    const free = run(s, 6);
    const tied = run(on.state, 6);
    expect(tiedBeetAcres(tied).acres).toBeGreaterThan(0);
    const sales = (x: GameState) => incomeStatement(x.ledger, from, x.clock.monthIndex, 'AGRONOMY').sales;
    expect(sales(tied)).toBeGreaterThan(sales(free));
    const growerSat = (x: GameState) => {
      const ms = x.members.list.filter((m) => m.status === 'active' && (m.beetShares ?? 0) > 0 && (m.beetAcres ?? 0) > 0);
      return ms.reduce((a, m) => a + m.satisfaction, 0) / Math.max(1, ms.length);
    };
    expect(growerSat(tied)).toBeLessThan(growerSat(free));
    expect(checkInvariants(tied)).toEqual([]);
    // Lifting the requirement.
    expect(agronomyTieActive(applyCommand(tied, { type: 'setSugarPolicy', policy: { agronomyTie: false } }).state)).toBe(false);
  }, 120_000);
});
