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

describe('supplier volume pricing', () => {
  it('discounts grow with purchases and widen over the decades', async () => {
    const { volumeDiscount } = await import('../src/engine/supply/prices');
    expect(volumeDiscount('AGRONOMY', 2010, 400_000)).toBe(0);
    expect(volumeDiscount('AGRONOMY', 2010, 5_000_000)).toBeGreaterThan(volumeDiscount('AGRONOMY', 2010, 1_000_000));
    expect(volumeDiscount('AGRONOMY', 2010, 500_000_000)).toBeCloseTo(volumeDiscount('AGRONOMY', 2010, 50_000_000));
    expect(volumeDiscount('AGRONOMY', 2015, 5_000_000)).toBeGreaterThan(volumeDiscount('AGRONOMY', 1975, 5_000_000));
    expect(volumeDiscount('ENERGY', 2015, 5_000_000)).toBeLessThan(volumeDiscount('AGRONOMY', 2015, 5_000_000));
  });

  it('lowers our cost but not the going price, and never touches crop protection', async () => {
    const { linePrice } = await import('../src/engine/supply/prices');
    const { pathFor, priceLevel } = await import('../src/engine/world/macro');
    const s = newGame({ ...DEFAULT_SETUP, startYear: 2010, startingMembers: 200 });
    const path = pathFor(s);
    const mi = s.clock.monthIndex;
    const pl = priceLevel(path, mi);
    const base = linePrice(s, path, 'FERT_N', mi, pl, pl, 'market');
    const disc = linePrice(s, path, 'FERT_N', mi, pl, pl, 'market', 0.04);
    expect(disc.cost).toBeCloseTo(base.cost * 0.96);
    expect(disc.market).toBe(base.market);
    expect(disc.ours).toBe(base.ours);
    expect(linePrice(s, path, 'CROP_PROTECTION', mi, pl, pl, 'market', 0.04).cost).toBe(linePrice(s, path, 'CROP_PROTECTION', mi, pl, pl, 'market').cost);
  });
});

describe('livestock (D-111)', () => {
  /** A co-op with a feed mill running, built in place. */
  function withMill(year: number, seed = 3): GameState {
    let s = newGame({ ...DEFAULT_SETUP, startYear: year, startingMembers: 400, gameSeed: seed, mapSeed: seed, capitalPreset: 'well' });
    s = applyCommand(s, { type: 'buyFacility', offerId: s.coop.offers.find((o) => o.kind === 'elevator')!.id, financePct: 0.5 }, { boardApproved: true }).state;
    s = applyCommand(s, { type: 'buildFacility', kind: 'feedmill', townId: s.coop.homeTownId, components: TYPICAL_SITE.feedmill, financePct: 0.5 }, { boardApproved: true }).state;
    const w = cloneState(s);
    for (const p of w.coop.projects) w.coop.facilities.find((f) => f.id === p.facilityId)!.components = { ...p.components };
    for (const f of w.coop.facilities) f.status = 'operating';
    w.coop.projects = [];
    return w;
  }

  it('needs a feed mill, and hogs need the contract-production era', () => {
    const plain = newGame({ ...DEFAULT_SETUP, startYear: 2000, startingMembers: 300 });
    expect(applyCommand(plain, { type: 'setLivestockProgram', kind: 'cattle', headPerMonth: 100, marketing: 'spot' }).ok).toBe(false);
    expect(applyCommand(withMill(1980), { type: 'setLivestockProgram', kind: 'hogs', headPerMonth: 500, marketing: 'spot' }).ok).toBe(false);
    expect(applyCommand(withMill(1980), { type: 'setLivestockProgram', kind: 'cattle', headPerMonth: 100, marketing: 'spot' }).ok).toBe(true);
  });

  it('places, feeds and sells groups through the books', () => {
    let s = withMill(2005);
    s = applyCommand(s, { type: 'setLivestockProgram', kind: 'hogs', headPerMonth: 1000, marketing: 'formula' }).state;
    s = applyCommand(s, { type: 'setLivestockProgram', kind: 'cattle', headPerMonth: 200, marketing: 'fixed' }).state;
    for (let i = 0; i < 9; i++) {
      s = advanceMonth(s).state;
      expect(checkInvariants(s)).toEqual([]);
    }
    const book = s.coop.livestock!;
    expect(book.cohorts.length).toBeGreaterThan(0);
    expect(book.sales.some((x) => x.kind === 'hogs')).toBe(true);
    expect(book.sales.some((x) => x.kind === 'cattle')).toBe(true);
    expect(book.cohorts.every((c) => c.kind !== 'cattle' || c.lockedPrice! > 0)).toBe(true);
    let sales = 0;
    for (const m of s.ledger.months) for (const [k, v] of Object.entries(m.activity)) if (k.startsWith('4050')) sales -= v;
    expect(sales).toBeGreaterThan(0);
  });
});
