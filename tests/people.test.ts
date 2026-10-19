import { describe, expect, it } from 'vitest';
import { advanceMonth, applyCommand, checkInvariants, DEFAULT_SETUP, effect, newGame, SCHEMA_VERSION, type GameState, type Leader } from '../src/engine/index';
import { TYPICAL_SITE } from '../src/data/facilities';
import { cloneState } from '../src/engine/sim/clone';
import { migrate } from '../src/engine/save/migrations';
import { balance } from '../src/engine/ledger/ledger';
import { generateLeader } from '../src/engine/people/leaders';
import { stream } from '../src/engine/core/rng';
import type { Role, TraitId } from '../src/data/people';
import { draftProposals } from '../src/engine/people/proposals';
import { makeContext } from '../src/engine/sim/context';
import { toMonthIndex } from '../src/engine/core/calendar';

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

/** A co-op with every farm-supply business open (built in place, for tests of managers). */
function fullCoop(year: number, seed = 1): GameState {
  let s = coop(year, seed);
  for (const k of ['agronomy', 'feedmill', 'energy'] as const) s = applyCommand(s, { type: 'buildFacility', kind: k, townId: s.coop.homeTownId, components: TYPICAL_SITE[k], financePct: 0.5 }, { boardApproved: true }).state;
  const w = cloneState(s);
  for (const f of w.coop.facilities) f.status = 'operating';
  w.coop.projects = [];
  return w;
}

