import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION, advanceMonth, applyCommand, checkInvariants, incomeStatement, DEFAULT_SETUP, hashValue, newGame, parseSave, serializeSave, toSaveFile, type GameState } from '../src/engine/index';
import { POLICIES } from '../src/engine/sim/policies';
import { migrate } from '../src/engine/save/migrations';
import { cloneState } from '../src/engine/sim/clone';
import { grainCapacity } from '../src/engine/facilities/facilities';
import { govOccupancy } from '../src/engine/grain/operate';

const setup = (startYear: number, seed = 1) => ({ ...DEFAULT_SETUP, startYear, startingMembers: 400, gameSeed: seed, mapSeed: seed });

function withElevator(startYear: number, seed = 1): GameState {
  const s = newGame(setup(startYear, seed));
  const r = applyCommand(s, { type: 'buyFacility', offerId: s.coop.offers[0].id, financePct: 0.5 }, { boardApproved: true });
  expect(r.ok).toBe(true);
  return r.state;
}

const run = (s: GameState, months: number, policy = POLICIES.idle) => {
  for (let i = 0; i < months; i++) s = advanceMonth(s, policy(s)).state;
  return s;
};

describe('facilities', () => {
  it('buying an elevator capitalizes it and the register ties to the ledger', () => {
    const s = withElevator(1975);
    expect(s.coop.facilities).toHaveLength(1);
    expect(s.coop.assets.length).toBeGreaterThan(2);
    expect(checkInvariants(s)).toEqual([]);
    const after = run(s, 14);
    expect(after.coop.assets.some((a) => a.accumDep > 0)).toBe(true);
  });

  it('builds a new elevator through construction in progress', () => {
    const s0 = newGame(setup(1980, 4));
    const town = s0.world.towns.find((t) => !s0.competitors.some((c) => c.sites.some((x) => x.townId === t.id)))!;
    const r = applyCommand(s0, { type: 'buildElevator', townId: town.id, spec: { storageType: 'storage-steel', storageBu: 100_000, receiveBuHr: 3000, dryBuHr: 500, loadout: 'truck' }, financePct: 0.5 }, { boardApproved: true });
    expect(r.ok, r.messages.map((m) => m.text).join()).toBe(true);
    expect(r.state.coop.facilities[0].status).toBe('underConstruction');
    const s = run(r.state, 10);
    expect(s.coop.facilities[0].status).toBe('operating');
    expect(grainCapacity(s.coop.facilities[0].components).storageBu).toBe(100_000);
    expect(checkInvariants(s)).toEqual([]);
  });

  it('closing a site removes its assets and books a gain or loss', () => {
    let s = withElevator(1985, 2);
    const id = s.coop.facilities[0].id;
    const r = applyCommand(s, { type: 'closeFacility', facilityId: id }, { boardApproved: true });
    expect(r.ok).toBe(true);
    s = r.state;
    expect(s.coop.assets.filter((a) => a.facilityId === id)).toHaveLength(0);
    expect(checkInvariants(s)).toEqual([]);
  });

  it('rejects purchases the co-op cannot finance', () => {
    const s = cloneState(newGame({ ...setup(1990, 3), startingMembers: 50, capitalPreset: 'shoestring' }));
    const expensive = [...s.coop.offers].sort((a, b) => b.price - a.price)[0];
    expensive.price = 1e12;
    const r = applyCommand(s, { type: 'buyFacility', offerId: expensive.id, financePct: 0.5 }, { boardApproved: true });
    expect(r.ok).toBe(false);
  });
});

