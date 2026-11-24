import { describe, expect, it } from 'vitest';
import {
  acceptOffer, advanceMonth, applyCommand, checkInvariants, DEFAULT_SETUP, makeCharacter, newGame, ownerRun, phantomValue, randomEstablishedSetup, searchMonth, startGame,
  type GameState,
} from '../src/engine/index';
import { balance } from '../src/engine/ledger/ledger';
import { POLICIES } from '../src/engine/sim/policies';
import { TYPICAL_SITE } from '../src/data/facilities';
import type { CeoCharacter } from '../src/engine/types';

const run = (s: GameState, months: number, bot = true) => {
  for (let i = 0; i < months && !s.outcome; i++) s = advanceMonth(s, bot ? POLICIES.baseline(s) : []).state;
  return s;
};
const company = (over: Record<string, unknown> = {}) => newGame({ ...DEFAULT_SETUP, startYear: 1990, startingMembers: 400, gameSeed: 7, mapSeed: 7, orgType: 'private', ownerStake: 1, ...over });
const character = (): CeoCharacter => {
  const c = makeCharacter({ name: 'Pat Doe', female: false, age: 40, background: 'merchandiser', points: { finance: 5, operations: 5, commercial: 5, leadership: 4, boardRelations: 5, memberRelations: 4, negotiation: 4 } }, 1990);
  if (typeof c === 'string') throw new Error(c);
  return c;
};

