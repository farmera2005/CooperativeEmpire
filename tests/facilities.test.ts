import { describe, expect, it } from 'vitest';
import {
  advanceMonth, applyCommand, checkInvariants, consultantsAvailable, DEFAULT_SETUP, grainCapacity, modelsFor, makersFor, newGame,
  planLines, quoteProject, SCHEMA_VERSION, siteAcres, siteMarket, footprintAcres, type GameState,
} from '../src/engine/index';
import { migrate } from '../src/engine/save/migrations';
import { cloneState } from '../src/engine/sim/clone';
import { MODELS, MAKER_LINES } from '../src/data/equipment';
import { getBrand } from '../src/data/brands';
import { COMPONENTS } from '../src/data/facilities';
import { designFor, consultantRoster } from '../src/engine/facilities/consultants';
import { siteUnits } from '../src/engine/facilities/valuation';

const setup = (startYear: number, seed = 1) => ({ ...DEFAULT_SETUP, startYear, startingMembers: 400, gameSeed: seed, mapSeed: seed, capitalPreset: 'well' as const });
const run = (s: GameState, months: number) => {
  for (let i = 0; i < months && !s.outcome; i++) s = advanceMonth(s).state;
  return s;
};
function withElevator(startYear: number, seed = 1): GameState {
  const s = newGame(setup(startYear, seed));
  const r = applyCommand(s, { type: 'buyFacility', offerId: s.coop.offers.find((o) => o.kind === 'elevator')!.id, financePct: 0.5 }, { boardApproved: true });
  expect(r.ok, r.messages.map((m) => m.text).join()).toBe(true);
  return r.state;
}
const sumBy = (s: GameState, fid: number) => {
  const m: Record<string, [number, number]> = {};
  for (const a of s.coop.assets) if (a.facilityId === fid) m[a.account] = [(m[a.account]?.[0] ?? 0) + a.cost, (m[a.account]?.[1] ?? 0) + a.accumDep];
  return m;
};

describe('equipment catalog (D-129)', () => {
  it('every model and maker line is consistent with its component and brand', () => {
    for (const m of MODELS) {
      expect(COMPONENTS[m.component], m.id).toBeDefined();
      expect(m.size).toBeGreaterThan(0);
      if (m.availableTo !== undefined) expect(m.availableTo).toBeGreaterThan(m.availableFrom);
    }
    for (const l of MAKER_LINES) {
      expect(getBrand(l.brandId), l.brandId).toBeDefined();
      for (const id of l.models ?? []) expect(MODELS.some((m) => m.id === id && l.components.includes(m.component)), `${l.brandId}:${id}`).toBe(true);
    }
  });

  it('offers what fit the era: small bins and column dryers in 1970, big tanks and towers later', () => {
    const bins1970 = modelsFor('storage-steel', 1970).map((m) => m.id);
    expect(bins1970).toContain('bin-36');
    expect(bins1970).not.toContain('bin-105');
    expect(modelsFor('storage-steel', 2020).map((m) => m.id)).toContain('bin-156');
    expect(modelsFor('dryer', 1970).every((m) => m.id.startsWith('dryer-col'))).toBe(true);
    expect(modelsFor('loadout-shuttle', 1990)).toHaveLength(0);
    // Makers come and go: GSI bins from 1972, Butler bins to 1997, Sukup bins from 1983.
    const binMakers = (y: number) => makersFor('storage-steel', y).map((l) => l.brandId);
    expect(binMakers(1970)).not.toContain('gsi');
    expect(binMakers(1990)).toContain('butler');
    expect(binMakers(2000)).not.toContain('butler');
    expect(binMakers(1975)).not.toContain('sukup');
  });
});

