import { describe, expect, it } from 'vitest';
import { advanceMonth, applyCommand, checkInvariants, DEFAULT_SETUP, forSale, goodwillRemaining, newGame, sellerAcceptance, type GameState } from '../src/engine/index';
import { TYPICAL_SITE } from '../src/data/facilities';
import { cloneState } from '../src/engine/sim/clone';
import { balance } from '../src/engine/ledger/ledger';
import { migrate } from '../src/engine/save/migrations';
import { SCHEMA_VERSION } from '../src/engine/types';
import { DEALS } from '../src/data/competition';
import { forecastDealVote } from '../src/engine/deals/vote';
import { yearOf } from '../src/engine/core/calendar';

const run = (s: GameState, months: number) => {
  for (let i = 0; i < months && !s.outcome; i++) s = advanceMonth(s).state;
  return s;
};

function coop(year: number, seed = 1, mode: 'strict' | 'drift' = 'drift'): GameState {
  let s = newGame({ ...DEFAULT_SETUP, startYear: year, startingMembers: 400, gameSeed: seed, mapSeed: seed, capitalPreset: 'well', historyMode: mode });
  s = applyCommand(s, { type: 'buyFacility', offerId: s.coop.offers.find((o) => o.kind === 'elevator')!.id, financePct: 0.5 }, { boardApproved: true }).state;
  return s;
}

/** A friendly board and contented members, so votes go through. */
function friendly(s: GameState): GameState {
  const w = cloneState(s);
  w.governance.boardConfidence = 100;
  w.governance.directors = w.governance.directors.map((d) => ({ ...d, loyaltyToGM: 100, stance: 1, literacy: 20, petIssues: [] }));
  for (const m of w.members.list) m.satisfaction = 85;
  return w;
}

describe('competitors in motion', () => {
  it('competitors gain strength scores, move, and the world records it', () => {
    const s = run(coop(1980, 2), 12 * 8);
    const active = s.competitors.filter((c) => c.status === 'active');
    expect(active.every((c) => typeof c.strength === 'number' || (c.sites[0]?.arrivalYear ?? 0) > 1988)).toBe(true);
    expect(s.competitors.some((c) => c.lastMove)).toBe(true);
    expect(checkInvariants(s)).toEqual([]);
  });

  it('most local competitors outlast the 1980s farm crisis', () => {
    let s = coop(1978, 12, 'strict');
    const local = (x: GameState) => x.competitors.filter((c) => c.kind !== 'national' && c.status === 'active' && (c.sites[0]?.arrivalYear ?? 0) <= yearOf(x.clock.monthIndex)).length;
    const before = local(s);
    s = run(s, 12 * 10);
    expect(s.outcome).toBeFalsy();
    // Some fail or sell out, but competition remains (it all vanished before D-080).
    expect(local(s)).toBeGreaterThan(before * 0.5);
    expect(local(s)).toBeLessThan(before);
  });

  it('ethanol plants go up after the renewable fuel standard', () => {
    const s = run(coop(2005, 1, 'strict'), 12 * 6);
    expect(s.world.destinations.filter((d) => d.kind === 'ethanol').length).toBeGreaterThan(0);
  });
});