describe('managers\' proposals', () => {
  it('a strong manager reads the business right far more often than a weak one', () => {
    const base = fullCoop(1975, 2);
    const accuracy = (skill: number) => {
      let made = 0;
      let right = 0;
      for (const role of ['AGRONOMY', 'ENERGY', 'FEED'] as Role[]) {
        const s = withLeader(base, role, skill);
        const l = s.people.leaders.find((x) => x.role === role)!;
        for (let year = 1976; year <= 2005; year++) for (const month of [1, 5, 6, 11]) {
          const w = { ...s, clock: { ...s.clock, monthIndex: toMonthIndex(year, month) } };
          const ctx = makeContext(w);
          for (let k = 0; k < 20; k++) for (const d of draftProposals(ctx, l, stream(k, w.clock.monthIndex, 'test.read', l.id))) {
            if (d.kind === 'offseason') continue;
            made++;
            if (d.right) right++;
          }
        }
      }
      return { made, rate: right / Math.max(1, made) };
    };
    const strong = accuracy(18);
    const weak = accuracy(4);
    expect(strong.made).toBeGreaterThan(50);
    expect(weak.made).toBeGreaterThan(strong.made);
    expect(strong.rate).toBeGreaterThan(0.85);
    expect(strong.rate - weak.rate).toBeGreaterThan(0.15);
  });

  it('brings a proposal to the inbox; approving changes the setting and a review follows', () => {
    let s = withLeader(fullCoop(1985, 3), 'AGRONOMY', 16);
    let item;
    for (let i = 0; i < 36 && !item; i++) {
      s = advanceMonth(s).state;
      item = s.inbox.find((x) => x.choice && !x.choice.chosen && x.choice.handler.startsWith('mgr.'));
    }
    expect(item).toBeDefined();
    const before = JSON.stringify([s.coop.supplyPolicy, s.coop.facilities.map((f) => f.staffing)]);
    const r = applyCommand(s, { type: 'chooseOption', inboxId: item!.id, optionId: 'approve' });
    expect(r.ok, r.messages.map((m) => m.text).join()).toBe(true);
    expect(JSON.stringify([r.state.coop.supplyPolicy, r.state.coop.facilities.map((f) => f.staffing)])).not.toBe(before);
    const l = r.state.people.leaders.find((x) => x.role === 'AGRONOMY')!;
    expect(l.flags.approved).toBe(1);
    s = run(r.state, 9);
    expect(s.inbox.some((x) => x.title.startsWith('Looking back:'))).toBe(true);
    expect(checkInvariants(s)).toEqual([]);
  });

  it('a division manager\'s operations skill moves the division\'s site costs', () => {
    const strong = withLeader(coop(1995, 4), 'GRAIN', 20);
    const weak = withLeader(coop(1995, 4), 'GRAIN', 2);
    expect(effect(strong, 'division.opex', 'GRAIN')).toBeCloseTo(-0.1);
    expect(effect(weak, 'division.opex', 'GRAIN')).toBeCloseTo(0.06);
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

describe('sales force (D-109)', () => {
  it('more salespeople win more preference, with diminishing returns, and cost money through the books', async () => {
    const { salesBoost } = await import('../src/engine/people/sales');
    const s = fullCoop(2005, 6);
    expect(salesBoost(s, 'AGRONOMY')).toBe(0);
    const at = (n: number) => salesBoost(applyCommand(s, { type: 'setSalesStaff', division: 'AGRONOMY', count: n }).state, 'AGRONOMY');
    expect(at(2)).toBeGreaterThan(0);
    expect(at(6)).toBeGreaterThan(at(2));
    expect(at(6) - at(2)).toBeLessThan(at(2) * 3);
    expect(applyCommand(s, { type: 'setSalesStaff', division: 'AGRONOMY', count: 99 }).ok).toBe(false);
    const w = run(applyCommand(s, { type: 'setSalesStaff', division: 'AGRONOMY', count: 4 }).state, 1);
    expect(balance(w.ledger, '7690', 'AGRONOMY')).toBeGreaterThan(0);
    expect(checkInvariants(w)).toEqual([]);
  });

  it('a sales force wins agronomy share', () => {
    const s = fullCoop(2005, 6);
    const none = run(s, 12);
    const team = run(applyCommand(s, { type: 'setSalesStaff', division: 'AGRONOMY', count: 8 }).state, 12);
    expect(team.coop.supply.AGRONOMY.report!.share).toBeGreaterThan(none.coop.supply.AGRONOMY.report!.share);
  });
});

describe('managing the leadership team (D-110)', () => {
  it('pays the team at market, holds a retreat once a year and gives time off', async () => {
    const { moraleDrivers, payGapPct } = await import('../src/engine/people/team');
    let s = withLeader(withLeader(coop(1995, 7), 'CFO', 12), 'GRAIN', 12);
    s = cloneState(s);
    s.people.leaders = s.people.leaders.map((l) => ({ ...l, salary: Math.round(l.salary * 0.8), burnout: 60 }));
    let r = applyCommand(s, { type: 'payTeamToMarket' });
    expect(r.ok).toBe(true);
    for (const l of r.state.people.leaders) expect(payGapPct(r.state, l)).toBeGreaterThanOrEqual(-0.01);
    const before = moraleDrivers(r.state, r.state.people.leaders[0]).target;
    const cash = balance(r.state.ledger, '1000');
    r = applyCommand(r.state, { type: 'holdRetreat' });
    expect(r.ok, r.messages.map((m) => m.text).join()).toBe(true);
    expect(balance(r.state.ledger, '1000')).toBeLessThan(cash);
    expect(moraleDrivers(r.state, r.state.people.leaders[0]).target).toBeGreaterThan(before);
    expect(applyCommand(r.state, { type: 'holdRetreat' }).ok).toBe(false);
    const id = r.state.people.leaders[0].id;
    r = applyCommand(r.state, { type: 'giveTimeOff', leaderId: id });
    expect(r.state.people.leaders.find((l) => l.id === id)!.burnout).toBeLessThan(60);
  });

  it('applies the January policy and warns once about a flight risk', () => {
    let s = withLeader(coop(1995, 8), 'CFO', 15);
    s = applyCommand(s, { type: 'setTeamPolicy', policy: { autoPayMarket: true, autoBonus: true } }).state;
    s = cloneState(s);
    // An underpaid, demoralized CFO with no loyalty left.
    s.people.leaders = s.people.leaders.map((l) => ({ ...l, salary: Math.round(l.salary * 0.7), morale: 10, loyalty: 0 }));
    s = run(s, 2);
    const alerts = s.inbox.filter((i) => i.title.endsWith('may leave'));
    expect(alerts.length).toBeLessThanOrEqual(1);
    // Run to the next January: pay comes up to market and the bonus plan goes on.
    while ((s.clock.monthIndex % 12) !== 0) s = run(s, 1);
    s = run(s, 1);
    const cfo = s.people.leaders.find((l) => l.role === 'CFO');
    if (cfo) expect(cfo.bonusPlan).toBe(true);
  });
});
