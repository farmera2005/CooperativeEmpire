import { describe, expect, it } from 'vitest';
import {
  advanceMonth, applyCommand, checkInvariants, DEFAULT_SETUP, makersFor, modelsFor, newGame, SCHEMA_VERSION, shareDemand, sugarCapacity, suggestedAcres,
  type GameState,
} from '../src/engine/index';
import { migrate } from '../src/engine/save/migrations';
import { COMPONENTS, type ComponentId } from '../src/data/facilities';
import { MODELS } from '../src/data/equipment';
import { SUGAR_COMPANY } from '../src/data/sugar';
import { yearOf } from '../src/engine/core/calendar';

const setup = (startYear: number, seed = 1) => ({ ...DEFAULT_SETUP, startYear, startingMembers: 400, gameSeed: seed, mapSeed: seed, capitalPreset: 'well' as const });
const run = (s: GameState, months: number) => {
  for (let i = 0; i < months && !s.outcome; i++) s = advanceMonth(s).state;
  return s;
};
const SUGAR_COMPONENTS = (Object.keys(COMPONENTS) as ComponentId[]).filter((id) => COMPONENTS[id].division === 'SUGAR');

/** A game whose sugar company comes up for sale next month, advanced into the sale. */
function atSale(startYear = 1980, seed = 3): GameState {
  const s = newGame(setup(startYear, seed));
  s.coop.sugar.company!.saleMonth = s.clock.monthIndex + 1;
  return run(s, 2);
}

describe('sugar beet catalog (D-133)', () => {
  it('every sugar component can be built, from a maker, in every year it exists', () => {
    for (const id of SUGAR_COMPONENTS) {
      for (const year of [1970, 1985, 1995, 2010, 2025]) {
        if (COMPONENTS[id].availableFrom > year) continue;
        const models = modelsFor(id, year);
        expect(models.length, `${id} ${year}`).toBeGreaterThan(0);
        for (const m of models) if (!m.generic) expect(makersFor(id, year, m.id).length, `${m.id} ${year}`).toBeGreaterThan(0);
      }
    }
    expect(MODELS.filter((m) => m.component === 'desugarization').every((m) => m.availableFrom >= 1989)).toBe(true);
  });
});

describe('the territory sugar company', () => {
  it('is placed at new game and sells within the configured years', () => {
    const s = newGame(setup(1975, 5));
    const co = s.coop.sugar.company!;
    expect(co.status).toBe('operating');
    expect(co.stationTownIds.length).toBeGreaterThan(0);
    const years = (co.saleMonth - s.clock.monthIndex) / 12;
    expect(years).toBeGreaterThanOrEqual(SUGAR_COMPANY.saleAfterYears[0]);
    expect(years).toBeLessThanOrEqual(SUGAR_COMPANY.saleAfterYears[1] + 1);
    expect((co.saleMonth % 12) + 1).toBe(10);
  });

  it('offers its plants, then closes the factory if no one buys', () => {
    let s = atSale();
    const co = s.coop.sugar.company!;
    expect(co.status).toBe('forSale');
    expect(s.coop.offers.filter((o) => co.offerIds.includes(o.id)).map((o) => o.kind)).toContain('sugarfactory');
    s = run(s, SUGAR_COMPANY.offerMonths + 2);
    expect(s.coop.sugar.company!.status).toBe('closed');
    expect(s.coop.offers.some((o) => co.offerIds.includes(o.id))).toBe(false);
    expect(checkInvariants(s)).toEqual([]);
  });
});

