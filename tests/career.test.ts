import { describe, expect, it } from 'vitest';
import {
  acceptOffer, advanceMonth, balance, askBoard, checkInvariants, counterOffer, DEFAULT_SETUP, effect, makeCharacter, newGame, packageValue, raiseWindow, resign, searchMonth,
  type CharacterInput, type GameState,
} from '../src/engine/index';
import { POLICIES } from '../src/engine/sim/policies';
import { CAREER } from '../src/data/career';
import type { CeoCharacter } from '../src/engine/types';

const input = (over: Partial<CharacterInput> = {}): CharacterInput => ({
  name: 'Pat Doe', female: false, age: 40, background: 'merchandiser',
  points: { finance: 5, operations: 5, commercial: 5, leadership: 4, boardRelations: 5, memberRelations: 4, negotiation: 4 }, ...over,
});
const character = (over: Partial<CharacterInput> = {}): CeoCharacter => {
  const c = makeCharacter(input(over), 1975);
  if (typeof c === 'string') throw new Error(c);
  return c;
};
const setup = (ch: CeoCharacter, seed = 4) => ({ ...DEFAULT_SETUP, startYear: 1975, startingMembers: 400, gameSeed: seed, mapSeed: seed, career: { character: ch } });
const run = (s: GameState, months: number) => {
  for (let i = 0; i < months && !s.outcome; i++) s = advanceMonth(s, POLICIES.baseline(s)).state;
  return s;
};
const fire = (s: GameState) => {
  s.governance.pip = true;
  s.governance.boardConfidence = 5;
  return advanceMonth(s, POLICIES.baseline(s)).state;
};

describe('career mode (D-142)', () => {
  it('characters are built from points, a background and an age', () => {
    const c = character();
    expect(c.stats.commercial).toBe(CAREER.statBase + 5 + 3);
    expect(c.birthYear).toBe(1935);
    expect(typeof makeCharacter(input({ points: { finance: 20, operations: 20, commercial: 0, leadership: 0, boardRelations: 0, memberRelations: 0, negotiation: 0 } }), 1975)).toBe('string');
    expect(typeof makeCharacter(input({ age: 80 }), 1975)).toBe('string');
    expect(typeof makeCharacter(input({ name: ' ' }), 1975)).toBe('string');
  });

  it('the founding board hires the character on a contract, and the books pay it', () => {
    let s = newGame(setup(character()));
    const k = s.career!.contract!;
    expect(k.base).toBeGreaterThan(0);
    expect(k.endMonth - k.startMonth + 1).toBe(CAREER.termYears * 12);
    s = run(s, 1);
    // No plants yet: the only wages are the GM's.
    expect(balance(s.ledger, '7000')).toBe(Math.round(k.base / 12));
    expect(s.career!.earnings).toBe(Math.round(k.base / 12));
  });

  it('a stronger GM makes a difference; a game without a career is untouched', () => {
    const strong = newGame(setup(character({ points: { finance: 6, operations: 4, commercial: 4, leadership: 4, boardRelations: 4, memberRelations: 10, negotiation: 0 } })));
    const weak = newGame(setup(character({ points: { finance: 4, operations: 4, commercial: 4, leadership: 4, boardRelations: 4, memberRelations: 0, negotiation: 0 } })));
    expect(effect(strong, 'members.satisfaction')).toBeGreaterThan(effect(weak, 'members.satisfaction'));
    const plain = newGame({ ...DEFAULT_SETUP, startYear: 1975, startingMembers: 400, gameSeed: 4, mapSeed: 4 });
    expect(plain.career).toBeUndefined();
    expect(effect(plain, 'members.satisfaction')).toBe(0);
  });

  it('after being let go a GM collects severance, gets calls, negotiates and moves to another co-op', () => {
    let s = run(newGame(setup(character())), 30);
    expect(s.outcome).toBeNull();
    s = fire(s);
    expect(s.outcome?.kind).toBe('fired');
    expect(s.career!.status).toBe('searching');
    expect(s.career!.severanceLeft).toBe(CAREER.severanceMonths.value);
    const before = s.career!.earnings;
    for (let i = 0; i < 36 && !s.career!.offers.length; i++) s = searchMonth(s).state;
    expect(s.career!.earnings).toBeGreaterThan(before);
    const o = s.career!.offers[0];
    expect(o).toBeDefined();
    // An ask within the board's room is accepted.
    const r = counterOffer(s, o.id, { base: Math.round(o.base * 1.02), bonusTarget: o.bonusTarget, severanceMonths: o.severanceMonths });
    expect(r.ok).toBe(true);
    expect(r.state.career!.offers.find((x) => x.id === o.id)!.base).toBe(Math.round(o.base * 1.02));
    const a = acceptOffer(r.state, o.id);
    expect(a.ok).toBe(true);
    const n = a.state;
    expect(n.outcome).toBeNull();
    expect(n.coop.name).toBe(o.coopName);
    expect(n.career!.status).toBe('employed');
    expect(n.career!.contract!.base).toBe(Math.round(o.base * 1.02));
    expect(n.career!.stints.map((x) => x.end ?? null)).toEqual(['fired', null]);
    expect(n.coop.facilities.length).toBeGreaterThan(0);
    expect(checkInvariants(run(n, 3))).toEqual([]);
  }, 120_000);

  it('asking far too much can lose an offer; a board only gives raises after a review', () => {
    let s = fire(run(newGame(setup(character())), 30));
    for (let i = 0; i < 36 && !s.career!.offers.length; i++) s = searchMonth(s).state;
    const o = s.career!.offers[0];
    let lost = false;
    let t = s;
    for (let round = 0; round < CAREER.maxRounds && !lost; round++) {
      t = counterOffer(t, o.id, { base: o.base * 3, bonusTarget: 0.4, severanceMonths: 24 }).state;
      const now = t.career!.offers.find((x) => x.id === o.id);
      if (!now) lost = true;
      else expect(packageValue(now)).toBeLessThan(packageValue({ base: o.base * 3, bonusTarget: 0.4, severanceMonths: 24 }));
    }
    const g = newGame(setup(character()));
    expect(raiseWindow(g).open).toBe(false);
    expect(askBoard(g, { ...g.career!.contract! }).ok).toBe(false);
  }, 120_000);

  it('a reviewed GM can ask the board, and resigning ends the job', () => {
    let s = newGame(setup(character()));
    for (let i = 0; i < 40 && !s.outcome && !raiseWindow(s).open; i++) s = run(s, 1);
    expect(raiseWindow(s).open).toBe(true);
    const k = s.career!.contract!;
    const r = askBoard(s, { base: k.base, bonusTarget: k.bonusTarget, severanceMonths: k.severanceMonths });
    expect(r.ok).toBe(true);
    expect(r.state.career!.contract!.endMonth).toBe(r.state.clock.monthIndex + CAREER.termYears * 12 - 1);
    expect(raiseWindow(r.state).open).toBe(false);
    const q = resign(r.state);
    expect(q.state.outcome?.kind).toBe('resigned');
    expect(q.state.career!.status).toBe('searching');
    expect(q.state.career!.severanceLeft ?? 0).toBe(0);
  }, 120_000);

  it('the job search is deterministic', () => {
    let a = fire(run(newGame(setup(character(), 6)), 26));
    let b = fire(run(newGame(setup(character(), 6)), 26));
    for (let i = 0; i < 12; i++) { a = searchMonth(a).state; b = searchMonth(b).state; }
    expect(JSON.stringify(a.career)).toBe(JSON.stringify(b.career));
  }, 120_000);
});
