import { describe, expect, it } from 'vitest';
import { advanceMonth, applyCommand, DEFAULT_SETUP, newGame, incomeStatement, toMonthIndex, type GameState } from '../src/engine/index';
import { expectedRefundRate } from '../src/engine/finance/selectors';
import { cloneState } from '../src/engine/sim/clone';

/** A player-like start: typical capital, a median-priced elevator, half financed. */
function typicalStart(year: number, seed: number): GameState {
  let s = newGame({ ...DEFAULT_SETUP, startYear: year, startingMembers: 400, gameSeed: seed, mapSeed: seed, historyMode: 'strict' });
  const offers = s.coop.offers.filter((o) => o.kind === 'elevator').sort((a, b) => a.price - b.price);
  s = applyCommand(s, { type: 'buyFacility', offerId: offers[Math.floor(offers.length / 2)].id, financePct: 0.5 }, { boardApproved: true }).state;
  return s;
}

const runTo = (s: GameState, year: number) => {
  while (!s.outcome && s.clock.monthIndex < toMonthIndex(year, 12)) s = advanceMonth(s).state;
  return s;
};

describe('a realistic co-op economy (D-082 to D-084)', () => {
  it.each([[1972, 3], [1987, 3], [2015, 5]])('a one-elevator co-op started in %i makes money over its first years', (year, seed) => {
    const s = runTo(typicalStart(year, seed), year + 4);
    expect(s.outcome).toBeFalsy();
    const is = incomeStatement(s.ledger, toMonthIndex(year + 1, 1), toMonthIndex(year + 4, 12));
    expect(is.savingsBeforeTax).toBeGreaterThan(0);
    // Local co-ops typically net 1–5% of sales.
    expect(is.savingsBeforeTax / is.sales).toBeGreaterThan(0.005);
  });

  it('members far from our elevator are not soured by the haul when our bids match the market', () => {
    const s = runTo(typicalStart(2010, 3), 2012);
    const members = s.members.list.filter((m) => m.status === 'active' && m.kind === 'member');
    const avg = members.reduce((a, m) => a + m.satisfaction, 0) / members.length;
    expect(avg).toBeGreaterThan(45);
  });

  it('a co-op that paid patronage makes members expect a refund', () => {
    const s = runTo(typicalStart(1987, 3), 1990);
    expect(s.coop.equityProgram.history.length).toBeGreaterThan(0);
    expect(expectedRefundRate(s)).toBeGreaterThan(0);
    // Paying more cash patronage raises the expectation.
    const w = cloneState(s);
    const h = w.coop.equityProgram.history[w.coop.equityProgram.history.length - 1];
    w.coop.equityProgram.history = [...w.coop.equityProgram.history.slice(0, -1), { ...h, cash: h.cash + h.qualified, qualified: 0 }];
    expect(expectedRefundRate(w)).toBeGreaterThan(expectedRefundRate(s));
  });
});

