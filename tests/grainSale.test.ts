import { describe, expect, it } from 'vitest';
import { advanceMonth, applyCommand, checkInvariants, DEFAULT_SETUP, newGame, type GameState } from '../src/engine/index';
import { balance } from '../src/engine/ledger/ledger';
import { cloneState } from '../src/engine/sim/clone';

const run = (s: GameState, months: number) => {
  for (let i = 0; i < months && !s.outcome; i++) s = advanceMonth(s).state;
  return s;
};
function friendly(s: GameState): GameState {
  const w = cloneState(s);
  w.governance.boardConfidence = 100;
  w.governance.directors = w.governance.directors.map((d) => ({ ...d, loyaltyToGM: 100, stance: 1, literacy: 20, petIssues: [] }));
  for (const m of w.members.list) m.satisfaction = 95;
  return w;
}
/** A co-op with an elevator, and a farm store unless `grainOnly`. */
function coop(grainOnly = false): GameState {
  let s = newGame({ ...DEFAULT_SETUP, startYear: 1990, startingMembers: 300, gameSeed: 3, mapSeed: 3, capitalPreset: 'well' });
  const buy = (kind: string) => {
    const o = s.coop.offers.find((x) => x.kind === kind)!;
    s = applyCommand(s, { type: 'buyFacility', offerId: o.id, financePct: 0.5 }, { boardApproved: true }).state;
  };
  buy('elevator');
  if (!grainOnly) buy('farmstore');
  return s;
}

describe('selling the grain business (D-147)', () => {
  it('cannot sell grain when it is the whole co-op', () => {
    const r = applyCommand(coop(true), { type: 'proposeDivisionSale', division: 'GRAIN' });
    expect(r.ok).toBe(false);
    expect(r.messages[0].text).toMatch(/whole co-op/);
  });

  it('sells the elevators with the grain, deferred-payment contracts and stored grain; hedges lifted; books tie', () => {
    // Run through harvest so there is grain in the bins, hedges and deferred-payment contracts.
    let s = run(coop(), 11);
    const bookBefore = balance(s.ledger, '1200');
    expect(bookBefore).toBeGreaterThan(0);
    let r = applyCommand(s, { type: 'proposeDivisionSale', division: 'GRAIN' });
    expect(r.ok, r.messages.map((m) => m.text).join()).toBe(true);
    s = run(r.state, 2);
    const d = s.deals.find((x) => x.kind === 'divisionSale' && x.division === 'GRAIN')!;
    expect(d.terms?.price).toBeGreaterThan(0);
    r = applyCommand(s, { type: 'submitDeal', dealId: d.id, terms: d.terms! });
    expect(r.ok, r.messages.map((m) => m.text).join()).toBe(true);
    const satBefore = (x: GameState) => x.members.list.filter((m) => m.status === 'active').reduce((a, m) => a + m.satisfaction, 0);
    s = friendly(r.state);
    let closedAt: GameState | null = null;
    let avgBefore = 0;
    for (let i = 0; i < 4 && !closedAt; i++) {
      avgBefore = satBefore(s) / s.members.list.filter((m) => m.status === 'active').length;
      s = advanceMonth(s).state;
      if (s.deals.find((x) => x.id === d.id)?.stage === 'closed') closedAt = s;
      else s = friendly(s);
    }
    expect(closedAt).not.toBeNull();
    s = closedAt!;
    expect(s.coop.facilities.filter((f) => f.division === 'GRAIN' && f.status !== 'closed')).toHaveLength(0);
    expect(s.coop.facilities.some((f) => f.division === 'RETAIL' && f.status !== 'closed')).toBe(true);
    expect(balance(s.ledger, '1200')).toBe(0);
    expect(balance(s.ledger, '2110')).toBe(0);
    expect(balance(s.ledger, '1310')).toBe(0);
    for (const p of Object.values(s.coop.grain.pos)) expect([p.ownedBu, p.dpBu, p.openStorageBu, p.shortBu]).toEqual([0, 0, 0, 0]);
    // The buyer runs the elevators, with their capacity.
    const buyer = s.competitors.find((c) => c.name === d.partnerName)!;
    expect(buyer.sites.some((x) => (x.division ?? 'GRAIN') === 'GRAIN' && x.storageBu > 0)).toBe(true);
    // Members lose their elevator: satisfaction falls by more than a month's drift.
    expect(satBefore(s) / s.members.list.filter((m) => m.status === 'active').length).toBeLessThan(avgBefore - 4);
    expect(checkInvariants(s)).toEqual([]);
    // The co-op carries on.
    s = run(s, 3);
    expect(s.outcome).toBeNull();
    expect(checkInvariants(s)).toEqual([]);
  }, 120_000);
});