describe('running a beet factory', () => {
  it('growers buy shares, we buy the plants, and a campaign runs through the books', () => {
    let s = atSale();
    const co = s.coop.sugar.company!;
    // The price that raises the most.
    let best = 0;
    let price = 0;
    for (let p = 25; p <= 1500; p += 25) { const d = shareDemand(s, p); if (d.shares * p > best) { best = d.shares * p; price = p; } }
    expect(best).toBeGreaterThan(0);
    let r = applyCommand(s, { type: 'offerBeetShares', pricePerShare: price, maxShares: 100_000 });
    expect(r.ok, r.messages.map((m) => m.text).join()).toBe(true);
    s = r.state;
    expect(Object.values(s.equity.preferredStock).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    for (const id of co.offerIds) {
      r = applyCommand(s, { type: 'buyFacility', offerId: id, financePct: 0.6 }, { boardApproved: true });
      expect(r.ok, r.messages.map((m) => m.text).join()).toBe(true);
      s = r.state;
    }
    expect(sugarCapacity(s).tpd).toBeGreaterThan(0);
    expect(suggestedAcres(s, yearOf(s.clock.monthIndex))).toBeGreaterThan(0);
    // Through a February signing, a harvest and the start of slicing.
    s = run(s, 22);
    expect(s.outcome ?? null).toBeNull();
    const camp = [...s.coop.sugar.campaigns, s.coop.sugar.campaign].find((c) => c && c.deliveredTons > 0)!;
    expect(camp.contractedAcres).toBeGreaterThan(0);
    expect(camp.slicedTons).toBeGreaterThan(0);
    expect(camp.sugarCwt).toBeGreaterThan(0);
    expect(s.members.list.some((m) => (m.ytd.SUGAR_BEETS ?? 0) > 0 || (m.beetAcres ?? 0) > 0)).toBe(true);
    expect(checkInvariants(s)).toEqual([]);
  }, 60_000);

  it('rejects a payment share outside the bounds', () => {
    const s = newGame(setup(1990));
    expect(applyCommand(s, { type: 'setSugarPolicy', policy: { growerShare: 0.95 } }).ok).toBe(false);
    expect(applyCommand(s, { type: 'setSugarPolicy', policy: { growerShare: 0.55, targetAcres: 12_000 } }).ok).toBe(true);
  });
});

describe('save migration v11 → v12 (sugar)', () => {
  it('adds the sugar books, policy, company and patronage tally', () => {
    const v12 = newGame(setup(1985, 7));
    const v11 = JSON.parse(JSON.stringify(v12));
    v11.schemaVersion = 11;
    delete v11.coop.sugar;
    delete v11.coop.sugarPolicy;
    delete v11.coop.patronageStats.SUGAR;
    if (v11.coop.budget?.lines) delete v11.coop.budget.lines.SUGAR;
    if (v11.coop.equityProgram?.proposal?.basis) delete v11.coop.equityProgram.proposal.basis.SUGAR;
    const m = migrate(v11);
    expect(m.schemaVersion).toBe(SCHEMA_VERSION);
    expect(m.coop.sugar.piles).toEqual([]);
    expect(m.coop.sugarPolicy.targetAcres).toBeNull();
    expect(m.coop.patronageStats.SUGAR).toEqual({ member: 0, nonmember: 0 });
    expect(m.coop.sugar.company?.status).toBe('operating');
    expect(checkInvariants(run(m, 6))).toEqual([]);
  });
});

describe('starting as a sugar cooperative (D-134)', () => {
  const sugarStart = (year: number, seed = 3) => newGame({ ...setup(year, seed), capitalPreset: 'typical', coopType: 'sugar' });

  it('the growers buy the factory, stations and campaign in progress at founding', () => {
    const s = sugarStart(1980);
    const co = s.coop.sugar.company!;
    expect(co.status).toBe('sold');
    expect(co.factoryTownId).toBe(s.coop.homeTownId);
    const kinds = s.coop.facilities.map((f) => f.kind);
    expect(kinds).toContain('sugarfactory');
    expect(kinds.filter((k) => k === 'beetstation').length).toBeGreaterThan(0);
    expect(Object.values(s.equity.preferredStock).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    expect(s.coop.sugar.sugarCwt + s.coop.sugar.piles.reduce((a, p) => a + p.tons, 0)).toBeGreaterThan(0);
    expect(s.coop.sugarPolicy.paymentBasis).toBe('proceeds');
    expect(s.coop.offers.some((o) => co.offerIds.includes(o.id))).toBe(false);
    expect(s.inbox[0].body).toContain('beet shares');
    expect(checkInvariants(s)).toEqual([]);
    expect(JSON.stringify(sugarStart(1980))).toBe(JSON.stringify(s));
  });

  it('runs its first campaign and stays solvent', () => {
    const s = run(sugarStart(1985, 4), 10);
    expect(s.outcome ?? null).toBeNull();
    const c = s.coop.sugar.campaign!;
    expect(c.year).toBe(1985);
    expect(c.deliveredTons).toBeGreaterThan(0);
    expect(s.coop.sugar.campaigns.some((x) => x.year === 1984 && x.closed)).toBe(true);
    expect(checkInvariants(s)).toEqual([]);
  }, 60_000);

  it('passes a departed grower\'s shares and stock to growers near the plants', () => {
    const s = sugarStart(1990, 5);
    const holder = s.members.list.find((m) => (m.beetShares ?? 0) > 0)!;
    const stock = Object.values(s.equity.preferredStock).reduce((a, b) => a + b, 0);
    const shares = s.members.list.reduce((a, m) => a + (m.beetShares ?? 0) * m.weight, 0);
    holder.status = 'retired';
    const t = run(s, 2);
    expect(t.members.list.find((m) => m.id === holder.id)!.beetShares ?? 0).toBe(0);
    expect(t.equity.preferredStock[holder.id] ?? 0).toBe(0);
    expect(Object.values(t.equity.preferredStock).reduce((a, b) => a + b, 0)).toBe(stock);
    expect(t.members.list.reduce((a, m) => a + (m.beetShares ?? 0) * m.weight, 0)).toBeCloseTo(shares, 3);
    expect(checkInvariants(t)).toEqual([]);
  }, 60_000);
});
