import { describe, expect, it } from 'vitest';
import { advanceMonth, applyCommand, checkInvariants, DEFAULT_SETUP, newGame, type GameState } from '../src/engine/index';
import { TYPICAL_SITE } from '../src/data/facilities';
import { RANDOM_EVENTS, REGULATIONS } from '../src/data/events';
import { balance } from '../src/engine/ledger/ledger';
import { cloneState } from '../src/engine/sim/clone';
import { migrate } from '../src/engine/save/migrations';
import { SCHEMA_VERSION } from '../src/engine/types';
import { techFactor } from '../src/engine/world/tech';
import { isCompliant } from '../src/engine/world/regulation';
import { flagOn, openDecisions } from '../src/engine/world/events';
import { toMonthIndex } from '../src/engine/core/calendar';

const run = (s: GameState, months: number) => {
  for (let i = 0; i < months && !s.outcome; i++) s = advanceMonth(s).state;
  return s;
};
const runTo = (s: GameState, year: number, month: number) => run(s, toMonthIndex(year, month) - s.clock.monthIndex);

function coop(year: number, seed = 1): GameState {
  let s = newGame({ ...DEFAULT_SETUP, startYear: year, startingMembers: 400, gameSeed: seed, mapSeed: seed, capitalPreset: 'well', historyMode: 'strict' });
  s = applyCommand(s, { type: 'buyFacility', offerId: s.coop.offers.find((o) => o.kind === 'elevator')!.id, financePct: 0.5 }, { boardApproved: true }).state;
  return s;
}

/** Temporarily override a random event's probability. */
function withProb<T>(id: keyof typeof RANDOM_EVENTS, p: number, f: () => T): T {
  const def = RANDOM_EVENTS[id] as { baseMonthly: number };
  const old = def.baseMonthly;
  def.baseMonthly = p;
  try {
    return f();
  } finally {
    def.baseMonthly = old;
  }
}

describe('regulation', () => {
  it('a new rule asks for compliance, fines laggards, and compliance stops the fines', () => {
    let s = applyCommand(coop(2005, 2), { type: 'buildFacility', kind: 'energy', townId: 0, components: TYPICAL_SITE.energy, financePct: 0.5 }, { boardApproved: true }).state;
    s = runTo(s, 2006, 7);
    expect(s.regulation.active.ulsd).toBeDefined();
    expect(s.inbox.some((i) => i.title.includes('Ultra-low-sulfur'))).toBe(true);
    const rule = REGULATIONS.find((r) => r.id === 'ulsd')!;
    const site = s.coop.facilities.find((f) => f.kind === 'energy')!;
    expect(isCompliant(s, rule, site)).toBe(false);
    s = run(s, 8);
    const fined = balance(s.ledger, '7665');
    expect(fined).toBeGreaterThan(0);
    const r = applyCommand(s, { type: 'comply', ruleId: 'ulsd', facilityId: site.id });
    expect(r.ok, r.messages.map((m) => m.text).join()).toBe(true);
    expect(isCompliant(r.state, rule, r.state.coop.facilities.find((f) => f.id === site.id)!)).toBe(true);
    expect(checkInvariants(run(r.state, 3))).toEqual([]);
  });

  it('a game that starts after a rule took effect begins in compliance', () => {
    const s = run(coop(1995, 3), 1);
    const rule = REGULATIONS.find((r) => r.id === 'osha-grain')!;
    expect(s.regulation.active['osha-grain']).toBeDefined();
    for (const f of s.coop.facilities.filter((x) => x.kind === 'elevator')) expect(isCompliant(s, rule, f)).toBe(true);
  });
});

describe('technology', () => {
  it('adopting a site technology capitalizes it and its effect follows coverage', () => {
    let s = run(coop(2000, 4), 1);
    expect(techFactor(s, 'dustRisk')).toBe(1);
    const r = applyCommand(s, { type: 'adoptTech', techId: 'dust-control' }, { boardApproved: true });
    expect(r.ok, r.messages.map((m) => m.text).join()).toBe(true);
    s = run(r.state, 8);
    expect(s.tech.adopted['dust-control']).toBeDefined();
    expect(techFactor(s, 'dustRisk')).toBeLessThan(1);
    expect(s.coop.assets.some((a) => a.label.includes('Dust control'))).toBe(true);
    expect(checkInvariants(s)).toEqual([]);
  });

  it('refuses technology before it exists', () => {
    const r = applyCommand(coop(1975, 5), { type: 'adoptTech', techId: 'drones' }, { boardApproved: true });
    expect(r.ok).toBe(false);
  });
});