describe('grain operations', () => {
  for (const year of [1970, 1985, 2010]) {
    it(`runs ${year} with the baseline policy for 6 years with all invariants`, () => {
      let s = newGame(setup(year, year));
      // Runs until the 6 years are up or the lender forces the co-op out.
      for (let i = 0; i < 72 && !s.outcome; i++) s = advanceMonth(s, POLICIES.baseline(s)).state;
      expect(checkInvariants(s)).toEqual([]);
      expect(s.coop.facilities.length).toBeGreaterThan(0);
      const received = s.coop.grain.reports.reduce((a, r) => a + r.byCommodity.corn.receivedBu, 0);
      expect(received).toBeGreaterThan(0);
    });
  }

  it('hedging makes monthly grain margins steadier than an open position', () => {
    let hedged = withElevator(2006, 1);
    let open = applyCommand(hedged, { type: 'setGrainPolicy', policy: { hedgeRatio: 0 } }, { boardApproved: true }).state;
    const mh: number[] = [];
    const mo: number[] = [];
    for (let i = 0; i < 96; i++) {
      hedged = advanceMonth(hedged).state;
      open = advanceMonth(open).state;
      mh.push(hedged.coop.grain.report!.grossMargin.value);
      mo.push(open.coop.grain.report!.grossMargin.value);
    }
    const sd = (xs: number[]) => {
      const m = xs.reduce((a, b) => a + b, 0) / xs.length;
      return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
    };
    // Flat-price risk is hedged; basis and carry risk remain.
    expect(sd(mh)).toBeLessThan(0.75 * sd(mo));
  });

  it('a tiny receiving leg turns grain away and angers farmers', () => {
    let s = cloneState(withElevator(1978, 6));
    s.coop.facilities[0].components.receiving = 300;
    s = run(s, 14);
    const turned = s.coop.grain.reports.reduce((a, r) => a + r.byCommodity.corn.turnedAwayBu + r.byCommodity.soybeans.turnedAwayBu, 0);
    expect(turned).toBeGreaterThan(0);
    expect(s.members.list.some((m) => m.grievances.some((g) => g.kind === 'harvestWait'))).toBe(true);
  });

  it('the margin breakdown ties to the ledger every month', () => {
    let s = withElevator(1979, 11);
    for (let i = 0; i < 26; i++) {
      s = advanceMonth(s).state;
      const mi = s.clock.monthIndex;
      const is = incomeStatement(s.ledger, mi, mi, 'GRAIN');
      expect(s.coop.grain.report!.grossMargin.value).toBe(is.grossMargin + is.serviceIncome);
    }
  });

  it('is deterministic with commands', () => {
    const a = run(withElevator(1972, 9), 18, POLICIES.baseline);
    const b = run(withElevator(1972, 9), 18, POLICIES.baseline);
    expect(hashValue(a)).toBe(hashValue(b));
  });
});

describe('government grain storage', () => {
  it('follows the federal stocks: heavy in the mid-1980s, gone by the late 1990s', () => {
    expect(govOccupancy(1975)).toBe(0);
    expect(govOccupancy(1983)).toBeGreaterThan(0.2);
    expect(govOccupancy(1987)).toBeGreaterThan(govOccupancy(1990));
    expect(govOccupancy(2005)).toBe(0);
  });

  it('pays storage on government grain each month while it fills part of the house', () => {
    const s = run(withElevator(1983), 2);
    const fees = s.ledger.months[s.ledger.months.length - 1].entries!.filter((e) => e.source === 'gov-storage');
    expect(fees.length).toBeGreaterThan(0);
    expect(checkInvariants(s)).toEqual([]);
    const later = run(withElevator(2005), 2);
    expect(later.ledger.months[later.ledger.months.length - 1].entries!.some((e) => e.source === 'gov-storage')).toBe(false);
  });
});

describe('save migration', () => {
  it('upgrades a schema-1 save to the current schema and keeps playing', () => {
    const v2 = newGame(setup(1975, 8));
    const v1 = JSON.parse(JSON.stringify(v2));
    v1.schemaVersion = 1;
    delete v1.competitors;
    for (const k of ['facilities', 'projects', 'assets', 'nextId', 'grainPolicy', 'grain', 'offers', 'finance', 'grainStats', 'supply', 'supplyPolicy', 'patronageStats']) delete v1.coop[k];
    for (const m of v1.members.list) {
      delete m.share;
      delete m.ytd;
    }
    for (const h of v1.history) {
      delete h.grainBu;
      delete h.grainShare;
      delete h.lineDrawn;
    }
    const migrated = migrate(v1);
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
    const next = advanceMonth(migrated).state;
    expect(checkInvariants(next)).toEqual([]);
    expect(parseSave(serializeSave(toSaveFile(next, 'x', 'y'))).state.schemaVersion).toBe(SCHEMA_VERSION);
  });
});