describe('installed units (D-129)', () => {
  it('a bought elevator arrives as units whose totals are its capacity', () => {
    const s = withElevator(1975, 3);
    const f = s.coop.facilities[0];
    expect(f.units.length).toBeGreaterThan(3);
    const total = f.units.filter((u) => u.component.startsWith('storage')).reduce((a, u) => a + u.qty, 0);
    expect(Math.round(total)).toBe(Math.round(grainCapacity(f.components).storageBu));
    expect(f.units.every((u) => u.assetId !== undefined)).toBe(true);
    // Every unit was built by the time we bought it, none before the site.
    expect(f.units.every((u) => u.builtYear >= f.builtYear && u.builtYear <= 1975)).toBe(true);
    expect(checkInvariants(s)).toEqual([]);
  });

  it('units wear, makers matter, and the site condition follows them', () => {
    const s0 = withElevator(1980, 4);
    const s = run(s0, 24);
    const f = s.coop.facilities[0];
    const before = new Map(s0.coop.facilities[0].units.map((u) => [u.id, u.condition]));
    expect(f.units.filter((u) => u.component !== 'site').every((u) => u.condition < before.get(u.id)!)).toBe(true);
    const w = f.units.filter((u) => u.component !== 'site');
    expect(f.condition).toBeGreaterThanOrEqual(Math.min(...w.map((u) => u.condition)) - 1e-6);
    expect(f.condition).toBeLessThanOrEqual(Math.max(...w.map((u) => u.condition)) + 1e-6);
  });
});

describe('projects (D-129)', () => {
  it('builds a new elevator from line items, each unit coming into service as it finishes', () => {
    let s = newGame(setup(1995, 5));
    const town = s.coop.homeTownId;
    const spec = {
      townId: town, kind: 'elevator' as const, lines: [
        { modelId: 'bin-90', brandId: 'chief', count: 2 },
        { modelId: 'leg-10k', brandId: 'schlagel', count: 1 },
        { modelId: 'dryer-tower-1500', brandId: 'mc-dryers', count: 1 },
        { modelId: 'scale-elec-70', brandId: 'cardinal-scale', count: 1 },
        { land: 6 },
      ],
    };
    const q = quoteProject(s, spec);
    expect(q.problems).toEqual([]);
    expect(q.capacityAdded['storage-steel']).toBe(660_000);
    const r = applyCommand(s, { type: 'startProject', spec, financePct: 0.5 }, { boardApproved: true });
    expect(r.ok, r.messages.map((m) => m.text).join()).toBe(true);
    s = r.state;
    const f = s.coop.facilities.find((x) => x.status === 'underConstruction')!;
    expect(f.units).toHaveLength(0);
    for (let i = 0; i < 30 && s.coop.projects.length; i++) {
      s = advanceMonth(s).state;
      expect(checkInvariants(s)).toEqual([]);
    }
    const done = s.coop.facilities.find((x) => x.id === f.id)!;
    expect(done.status).toBe('operating');
    expect(done.units.filter((u) => u.modelId === 'bin-90' && u.brandId === 'chief')).toHaveLength(2);
    expect(siteAcres(done)).toBe(6);
    expect(footprintAcres(done.units)).toBeLessThanOrEqual(6);
  });

  it('refuses what the era, the site or the town cannot have', () => {
    const s = newGame(setup(1972, 6));
    const q = quoteProject(s, { townId: s.coop.homeTownId, kind: 'elevator', lines: [{ modelId: 'bin-135', brandId: 'gsi', count: 1 }] });
    expect(q.problems.join(' ')).toMatch(/not offered until 2013/);
    expect(q.problems.join(' ')).toMatch(/Not enough land/);
    const noMaker = quoteProject(s, { townId: s.coop.homeTownId, kind: 'elevator', lines: [{ modelId: 'bin-36', count: 1 }, { land: 2 }] });
    expect(noMaker.problems.join(' ')).toMatch(/Choose a maker/);
    const wrong = quoteProject(s, { townId: s.coop.homeTownId, kind: 'elevator', lines: [{ modelId: 'feed-truck-12', brandId: 'mack', count: 1 }, { land: 2 }] });
    expect(wrong.problems.join(' ')).toMatch(/does not belong/);
  });

  it('a skilled manager brings projects in nearer budget and schedule than a poor one, on average', () => {
    const base = newGame(setup(2005, 7));
    const firms = consultantsAvailable(base).sort((x, y) => x.skill - y.skill);
    const [poor, good] = [firms[0], firms[firms.length - 1]];
    expect(good.skill).toBeGreaterThan(poor.skill + 0.2);
    const avg = (pmId: number) => {
      let over = 0;
      let slip = 0;
      let st = base;
      for (let i = 0; i < 40; i++) {
        const r = applyCommand(st, { type: 'startProject', spec: { townId: i % st.world.towns.length, kind: 'station', lines: [{ modelId: 'cstore-2400', brandId: 'wayne', count: 1 }, { land: 2 }], pmId }, financePct: 0 }, { boardApproved: true });
        expect(r.ok, r.messages.map((m) => m.text).join()).toBe(true);
        const p = r.state.coop.projects[r.state.coop.projects.length - 1];
        over += p.overrun!;
        slip += p.slip!;
        // Keep going from a state with the town free again.
        st = { ...base, coop: { ...base.coop, nextId: r.state.coop.nextId } };
      }
      return { over: over / 40, slip: slip / 40 };
    };
    const g = avg(good.id);
    const b = avg(poor.id);
    expect(g.over).toBeLessThan(b.over);
    expect(g.slip).toBeLessThanOrEqual(b.slip);
  });

  it('rebuilding a worn unit restores it; demolishing takes it off the books', () => {
    let s = cloneState(run(withElevator(1978, 8), 6));
    const f = s.coop.facilities[0];
    const worn = [...f.units].filter((u) => u.component !== 'site').sort((a, b) => a.condition - b.condition)[0];
    worn.condition = 30;
    let r = applyCommand(s, { type: 'startProject', spec: { facilityId: f.id, townId: f.townId, kind: 'elevator', lines: [{ rebuildUnitId: worn.id }] }, financePct: 0 }, { boardApproved: true });
    expect(r.ok, r.messages.map((m) => m.text).join()).toBe(true);
    s = run(r.state, 4);
    const after = s.coop.facilities[0].units.find((u) => u.id === worn.id)!;
    expect(after.condition).toBeGreaterThan(worn.condition + 30);
    expect(after.rebuilds).toBe(1);
    expect(checkInvariants(s)).toEqual([]);
    // Take down a scale (not storage, so grain on hand is no obstacle).
    const scale = s.coop.facilities[0].units.find((u) => u.component === 'truck-scale')!;
    r = applyCommand(s, { type: 'demolishUnit', facilityId: f.id, unitId: scale.id });
    expect(r.ok, r.messages.map((m) => m.text).join()).toBe(true);
    expect(r.state.coop.facilities[0].units.some((u) => u.id === scale.id)).toBe(false);
    expect(r.state.coop.assets.some((a) => a.id === scale.assetId)).toBe(false);
    expect(checkInvariants(r.state)).toEqual([]);
  });
});

