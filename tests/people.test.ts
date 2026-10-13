import { describe, expect, it } from 'vitest';
import { advanceMonth, applyCommand, checkInvariants, DEFAULT_SETUP, effect, newGame, SCHEMA_VERSION, type GameState, type Leader } from '../src/engine/index';
import { TYPICAL_SITE } from '../src/data/facilities';
import { cloneState } from '../src/engine/sim/clone';
import { migrate } from '../src/engine/save/migrations';
import { balance } from '../src/engine/ledger/ledger';
import { generateLeader } from '../src/engine/people/leaders';
import { stream } from '../src/engine/core/rng';
import type { Role, TraitId } from '../src/data/people';

const run = (s: GameState, months: number) => {
  for (let i = 0; i < months && !s.outcome; i++) s = advanceMonth(s).state;
  return s;
};

function coop(year: number, seed = 1): GameState {
  let s = newGame({ ...DEFAULT_SETUP, startYear: year, startingMembers: 400, gameSeed: seed, mapSeed: seed, capitalPreset: 'well' });
  s = applyCommand(s, { type: 'buyFacility', offerId: s.coop.offers.find((o) => o.kind === 'elevator')!.id, financePct: 0.5 }, { boardApproved: true }).state;
  return s;
}

/** Put a leader with chosen skills and traits in a role. */
function withLeader(s: GameState, role: Role, skill: number, traits: TraitId[] = [], flags: Leader['flags'] = {}): GameState {
  const w = cloneState(s);
  const l = generateLeader(w, stream(1, 0, 'test', role.length), w.people.nextId++, { role, quality: skill, sd: 0, ageRange: [45, 45], revealWidth: 3, salaryFactor: 1 });
  for (const k of Object.keys(l.skills) as (keyof Leader['skills'])[]) l.skills[k] = skill;
  w.people.leaders = [...w.people.leaders.filter((x) => x.role !== role), { ...l, traits, flags }];
  return w;
}

describe('leaders and effects', () => {
  it('a small co-op needs no managers and their effects are neutral', () => {
    const s = run(coop(1990, 2), 2);
    expect(s.people.needed).not.toContain('GRAIN');
    expect(effect(s, 'grain.basis')).toBe(0);
    expect(effect(s, 'finance.spread')).toBe(0);
  });

  it('a needed role left vacant costs effectiveness; a strong hire helps', () => {
    const s = cloneState(coop(1990, 3));
    s.people.needed = ['CFO'];
    expect(effect(s, 'finance.spread')).toBeGreaterThan(0);
    const strong = withLeader(s, 'CFO', 17);
    expect(effect(strong, 'finance.spread')).toBeLessThan(0);
  });

  it('search, interview, references and hire; salaries run through the ledger', () => {
    let s = coop(1995, 4);
    let r = applyCommand(s, { type: 'startSearch', role: 'CFO', band: 'at' });
    expect(r.ok).toBe(true);
    expect(balance(r.state.ledger, '7635')).toBeGreaterThan(0);
    s = r.state;
    for (let i = 0; i < 5 && !s.people.candidates.length; i++) s = advanceMonth(s).state;
    expect(s.people.candidates).toHaveLength(3);
    const c = s.people.candidates[0];
    const before = c.leader.revealed.finance[1] - c.leader.revealed.finance[0];
    r = applyCommand(s, { type: 'interview', candidateId: c.id });
    expect(r.ok).toBe(true);
    const after = r.state.people.candidates[0].leader.revealed.finance;
    expect(after[1] - after[0]).toBeLessThanOrEqual(before);
    expect(after[0]).toBeLessThanOrEqual(c.leader.skills.finance);
    expect(after[1]).toBeGreaterThanOrEqual(c.leader.skills.finance);
    r = applyCommand(r.state, { type: 'checkReferences', candidateId: c.id });
    expect(r.state.people.candidates[0].referenceNote).toBeDefined();
    r = applyCommand(r.state, { type: 'hire', candidateId: c.id });
    expect(r.state.people.leaders.map((l) => l.role)).toEqual(['CFO']);
    expect(r.state.people.candidates).toHaveLength(0);
    const pay0 = balance(r.state.ledger, '7000', 'CORP');
    s = advanceMonth(r.state).state;
    expect(balance(s.ledger, '7000', 'CORP')).toBeGreaterThan(pay0);
    expect(s.people.notes.some((n) => n.role === 'CFO')).toBe(true);
    expect(checkInvariants(s)).toEqual([]);
  });

  it('a gunslinger leaves more grain unhedged than a disciplined hedger', () => {
    const base = cloneState(coop(2006, 5));
    base.people.needed = ['GRAIN'];
    let gun = withLeader(base, 'GRAIN', 12, ['gunslinger'], { hiddenPosition: true });
    let disc = withLeader(base, 'GRAIN', 12, ['disciplinedHedger']);
    let openGun = 0;
    let openDisc = 0;
    for (let i = 0; i < 18; i++) {
      gun = advanceMonth(gun).state;
      disc = advanceMonth(disc).state;
      const open = (st: GameState) => Object.values(st.coop.grain.pos).reduce((a, p) => a + Math.max(0, p.ownedBu - p.dpBu - p.shortBu), 0);
      openGun += open(gun);
      openDisc += open(disc);
    }
    expect(openGun).toBeGreaterThan(openDisc);
  });

  it('lean staffing raises turnover and lowers morale', () => {
    const s = coop(1998, 6);
    const lean = applyCommand(s, { type: 'setStaffing', facilityId: s.coop.facilities[0].id, level: 'lean', pay: 'below' }).state;
    const a = run(s, 14);
    const b = run(lean, 14);
    expect(b.people.workforce.GRAIN!.turnover).toBeGreaterThan(a.people.workforce.GRAIN!.turnover);
    expect(b.people.workforce.GRAIN!.morale).toBeLessThan(a.people.workforce.GRAIN!.morale);
  });

  it('leaders retire with notice, and an embezzler is eventually caught', () => {
    const w = withLeader(coop(1990, 7), 'CFO', 10, [], { embezzling: true });
    const old = withLeader(coop(1990, 8), 'GRAIN', 10);
    old.people.leaders[0].retireAge = 1990 - old.people.leaders[0].birthYear + 1;
    const r = run(old, 20);
    expect(r.inbox.some((i) => /plans to retire/.test(i.title))).toBe(true);
    expect(r.people.leaders.some((l) => l.role === 'GRAIN')).toBe(false);
    const e = run(w, 48);
    expect(e.inbox.some((i) => /Embezzlement uncovered/.test(i.title))).toBe(true);
    expect(checkInvariants(e)).toEqual([]);
  });

  it('a skilled leader\'s forecasts are closer to what happens', async () => {
    const { noiseFor } = await import('../src/engine/people/notes');
    const s = cloneState(coop(2000, 9));
    expect(noiseFor(withLeader(s, 'GRAIN', 18), 'GRAIN')).toBeLessThan(noiseFor(withLeader(s, 'GRAIN', 4), 'GRAIN'));
  });
});

describe('save migration v5 → v6', () => {
  it('adds the people state', () => {
    const v6 = run(coop(1985, 10), 1);
    const v5 = JSON.parse(JSON.stringify(v6));
    v5.schemaVersion = 5;
    delete v5.people;
    const m = migrate(v5);
    expect(m.schemaVersion).toBe(SCHEMA_VERSION);
    expect(m.people.leaders).toEqual([]);
    expect(checkInvariants(run(m, 12))).toEqual([]);
  });
});