describe('deals', () => {
  it('merges with a neighboring co-op: study, diligence, board, members, closing', () => {
    let s = coop(1995, 4);
    const partner = s.competitors.find((c) => c.kind === 'coop' && c.status === 'active' && (c.sites[0].division ?? 'GRAIN') === 'GRAIN')!;
    s = cloneState(s);
    s.competitors = s.competitors.map((c) => (c.id === partner.id ? { ...c, strength: 40 } : c));
    let r = applyCommand(s, { type: 'proposeMerger', partnerId: partner.id });
    expect(r.ok, r.messages.map((m) => m.text).join()).toBe(true);
    s = run(r.state, 2);
    let d = s.deals[0];
    expect(d.stage).toBe('terms');
    r = applyCommand(s, { type: 'dealDiligence', dealId: d.id });
    expect(r.state.deals[0].diligence).toBe(true);
    r = applyCommand(r.state, { type: 'submitDeal', dealId: d.id, terms: { name: 'Prairie Unity Cooperative', partnerSeats: 2 } });
    expect(r.state.governance.agenda.some((i) => i.type === 'deal')).toBe(true);
    const facilitiesBefore = r.state.coop.facilities.length;
    s = advanceMonth(friendly(r.state)).state;
    d = s.deals[0];
    expect(['members', 'dead']).toContain(d.stage);
    if (d.stage === 'dead') return; // their board said no: a legitimate outcome
    s = run(friendly(s), 3);
    d = s.deals[0];
    if (d.stage === 'dead') return;
    expect(['integration', 'closed']).toContain(d.stage);
    expect(s.coop.facilities.length).toBeGreaterThan(facilitiesBefore);
    expect(s.coop.name).toBe('Prairie Unity Cooperative');
    expect(s.competitors.find((c) => c.id === partner.id)!.status).toBe('sold');
    expect(checkInvariants(s)).toEqual([]);
  });

  it('members back a sound, board-recommended merger and balk at a bad one', () => {
    let s = coop(1995, 4);
    const partner = s.competitors.find((c) => c.kind === 'coop' && c.status === 'active' && (c.sites[0].division ?? 'GRAIN') === 'GRAIN')!;
    s = applyCommand(s, { type: 'proposeMerger', partnerId: partner.id }).state;
    s = run(friendly(s), 2);
    const d = s.deals[0];
    const healthy = { ...d, diligence: true, truth: { ...d.truth, strength: 60, debt: Math.round(d.truth.fairValue * 0.3) } };
    const good = forecastDealVote(s, healthy, { name: s.coop.name, partnerSeats: 1 });
    expect(good.expectedYes).toBeGreaterThan(good.threshold);
    expect(good.theirExpectedYes!).toBeGreaterThan(2 / 3);
    // A debt-laden partner, a takeover of the board, and unhappy members.
    const w = cloneState(s);
    for (const m of w.members.list) m.satisfaction = 35;
    const bad = forecastDealVote(w, { ...healthy, truth: { ...healthy.truth, strength: 20, debt: Math.round(d.truth.fairValue * 0.9) } }, { name: 'New Co-op', partnerSeats: 5 });
    expect(bad.expectedYes).toBeLessThan(bad.threshold);
    expect(bad.factors.some((f) => f.key === 'leverage' && f.value < 0)).toBe(true);
  });

  it('a merger whose patrons already belong to us keeps the equity subledger tied to the books', () => {
    let closed = 0;
    for (const seed of [4, 5, 6, 7, 8]) {
      let s = cloneState(coop(1995, seed));
      const partner = s.competitors.find((c) => c.kind === 'coop' && c.status === 'active' && (c.sites[0].division ?? 'GRAIN') === 'GRAIN');
      if (!partner) continue;
      // Everyone in the partner's towns already belongs to us: nobody joins at closing.
      const towns = new Set(partner.sites.map((x) => x.townId));
      for (const m of s.members.list) if (towns.has(m.townId) && m.kind === 'nonmember') m.kind = 'member';
      // A weak partner's board almost always says yes.
      s.competitors = s.competitors.map((c) => (c.id === partner.id ? { ...c, strength: 25 } : c));
      s = applyCommand(s, { type: 'proposeMerger', partnerId: partner.id }).state;
      s = run(s, 2);
      s = applyCommand(s, { type: 'submitDeal', dealId: s.deals[0].id, terms: { name: s.coop.name, partnerSeats: 3 } }).state;
      s = run(friendly(s), 4);
      if (['integration', 'closed'].includes(s.deals[0].stage)) closed++;
      expect(checkInvariants(s)).toEqual([]);
    }
    expect(closed).toBeGreaterThan(0);
  });

  it('buys a private company: valuation, asking price, board, owner, closing, goodwill', () => {
    let s = coop(1995, 4);
    const target = s.competitors.find((c) => forSale(s, c))!;
    expect(target).toBeDefined();
    let r = applyCommand(s, { type: 'proposeAcquisition', partnerId: target.id });
    expect(r.ok, r.messages.map((m) => m.text).join()).toBe(true);
    s = run(r.state, 2);
    let d = s.deals[0];
    expect(d.kind).toBe('acquisition');
    expect(d.stage).toBe('terms');
    expect(d.asking).toBeGreaterThan(0);
    expect(d.terms?.price).toBe(d.asking);
    // Offer a tenth over the asking price: the owner sells, and the premium is goodwill.
    const offer = Math.round(d.asking! * 1.1);
    expect(sellerAcceptance(d, offer)).toBe(1);
    r = applyCommand(s, { type: 'submitDeal', dealId: d.id, terms: { ...d.terms!, price: offer, financePct: 0.5 } });
    expect(r.ok, r.messages.map((m) => m.text).join()).toBe(true);
    const sitesBefore = r.state.coop.facilities.filter((f) => f.status !== 'closed').length;
    s = run(friendly(r.state), 3);
    d = s.deals[0];
    expect(['integration', 'closed']).toContain(d.stage);
    expect(s.coop.facilities.filter((f) => f.status !== 'closed').length).toBe(sitesBefore + target.sites.length);
    expect(s.competitors.find((c) => c.id === target.id)!.status).toBe('sold');
    expect(d.goodwill).toBeGreaterThan(0);
    expect(balance(s.ledger, '1600')).toBe(d.goodwill);
    // Amortized straight-line from the month after closing.
    s = run(s, 12);
    expect(goodwillRemaining(s)).toBeLessThan(d.goodwill!);
    expect(balance(s.ledger, '1600') + balance(s.ledger, '1690')).toBe(goodwillRemaining(s));
    expect(checkInvariants(s)).toEqual([]);
  });

  it('books a bargain gain when the owner takes less than the plants and working capital are worth', () => {
    let s = coop(1995, 4);
    const target = s.competitors.find((c) => forSale(s, c))!;
    s = run(applyCommand(s, { type: 'proposeAcquisition', partnerId: target.id }).state, 2);
    // A retiring owner in a hurry: asking 80% of appraised value.
    s = cloneState(s);
    const d = s.deals[0];
    const value = d.truth.fairValue + d.truth.workingCapital;
    s.deals = [{ ...d, asking: Math.round(value * 0.8) }];
    s = applyCommand(s, { type: 'submitDeal', dealId: d.id, terms: { ...d.terms!, price: Math.round(value * 0.8), financePct: 0.5 } }).state;
    s = run(friendly(s), 3);
    expect(['integration', 'closed']).toContain(s.deals[0].stage);
    expect(s.deals[0].goodwill ?? 0).toBe(0);
    expect(balance(s.ledger, '8200')).toBeLessThan(0);
    expect(checkInvariants(s)).toEqual([]);
  });

  it('only private local companies are for sale, and never below the owner\'s floor', () => {
    let s = coop(1995, 4);
    const coopPartner = s.competitors.find((c) => c.kind === 'coop' && c.status === 'active')!;
    expect(applyCommand(s, { type: 'proposeAcquisition', partnerId: coopPartner.id }).ok).toBe(false);
    const national = s.competitors.find((c) => c.kind === 'national');
    if (national) expect(applyCommand(s, { type: 'proposeAcquisition', partnerId: national.id }).ok).toBe(false);
    const target = s.competitors.find((c) => forSale(s, c))!;
    s = run(applyCommand(s, { type: 'proposeAcquisition', partnerId: target.id }).state, 2);
    const d = s.deals[0];
    const lowball = Math.round(d.asking! * (DEALS.acceptFloor.value - 0.05));
    const r = applyCommand(s, { type: 'submitDeal', dealId: d.id, terms: { ...d.terms!, price: lowball } });
    expect(r.ok).toBe(false);
    expect(r.messages[0].text).toMatch(/will not consider/);
  });

  it('sells a farm-supply division and books the gain or loss', () => {
    let s = applyCommand(coop(2000, 5), { type: 'buildFacility', kind: 'energy', townId: 0, components: TYPICAL_SITE.energy, financePct: 0.5 }, { boardApproved: true }).state;
    s = run(s, 18);
    let r = applyCommand(s, { type: 'proposeDivisionSale', division: 'ENERGY' });
    expect(r.ok, r.messages.map((m) => m.text).join()).toBe(true);
    s = run(r.state, 2);
    const d = s.deals[0];
    expect(d.terms?.price).toBeGreaterThan(0);
    r = applyCommand(s, { type: 'submitDeal', dealId: d.id, terms: d.terms! });
    s = run(friendly(r.state), 2);
    expect(s.deals[0].stage).toBe('closed');
    expect(s.coop.facilities.filter((f) => f.division === 'ENERGY' && f.status !== 'closed')).toHaveLength(0);
    expect(balance(s.ledger, '1230', 'ENERGY')).toBe(0);
    expect(checkInvariants(s)).toEqual([]);
  });

  it('forms a joint venture and books our share of its earnings', () => {
    let s = applyCommand(coop(2000, 2), { type: 'buildFacility', kind: 'agronomy', townId: 0, components: TYPICAL_SITE.agronomy, financePct: 0.5 }, { boardApproved: true }).state;
    s = run(s, 14);
    // A neighboring co-op with an agronomy plant of its own.
    s = cloneState(s);
    const partner = s.competitors.find((c) => c.kind === 'coop' && c.status === 'active')!;
    s.competitors = s.competitors.map((c) => (c.id === partner.id ? {
      ...c, strength: 30,
      sites: [...c.sites, { id: 99, townId: c.sites[0].townId, division: 'AGRONOMY' as const, kind: 'agronomy' as const, components: { ...TYPICAL_SITE.agronomy }, storageBu: 0, receiveBuHr: 0, dryBuHr: 0, loadout: 'truck' as const, builtYear: 1990, condition: 70 }],
    } : c));
    let r = applyCommand(s, { type: 'proposeJv', partnerId: partner.id, division: 'AGRONOMY' });
    expect(r.ok, r.messages.map((m) => m.text).join()).toBe(true);
    s = run(r.state, 2);
    r = applyCommand(s, { type: 'submitDeal', dealId: s.deals[0].id, terms: s.deals[0].terms! });
    s = run(friendly(r.state), 2);
    expect(s.deals[0].stage).toBe('closed');
    expect(s.jvs).toHaveLength(1);
    const inv0 = balance(s.ledger, '1450');
    s = run(s, 6);
    expect(balance(s.ledger, '8210') + balance(s.ledger, '1450')).not.toBe(inv0);
    expect(checkInvariants(s)).toEqual([]);
  });

  it('accepting a buyout ends the game once the members agree', () => {
    let s = cloneState(coop(1990, 7));
    s.coop.finance.status = 'watch';
    const prob = DEALS.buyoutProb.value;
    (DEALS.buyoutProb as { value: number }).value = 1;
    try {
      for (let i = 0; i < 14 && !s.deals.some((d) => d.kind === 'buyout'); i++) s = advanceMonth(s).state;
    } finally {
      (DEALS.buyoutProb as { value: number }).value = prob;
    }
    const d = s.deals.find((x) => x.kind === 'buyout')!;
    expect(d).toBeDefined();
    let r = applyCommand(s, { type: 'respondDeal', dealId: d.id, accept: true });
    r = applyCommand(r.state, { type: 'submitDeal', dealId: d.id, terms: r.state.deals.find((x) => x.id === d.id)!.terms! });
    s = run(friendly(r.state), 5);
    const dd = s.deals.find((x) => x.id === d.id)!;
    // Members may still say no to selling out; either way the deal resolves.
    if (dd.stage === 'dead') expect(dd.log.join()).toMatch(/members/);
    else expect(s.outcome?.kind).toBe('absorbed');
  });
});