describe('membership grows and shrinks (D-108)', () => {
  it('sets the trade area\'s customers, with only the founders as members', async () => {
    const { newGame, DEFAULT_SETUP } = await import('../src/engine/index');
    const s = newGame({ ...DEFAULT_SETUP, startYear: 1990, startingMembers: 300, territoryCustomers: 900, gameSeed: 4, mapSeed: 4 });
    const active = s.members.list.filter((m) => m.status === 'active');
    expect(active).toHaveLength(900);
    expect(active.filter((m) => m.kind === 'member')).toHaveLength(300);
  });

  it('joining is more attractive with satisfaction and an expected refund', async () => {
    const { joinAppeal } = await import('../src/engine/members/joining');
    expect(joinAppeal(70, 0.02)).toBeGreaterThan(joinAppeal(70, 0));
    expect(joinAppeal(70, 0)).toBeGreaterThan(joinAppeal(50, 0));
    expect(joinAppeal(30, 0)).toBe(0);
  });

  it('an unhappy member who took their business elsewhere resigns and their stock is redeemed', async () => {
    const { advanceMonth, checkInvariants, newGame, DEFAULT_SETUP } = await import('../src/engine/index');
    const { cloneState } = await import('../src/engine/sim/clone');
    let s = cloneState(newGame({ ...DEFAULT_SETUP, startYear: 1990, startingMembers: 300, gameSeed: 5, mapSeed: 5 }));
    const directors = new Set(s.governance.directors.map((d) => d.memberId));
    const members = s.members.list.filter((m) => m.kind === 'member' && !directors.has(m.id));
    for (const m of members) {
      m.satisfaction = 5;
      for (const k of Object.keys(m.share)) m.share[k] = 0;
    }
    const before = s.members.list.filter((m) => m.kind === 'member').length;
    for (let i = 0; i < 6; i++) {
      s = cloneState(advanceMonth(s).state);
      for (const m of s.members.list) if (m.kind === 'member' && !directors.has(m.id)) m.satisfaction = 5;
    }
    const after = s.members.list.filter((m) => m.kind === 'member').length;
    expect(after).toBeLessThan(before);
    expect((s.members.flow ?? []).reduce((a, f) => a + f.left, 0)).toBe(before - after);
    const resigned = s.members.list.find((m) => m.kind === 'nonmember' && members.some((x) => x.id === m.id))!;
    expect(s.equity.commonStock[resigned.id] ?? 0).toBe(0);
    expect(checkInvariants(s)).toEqual([]);
  });
});

describe('business share for membership (D-117)', () => {
  it('counts only the lines a farm uses and the co-op offers', async () => {
    const { businessShare } = await import('../src/engine/members/joining');
    const s = newGame({ ...DEFAULT_SETUP, startYear: 1990, gameSeed: 1, mapSeed: 1 });
    const m = { ...s.members.list[0], acres: { corn: 300, soybeans: 200, wheat: 0, other: 0 }, livestock: { ...s.members.list[0].livestock, hogs: 0, dairy: 0, beefCows: 0, cattleOnFeed: 0 },
      share: { GRAIN_CORN: 0.6, GRAIN_SOY: 0.6, GRAIN_WHEAT: 0, AGRONOMY: 0.6, FEED: 0, ENERGY: 0 } };
    // Feed and wheat are not counted against a crop farm with no livestock and no wheat.
    expect(businessShare(m)).toBeCloseTo((0.6 * 3) / 4);
    // Energy is not counted when the co-op has no energy business.
    expect(businessShare(m, new Set(['GRAIN_CORN', 'GRAIN_SOY', 'GRAIN_WHEAT', 'AGRONOMY']))).toBeCloseTo(0.6);
  });
});

describe('facility catchment for the map heatmap (D-119)', () => {
  it('credits each town to our nearest site within reach and nothing beyond it', async () => {
    const { facilityCatchment } = await import('../src/engine/selectors');
    let s = newGame({ ...DEFAULT_SETUP, startYear: 1990, gameSeed: 2, mapSeed: 2, capitalPreset: 'well' });
    s = applyCommand(s, { type: 'buyFacility', offerId: s.coop.offers.find((o) => o.kind === 'elevator')!.id, financePct: 0.5 }, { boardApproved: true }).state;
    for (let i = 0; i < 6; i++) s = advanceMonth(s).state;
    const f = s.coop.facilities.find((x) => x.kind === 'elevator' && x.status === 'operating')!;
    const c = facilityCatchment(s, f.id)!;
    expect(c.unit).toBe('bushels a year');
    expect(c.total).toBeGreaterThan(0);
    expect(c.byTown[f.townId].value).toBeGreaterThan(0);
    for (const t of s.world.towns) if (s.world.distances[t.id][f.townId] > c.reachMiles) expect(c.byTown[t.id].value).toBe(0);
    expect(facilityCatchment(s, -1)).toBeNull();
  });
});