describe('consultants (D-129)', () => {
  it('firms come and go, and only those in business can be hired', () => {
    const s70 = newGame(setup(1970, 9));
    const s20 = newGame(setup(2020, 9));
    const a = consultantsAvailable(s70).map((c) => c.id);
    const b = consultantsAvailable(s20).map((c) => c.id);
    expect(a.length).toBeGreaterThan(1);
    expect(b.length).toBeGreaterThan(1);
    expect(a.some((id) => !b.includes(id))).toBe(true);
    // Fictional firm names never borrow an equipment brand.
    for (const c of consultantRoster(s20)) expect(c.name).not.toMatch(/Behlen|Butler|Zimmerman|Meyer|Brock|Chief/);
  });

  it('a skilled firm reads the market closer than a careless one', () => {
    const s = newGame(setup(2000, 10));
    const base = consultantRoster(s)[0];
    const good = { ...base, specialties: ['grain' as const], skill: 0.95, integrity: 0.95 };
    const poor = { ...base, specialties: ['grain' as const], skill: 0.08, integrity: 0.3 };
    const miss = (c: typeof good) => {
      let e = 0;
      for (let m = 0; m < 24; m++) {
        const st = { ...s, clock: { ...s.clock, monthIndex: s.clock.monthIndex + m } };
        for (let t = 0; t < Math.min(6, s.world.towns.length); t++) {
          const truth = siteMarket(st, t, 'elevator').annual;
          if (truth <= 0) continue;
          e += Math.abs(Math.log(designFor(st, c, t, 'elevator').basis[0].value / truth));
        }
      }
      return e;
    };
    expect(miss(good) * 3).toBeLessThan(miss(poor));
  });

  it('a design study is paid for and kept until used', () => {
    const s = newGame(setup(1990, 11));
    const c = consultantsAvailable(s).find((x) => x.specialties.includes('grain'))!;
    const r = applyCommand(s, { type: 'commissionDesign', consultantId: c.id, townId: s.coop.homeTownId, kind: 'elevator' });
    expect(r.ok, r.messages.map((m) => m.text).join()).toBe(true);
    expect(r.state.coop.designs).toHaveLength(1);
    expect(r.state.coop.consultantLog[0]).toMatchObject({ consultantId: c.id, role: 'design' });
    const d = r.state.coop.designs[0];
    expect(d.lines.length).toBeGreaterThan(2);
    const q = quoteProject(r.state, { townId: d.townId, kind: d.kind, lines: d.lines.map((l) => (l.modelId === 'land' ? { land: l.acres! } : { modelId: l.modelId, brandId: l.brandId, count: l.count })), designId: d.id });
    expect(q.problems).toEqual([]);
    expect(checkInvariants(r.state)).toEqual([]);
  });
});