describe('private companies (D-149)', () => {
  it('a founded private company has customers, owners\' capital, a commercial bank and no board', () => {
    const s = company();
    expect(s.members.list.every((m) => m.kind === 'nonmember')).toBe(true);
    expect(balance(s.ledger, '3050')).toBeLessThan(0);
    expect(balance(s.ledger, '3000')).toBe(0);
    expect(s.coop.lenderId).toBe('local-bank');
    expect(s.governance.directors).toEqual([]);
    expect(ownerRun(s)).toBe(true);
    expect(s.privateCo?.playerStake).toBe(1);
    // The owner decides alone: a purchase happens at once, without a board vote.
    const o = s.coop.offers.find((x) => x.kind === 'elevator')!;
    const r = applyCommand(s, { type: 'buyFacility', offerId: o.id, financePct: 0.5 });
    expect(r.ok, r.messages.map((m) => m.text).join()).toBe(true);
    expect(r.state.coop.facilities.length).toBe(1);
    expect(r.state.governance.agenda).toEqual([]);
    // No mergers, no sugar.
    const coop = s.competitors.find((c) => c.kind === 'coop' && c.status === 'active');
    if (coop) expect(applyCommand(s, { type: 'proposeMerger', partnerId: coop.id }).ok).toBe(false);
    expect(applyCommand(s, { type: 'buildFacility', kind: 'sugarfactory', townId: s.coop.homeTownId, components: TYPICAL_SITE.sugarfactory, financePct: 0 }, { boardApproved: true }).ok).toBe(false);
    expect(checkInvariants(s)).toEqual([]);
  });

  it('pays corporate tax and dividends at year end, with no patronage', () => {
    let s = company();
    s = run(s, 30);
    expect(s.outcome).toBeNull();
    const src = (x: string) => s.reports.length && s.inbox.some((i) => i.title.startsWith(x));
    expect(s.reports.length).toBeGreaterThan(0);
    expect(src('Fiscal')).toBeTruthy();
    expect(s.privateCo!.dividends.length).toBeGreaterThan(0);
    expect(balance(s.ledger, '2150')).toBe(0);
    expect(balance(s.ledger, '1400')).toBe(0);
    expect(s.coop.equityProgram.history).toEqual([]);
    expect(s.members.list.some((m) => m.kind === 'member')).toBe(false);
    expect(checkInvariants(s)).toEqual([]);
    // The owner sets the dividend policy.
    expect(applyCommand(s, { type: 'setDividendPolicy', payout: 0.5 }).state.privateCo!.payout).toBe(0.5);
  }, 120_000);

  it('the owner can sell the company, and the proceeds are theirs', () => {
    let s = company({ career: { character: character() } });
    expect(s.career!.contract!.owner).toBe(true);
    s = run(s, 24);
    const before = s.career!.earnings;
    let r = applyCommand(s, { type: 'shopCompany' });
    expect(r.ok, r.messages.map((m) => m.text).join()).toBe(true);
    s = run(r.state, 3);
    const d = s.deals.find((x) => x.kind === 'buyout')!;
    expect(d.stage).toBe('terms');
    expect(d.terms?.price).toBeGreaterThan(0);
    r = applyCommand(s, { type: 'submitDeal', dealId: d.id, terms: d.terms! });
    expect(r.ok, r.messages.map((m) => m.text).join()).toBe(true);
    s = run(r.state, 3);
    expect(s.outcome?.kind).toBe('sold');
    expect(s.career!.earnings - before).toBeGreaterThanOrEqual(d.terms!.price! - 1);
    expect(s.career!.stints[0].end).toBe('sold');
  }, 120_000);

  it('a family company hires its CEO: an owners\' board, a review, phantom equity', () => {
    const ch = character();
    let s = startGame(randomEstablishedSetup({ ...DEFAULT_SETUP, startYear: 1995, gameSeed: firstPrivateSeed(ch), mapSeed: 3, career: { character: ch } }));
    expect(s.setup.orgType).toBe('private');
    expect(ownerRun(s)).toBe(false);
    expect(s.governance.directors.length).toBeGreaterThan(0);
    expect(s.privateCo!.phantom?.pct).toBeGreaterThan(0);
    expect(s.members.list.some((m) => m.kind === 'member')).toBe(false);
    // The board still votes on big projects.
    const r = applyCommand(s, { type: 'buildFacility', kind: 'agronomy', townId: s.coop.homeTownId, components: TYPICAL_SITE.agronomy, financePct: 0.5 });
    if (r.ok) expect(r.state.governance.agenda.length).toBeGreaterThan(0);
    s = run(s, 18);
    expect(s.governance.reviews.length + (s.outcome ? 1 : 0)).toBeGreaterThan(0);
    expect(phantomValue(s)).toBeGreaterThanOrEqual(0);
    expect(checkInvariants(s)).toEqual([]);
  }, 120_000);

  it('career offers include private companies, and taking one makes you their CEO', () => {
    let s = run(newGame({ ...DEFAULT_SETUP, startYear: 1985, startingMembers: 400, gameSeed: 4, mapSeed: 4, career: { character: character() } }), 24);
    s.governance.pip = true;
    s.governance.boardConfidence = 5;
    s = run(s, 1);
    expect(s.career!.status).toBe('searching');
    let found = s.career!.offers.find((o) => o.orgType === 'private');
    for (let i = 0; i < 120 && !found; i++) {
      s = searchMonth(s).state;
      found = s.career!.offers.find((o) => o.orgType === 'private');
      // Make room for more calls.
      if (!found && s.career!.offers.length >= 3) s = { ...s, career: { ...s.career!, offers: [] } };
    }
    expect(found).toBeDefined();
    expect(found!.phantomPct).toBeGreaterThan(0);
    const a = acceptOffer(s, found!.id);
    expect(a.ok, a.messages.map((m) => m.text).join()).toBe(true);
    expect(a.state.setup.orgType).toBe('private');
    expect(a.state.career!.contract!.phantomPct).toBe(found!.phantomPct);
    expect(a.state.privateCo!.phantom).toBeDefined();
    expect(checkInvariants(run(a.state, 2, false))).toEqual([]);
  }, 120_000);
});

/** A game seed whose random established employer is a private company. */
function firstPrivateSeed(ch: CeoCharacter): number {
  for (let seed = 1; seed < 200; seed++) if (randomEstablishedSetup({ ...DEFAULT_SETUP, startYear: 1995, gameSeed: seed, mapSeed: 3, career: { character: ch } }).orgType === 'private') return seed;
  throw new Error('no private draw');
}