describe('save migration v6 → v7', () => {
  it('adds deals and joint ventures', () => {
    const v7 = run(coop(1985, 10), 1);
    const v6 = JSON.parse(JSON.stringify(v7));
    v6.schemaVersion = 6;
    delete v6.deals;
    delete v6.jvs;
    delete v6.integrationUntil;
    const m = migrate(v6);
    expect(m.schemaVersion).toBe(SCHEMA_VERSION);
    expect(m.deals).toEqual([]);
    expect(checkInvariants(run(m, 6))).toEqual([]);
  });
});

describe('investments in larger ag businesses (D-112)', () => {
  it('offers stakes that fit the era; a stake earns with its industry and can be sold', async () => {
    const { investmentReturn } = await import('../src/engine/deals/investments');
    let s = coop(2004, 3);
    // Run Januaries until an offer appears (ethanol offers are common in 2001–2008).
    for (let i = 0; i < 36 && !(s.investOffers ?? []).length; i++) s = run(s, 1);
    const o = (s.investOffers ?? [])[0];
    expect(o).toBeDefined();
    expect(applyCommand(s, { type: 'investInVenture', offerId: o.id, amount: o.maxStake + 1 }).ok).toBe(false);
    const r = applyCommand(s, { type: 'investInVenture', offerId: o.id, amount: o.minStake }, { boardApproved: true });
    expect(r.ok, r.messages.map((m) => m.text).join()).toBe(true);
    const jv = r.state.jvs.find((j) => j.investmentType === o.type)!;
    expect(jv.investment).toBe(o.minStake);
    s = run(r.state, 6);
    const after = s.jvs.find((j) => j.id === jv.id);
    if (!after) return; // the plant failed: also a legitimate outcome
    expect(after.earningsYtd !== 0 || investmentReturn(s, o.type, 2005) === 0).toBe(true);
    const sold = applyCommand(s, { type: 'sellStake', jvId: jv.id });
    expect(sold.ok).toBe(true);
    expect(sold.state.jvs.some((j) => j.id === jv.id)).toBe(false);
    expect(checkInvariants(advanceMonth(sold.state).state)).toEqual([]);
  });

  it('known industry years drive returns: the 2014 ethanol record, the 2008 bust', async () => {
    const { investmentReturn } = await import('../src/engine/deals/investments');
    const s = coop(2004, 3);
    expect(investmentReturn(s, 'ethanol', 2014)).toBeGreaterThan(0.3);
    expect(investmentReturn(s, 'ethanol', 2008)).toBeLessThan(0);
    expect(investmentReturn(s, 'biodiesel', 2009)).toBeLessThan(0);
  });
});
