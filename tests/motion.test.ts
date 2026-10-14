import { describe, expect, it } from 'vitest';
import { advanceMonth, applyCommand, checkInvariants, DEFAULT_SETUP, newGame, type GameState } from '../src/engine/index';
import { TYPICAL_SITE } from '../src/data/facilities';
import { cloneState } from '../src/engine/sim/clone';
import { balance } from '../src/engine/ledger/ledger';
import { migrate } from '../src/engine/save/migrations';
import { SCHEMA_VERSION } from '../src/engine/types';
import { DEALS } from '../src/data/competition';

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

  it('ethanol plants go up after the renewable fuel standard', () => {
    const s = run(coop(2005, 3, 'strict'), 12 * 6);
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
    let s = applyCommand(coop(2000, 6), { type: 'buildFacility', kind: 'agronomy', townId: 0, components: TYPICAL_SITE.agronomy, financePct: 0.5 }, { boardApproved: true }).state;
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