describe('save migration v9 → v10 (installed units)', () => {
  it('splits each site into units and re-keys its assets without touching the books', () => {
    const v10 = run(withElevator(1985, 12), 3);
    const v9 = JSON.parse(JSON.stringify(v10));
    v9.schemaVersion = 9;
    delete v9.coop.designs;
    delete v9.coop.consultantLog;
    // Before D-129: one asset per component, no units.
    for (const f of v9.coop.facilities) {
      const totals = sumBy(v10, f.id);
      v9.coop.assets = v9.coop.assets.filter((a: { facilityId: number }) => a.facilityId !== f.id);
      for (const [account, [cost, accumDep]] of Object.entries(totals)) v9.coop.assets.push({ id: v9.coop.nextId++, facilityId: f.id, label: `${f.name}: ${account}`, account, cost, accumDep, lifeMonths: 300, startMonth: v9.clock.monthIndex });
      delete f.units;
    }
    const m = migrate(cloneState(v9));
    expect(m.schemaVersion).toBe(SCHEMA_VERSION);
    expect(m.coop.designs).toEqual([]);
    for (const f of m.coop.facilities) {
      expect(f.units.length).toBeGreaterThan(0);
      expect(sumBy(m, f.id)).toEqual(sumBy(v10, f.id));
      const old = v9.coop.facilities.find((x: { id: number }) => x.id === f.id).components;
      for (const [id, q] of Object.entries(old)) expect(f.components[id as keyof typeof f.components]).toBeCloseTo(q as number, 0);
    }
    expect(checkInvariants(m)).toEqual([]);
    expect(checkInvariants(run(m, 12))).toEqual([]);
  });
});

describe('valuing existing facilities (D-130)', () => {
  it('a site is never worth more than its modern equivalent, and is worth less as it ages and wears', async () => {
    const { modernReplacementOfUnits, usedValueOfUnits } = await import('../src/engine/facilities/valuation');
    const { pathFor } = await import('../src/engine/world/macro');
    const s = newGame(setup(2000, 13));
    const path = pathFor(s);
    const mi = s.clock.monthIndex;
    const f = withElevator(2000, 13).coop.facilities[0];
    expect(usedValueOfUnits(path, mi, f.units)).toBeLessThanOrEqual(modernReplacementOfUnits(path, mi, f.units));
    const older = f.units.map((u) => ({ ...u, builtYear: u.builtYear - 15 }));
    const worn = f.units.map((u) => ({ ...u, condition: Math.max(5, u.condition - 40) }));
    expect(usedValueOfUnits(path, mi, older)).toBeLessThan(usedValueOfUnits(path, mi, f.units));
    expect(usedValueOfUnits(path, mi, worn)).toBeLessThan(usedValueOfUnits(path, mi, f.units));
  });

  it('asks well under the cost of building the same site new, and sells what it showed', () => {
    for (const y of [1970, 1990, 2010]) {
      const s = newGame(setup(y, 14));
      for (const o of s.coop.offers) {
        const q = quoteProject(s, { townId: o.townId, kind: o.kind, lines: planLines(s, o.components) });
        expect(o.price, `${y} ${o.kind}`).toBeLessThan(q.total);
      }
      const o = s.coop.offers.find((x) => x.kind === 'elevator')!;
      const r = applyCommand(s, { type: 'buyFacility', offerId: o.id, financePct: 0.5 }, { boardApproved: true });
      const f = r.state.coop.facilities[0];
      const shown = siteUnits(s, o.components, o.builtYear, o.condition, o.unitsKey!);
      expect(f.units.map((u) => [u.modelId, u.brandId, u.builtYear, Math.round(u.qty)])).toEqual(shown.map((u) => [u.modelId, u.brandId, u.builtYear, Math.round(u.qty)]));
    }
  });
});