describe('decisions', () => {
  it('the farm crisis asks about credit; an answer sets the policy', () => {
    let s = runTo(coop(1983, 6), 1984, 6);
    const d = openDecisions(s).find((i) => i.choice!.handler === 'farm-crisis-1984')!;
    expect(d).toBeDefined();
    const r = applyCommand(s, { type: 'chooseOption', inboxId: d.id, optionId: 'restructure' });
    expect(r.ok).toBe(true);
    expect(flagOn(r.state, 'creditRestructure')).toBe(true);
    expect(openDecisions(r.state).some((i) => i.id === d.id)).toBe(false);
    s = run(r.state, 3);
    expect(checkInvariants(s)).toEqual([]);
  });

  it('an unanswered decision takes the default at its deadline', () => {
    let s = runTo(coop(2006, 7), 2006, 10);
    const d = openDecisions(s).find((i) => i.choice!.handler === 'ethanol-boom-2006')!;
    expect(d).toBeDefined();
    s = run(s, 3);
    expect(s.inbox.find((i) => i.id === d.id)!.choice!.chosen).toBe('decline');
  });

  it('investing in the ethanol plant books an equity-method stake', () => {
    let s = runTo(coop(2006, 8), 2006, 10);
    const d = openDecisions(s).find((i) => i.choice!.handler === 'ethanol-boom-2006')!;
    const r = applyCommand(s, { type: 'chooseOption', inboxId: d.id, optionId: 'invest' });
    expect(r.ok, r.messages.map((m) => m.text).join()).toBe(true);
    expect(r.state.jvs.some((j) => j.ethanol)).toBe(true);
    s = run(r.state, 12);
    expect(balance(s.ledger, '8210')).not.toBe(0);
    expect(checkInvariants(s)).toEqual([]);
  });
});

describe('random events', () => {
  it('a dust explosion damages the house, hurts workers and costs money', () => {
    const s0 = coop(1980, 9);
    const s = withProb('dustExplosion', 1, () => run(s0, 1));
    const f = s.coop.facilities.find((x) => x.kind === 'elevator')!;
    expect(s.eventLog.some((e) => e.id === 'dustExplosion')).toBe(true);
    expect(f.grain.downWeeks).toBeGreaterThan(0);
    expect(s.people.incidents.some((i) => i.serious)).toBe(true);
    expect(balance(s.ledger, '7695')).toBeGreaterThan(0);
    expect(checkInvariants(s)).toEqual([]);
  });

  it('a lawsuit asks us to settle or fight, and either way it resolves', () => {
    const s0 = coop(1990, 10);
    let s = withProb('lawsuit', 1, () => run(s0, 1));
    const d = openDecisions(s).find((i) => i.choice!.handler === 'lawsuit')!;
    expect(d).toBeDefined();
    const r = applyCommand(s, { type: 'chooseOption', inboxId: d.id, optionId: 'fight' });
    expect(r.ok).toBe(true);
    expect(r.state.inbox.some((i) => i.title === 'Lawsuit resolved')).toBe(true);
    s = run(cloneState(r.state), 1);
    expect(checkInvariants(s)).toEqual([]);
  });
});

describe('save migration v6 → v7 (events)', () => {
  it('adds technology, regulation, flags and the event log', () => {
    const v7 = run(coop(1990, 11), 1);
    const v6 = JSON.parse(JSON.stringify(v7));
    v6.schemaVersion = 6;
    for (const k of ['deals', 'jvs', 'integrationUntil', 'tech', 'regulation', 'flags', 'eventLog']) delete v6[k];
    const m = migrate(v6);
    expect(m.schemaVersion).toBe(SCHEMA_VERSION);
    expect(m.tech.adopted).toEqual({});
    expect(m.regulation.active).toEqual({});
    expect(checkInvariants(run(m, 6))).toEqual([]);
  });
});
