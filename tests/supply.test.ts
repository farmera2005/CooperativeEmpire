import { describe, expect, it } from 'vitest';
import { advanceMonth, applyCommand, checkInvariants, DEFAULT_SETUP, newGame, type GameState } from '../src/engine/index';
import { TYPICAL_SITE, type FacilityKind } from '../src/data/facilities';
import { cloneState } from '../src/engine/sim/clone';

type SupplyKind = Exclude<FacilityKind, 'elevator'>;

function coop(startYear: number, kinds: SupplyKind[], seed = 1, mode: 'strict' | 'drift' = 'drift'): GameState {
  let s = newGame({ ...DEFAULT_SETUP, startYear, startingMembers: 400, gameSeed: seed, mapSeed: seed, capitalPreset: 'well', historyMode: mode });
  for (const kind of kinds) {
    const r = applyCommand(s, { type: 'buildFacility', kind, townId: s.coop.homeTownId, components: TYPICAL_SITE[kind], financePct: 0.6 }, { boardApproved: true });
    expect(r.ok, r.messages.map((m) => m.text).join()).toBe(true);
    s = r.state;
  }
  return s;
}

// Stops early if the board or the lender ends the game (an all-in co-op can lose money fast).
const run = (s: GameState, months: number) => {
  for (let i = 0; i < months && !s.outcome; i++) s = advanceMonth(s).state;
  return s;
};

const ALL: SupplyKind[] = ['agronomy', 'feedmill', 'energy', 'station', 'farmstore'];

describe('supply divisions', () => {
  for (const year of [1975, 1985, 2010]) {
    it(`a full-service co-op runs from ${year} for 5 years with every subledger tied`, () => {
      const s = run(coop(year, ALL, year), 60);
      expect(checkInvariants(s)).toEqual([]);
      for (const d of ['AGRONOMY', 'FEED', 'ENERGY', 'RETAIL'] as const) {
        const sales = s.coop.supply[d].reports.reduce((a, r) => a + Object.values(r.lines).reduce((b, l) => b + (l?.revenue ?? 0), 0), 0);
        expect(sales, d).toBeGreaterThan(0);
      }
    });
  }

  it('fertilizer filled before the 2008 peak is written down in the collapse', () => {
    let s = coop(2008, ['agronomy'], 3, 'strict');
    s = applyCommand(s, { type: 'setSupplyPolicy', division: 'AGRONOMY', policy: { summerFillPct: 0.9, winterFillPct: 0.5 } }).state;
    s = run(s, 22);
    const wd = s.coop.supply.AGRONOMY.reports.reduce((a, r) => a + r.writeDown, 0);
    expect(wd).toBeGreaterThan(0);
  });

  it('covering propane prebuys protects margin in the 2014 shortage', () => {
    // Built during 2012; prebuys sold Jul–Sep 2013, delivered into the 2013–14 shortage.
    const base = coop(2012, ['energy'], 4, 'strict');
    const hand = applyCommand(base, { type: 'setSupplyPolicy', division: 'ENERGY', policy: { supplyCover: 'hand' } }).state;
    const a = run(base, 26);
    const b = run(hand, 26);
    const gm = (s: GameState) => s.coop.supply.ENERGY.reports.slice(-4).reduce((x, r) => x + r.margin.value, 0);
    expect(gm(a)).toBeGreaterThan(gm(b));
  });

  it('too few application rigs leaves acres late and farmers aggrieved', () => {
    let s = cloneState(coop(1995, ['agronomy'], 5));
    s.coop.projects[0].components.applicator = 0;
    s = run(s, 18);
    const late = s.coop.supply.AGRONOMY.reports.some((r) => r.capacity.some((c) => c.label === 'Custom application' && c.used > c.available));
    expect(late).toBe(true);
    expect(s.members.list.some((m) => m.grievances.some((g) => g.kind === 'lateApplication'))).toBe(true);
  });

  it('a retail-heavy co-op is warned about Capper-Volstead', () => {
    const s = run(coop(1995, ['station', 'farmstore'], 6), 24);
    expect(s.inbox.some((i) => i.title.includes('Non-member business'))).toBe(true);
  });
});