describe('competitor plants (D-131)', () => {
  it('every competitor site is made of units whose totals are its capacity', () => {
    const s = newGame(setup(1985, 15));
    for (const c of s.competitors) for (const site of c.sites) {
      expect(site.units?.length, c.name).toBeGreaterThan(0);
      if ((site.division ?? 'GRAIN') === 'GRAIN') {
        const storage = site.units!.filter((u) => u.component.startsWith('storage-')).reduce((a, u) => a + u.qty, 0);
        expect(Math.abs(storage - site.storageBu)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('competitors wear, rebuild and build real units over the years', async () => {
    const { POLICIES } = await import('../src/engine/sim/policies');
    let s = newGame(setup(1996, 16));
    const before = new Map<string, number>(s.competitors.flatMap((c) => c.sites.flatMap((x) => (x.units ?? []).map((u): [string, number] => [`${c.id}|${x.id}|${u.id}`, u.condition]))));
    for (let i = 0; i < 12 * 12 && !s.outcome; i++) s = advanceMonth(s, POLICIES.idle(s)).state;
    const units = s.competitors.filter((c) => c.status === 'active').flatMap((c) => c.sites.flatMap((x) => (x.units ?? []).map((u) => ({ key: `${c.id}|${x.id}|${u.id}`, u }))));
    // Old units wore down; some were rebuilt; new ones were built from the catalog in these years.
    expect(units.some(({ key, u }) => before.has(key) && u.condition < before.get(key)! - 10)).toBe(true);
    expect(units.some(({ u }) => (u.rebuilds ?? 0) > 0)).toBe(true);
    const built = units.filter(({ u }) => u.builtYear > 1996 && u.component !== 'site').map(({ u }) => u);
    expect(built.length).toBeGreaterThan(0);
    for (const u of built) {
      const m = MODELS.find((x) => x.id === u.modelId)!;
      expect(m, u.modelId).toBeDefined();
      expect(m.availableFrom).toBeLessThanOrEqual(u.builtYear);
    }
    expect(s.competitors.some((c) => (c.plantService ?? 0) !== 0)).toBe(true);
    expect(checkInvariants(s)).toEqual([]);
  });

  it('a competitor site bought from the market arrives with the units it has, worn as they are', () => {
    const s = newGame(setup(1990, 17));
    const o = s.coop.offers.find((x) => x.kind === 'elevator' && x.units)!;
    const r = applyCommand(s, { type: 'buyFacility', offerId: o.id, financePct: 0.5 }, { boardApproved: true });
    expect(r.ok, r.messages.map((m) => m.text).join()).toBe(true);
    const f = r.state.coop.facilities[0];
    expect(f.units.map((u) => [u.modelId, u.brandId, u.builtYear, u.condition])).toEqual(o.units!.map((u) => [u.modelId, u.brandId, u.builtYear, u.condition]));
    expect(checkInvariants(r.state)).toEqual([]);
  });

  it('save migration v10 → v11 gives every competitor site its units', () => {
    const v11 = newGame(setup(1980, 18));
    const v10 = JSON.parse(JSON.stringify(v11));
    v10.schemaVersion = 10;
    for (const c of v10.competitors) for (const site of c.sites) { delete site.units; delete site.building; }
    const m = migrate(v10);
    expect(m.schemaVersion).toBe(SCHEMA_VERSION);
    for (const c of m.competitors) for (const site of c.sites) expect(site.units?.length).toBeGreaterThan(0);
    expect(checkInvariants(run(m, 6))).toEqual([]);
  });
});
