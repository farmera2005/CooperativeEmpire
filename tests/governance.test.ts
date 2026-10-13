import { describe, expect, it } from 'vitest';
import { advanceMonth, applyCommand, checkInvariants, DEFAULT_SETUP, forecastItem, newGame, SCHEMA_VERSION, type GameState } from '../src/engine/index';
import { TYPICAL_SITE } from '../src/data/facilities';
import { cloneState } from '../src/engine/sim/clone';
import { migrate } from '../src/engine/save/migrations';
import { toMonthIndex } from '../src/engine/core/calendar';
import { stepMemberDemocracy } from '../src/engine/governance/elections';
import { makeContext } from '../src/engine/sim/context';

const run = (s: GameState, months: number) => {
  for (let i = 0; i < months && !s.outcome; i++) s = advanceMonth(s).state;
  return s;
};
const runTo = (s: GameState, year: number, month: number) => run(s, toMonthIndex(year, month) - s.clock.monthIndex);

function coop(year: number, seed = 1): GameState {
  let s = newGame({ ...DEFAULT_SETUP, startYear: year, startingMembers: 400, gameSeed: seed, mapSeed: seed, capitalPreset: 'well' });
  s = applyCommand(s, { type: 'buyFacility', offerId: s.coop.offers.find((o) => o.kind === 'elevator')!.id, financePct: 0.5 }, { boardApproved: true }).state;
  return s;
}

/** A board that will vote however we need it to. */
function stackBoard(s: GameState, friendly: boolean): GameState {
  const w = cloneState(s);
  w.governance.boardConfidence = friendly ? 100 : 0;
  w.governance.directors = w.governance.directors.map((d) => ({ ...d, loyaltyToGM: friendly ? 100 : 0, stance: friendly ? 1 : -1, literacy: 20, petIssues: d.petIssues.filter((p) => p.kind === 'hometown') }));
  return w;
}

describe('board proposals and votes', () => {
  it('sends a large capital project to the board, which votes it next month', () => {
    const s = coop(1990, 2);
    const r = applyCommand(s, { type: 'buildFacility', kind: 'agronomy', townId: s.coop.homeTownId, components: TYPICAL_SITE.agronomy, financePct: 0.5 });
    expect(r.ok).toBe(true);
    expect(r.state.governance.agenda).toHaveLength(1);
    expect(r.state.coop.projects).toHaveLength(0);
    const f = forecastItem(r.state, r.state.governance.agenda[0]);
    expect(f.passProb).toBeGreaterThanOrEqual(0);
    expect(f.passProb).toBeLessThanOrEqual(1);
    const next = advanceMonth(stackBoard(r.state, true)).state;
    expect(next.governance.agenda).toHaveLength(0);
    const v = next.governance.votes.at(-1)!;
    expect(v.passed).toBe(true);
    expect(next.coop.projects).toHaveLength(1);
    expect(next.inbox.some((i) => i.title.startsWith('Board meeting'))).toBe(true);
    expect(checkInvariants(next)).toEqual([]);
  });

  it('a hostile board rejects, confidence falls, and the item cannot come straight back', () => {
    const s = coop(1990, 3);
    const cmd = { type: 'buildFacility' as const, kind: 'agronomy' as const, townId: s.coop.homeTownId, components: TYPICAL_SITE.agronomy, financePct: 0.5 };
    const queued = applyCommand(s, cmd).state;
    const hostile = stackBoard(queued, false);
    const next = advanceMonth(hostile).state;
    expect(next.governance.votes.at(-1)!.passed).toBe(false);
    expect(next.coop.projects).toHaveLength(0);
    const again = applyCommand(next, cmd);
    expect(again.ok).toBe(false);
    expect(again.messages[0].text).toMatch(/won't reconsider/);
  });

  it('lobbying spends political capital and raises a director\'s forecast', () => {
    const s = coop(1990, 4);
    const q = applyCommand(s, { type: 'closeFacility', facilityId: s.coop.facilities[0].id }).state;
    const item = q.governance.agenda[0];
    const d = q.governance.directors[0];
    const before = forecastItem(q, item).directors.find((x) => x.memberId === d.memberId)!.pYes;
    const lobbied = applyCommand(q, { type: 'lobbyDirector', itemId: item.id, directorId: d.memberId }).state;
    expect(lobbied.governance.politicalCapital).toBe(q.governance.politicalCapital - 2);
    const after = forecastItem(lobbied, lobbied.governance.agenda[0]).directors.find((x) => x.memberId === d.memberId)!.pYes;
    expect(after).toBeGreaterThan(before);
    const tabled = applyCommand(lobbied, { type: 'tableItem', itemId: item.id }).state;
    expect(tabled.governance.agenda[0].tabled).toBe(1);
    const withdrawn = applyCommand(tabled, { type: 'withdrawItem', itemId: item.id }).state;
    expect(withdrawn.governance.agenda).toHaveLength(0);
  });

  it('a revised risk-limit proposal replaces the pending one; lowering limits needs no vote', () => {
    const s = coop(1990, 11);
    const lim = s.coop.grainPolicy.positionLimit;
    let r = applyCommand(s, { type: 'setGrainPolicy', policy: { hedgeRatio: 1, positionLimit: { ...lim, corn: lim.corn + 25_000 } } });
    expect(r.state.governance.agenda).toHaveLength(1);
    r = applyCommand(r.state, { type: 'setGrainPolicy', policy: { hedgeRatio: 1, positionLimit: { ...lim, corn: lim.corn + 50_000 } } });
    expect(r.state.governance.agenda).toHaveLength(1);
    expect(r.state.governance.agenda[0].title).toBe('Raise open-position limits');
    expect((r.state.governance.agenda[0].command as { policy: { positionLimit: { corn: number } } }).policy.positionLimit.corn).toBe(lim.corn + 50_000);
    const lower = applyCommand(s, { type: 'setGrainPolicy', policy: { positionLimit: { ...lim, corn: lim.corn - 5_000 } } });
    expect(lower.state.governance.agenda).toHaveLength(0);
    expect(lower.state.coop.grainPolicy.positionLimit.corn).toBe(lim.corn - 5_000);
    const passed = advanceMonth(stackBoard(r.state, true)).state;
    expect(passed.coop.grainPolicy.positionLimit.corn).toBe(lim.corn + 50_000);
  });

  it('votes the budget in July and the patronage plan in November', () => {
    let s = runTo(coop(1995, 5), 1996, 7);
    expect(s.governance.votes.some((v) => v.type === 'budget')).toBe(true);
    s = runTo(s, 1996, 11);
    expect(s.governance.votes.some((v) => v.type === 'patronage' && v.monthIndex === s.clock.monthIndex)).toBe(true);
    expect(checkInvariants(s)).toEqual([]);
  });
});

describe('the general manager', () => {
  it('is reviewed each November and can be fired from a performance plan', () => {
    let s = runTo(coop(1995, 6), 1996, 11);
    const r = s.governance.reviews.at(-1)!;
    expect(r.fy).toBe(1996);
    expect(Object.keys(r.components)).toContain('budget');
    const w = cloneState(s);
    w.governance.pip = true;
    w.governance.boardConfidence = 5;
    s = advanceMonth(w).state;
    expect(s.outcome?.kind).toBe('fired');
    expect(() => advanceMonth(s)).toThrow();
  });
});

describe('member democracy', () => {
  it('holds staggered elections at the annual meeting and keeps the board at its bylaw size', () => {
    const s = runTo(coop(1980, 7), 1983, 1);
    expect(s.governance.elections.length).toBeGreaterThanOrEqual(2);
    const seats = s.governance.elections.flatMap((e) => e.seats);
    expect(seats.length).toBeGreaterThan(0);
    expect(s.governance.directors).toHaveLength(s.governance.bylaws.boardSize);
    for (const d of s.governance.directors) expect(d.termEndYear).toBeGreaterThanOrEqual(1983);
    expect(s.inbox.some((i) => i.title === 'Annual meeting')).toBe(true);
  });

  it('a bylaw amendment goes from the board to a member vote', () => {
    let s = coop(1990, 8);
    s = applyCommand(s, { type: 'proposeBylaw', change: { field: 'termLimit', value: 3 } }).state;
    s = advanceMonth(stackBoard(s, true)).state;
    expect(s.governance.memberVotes).toHaveLength(1);
    s = run(s, 2);
    const mv = s.governance.memberVotes[0];
    expect(mv.result).toBeDefined();
    if (mv.result!.passed) expect(s.governance.bylaws.termLimit).toBe(3);
    else expect(s.governance.bylaws.termLimit).toBeNull();
  });

  it('angry patrons petition to recall the chair', () => {
    const w = cloneState(coop(1990, 9));
    for (const m of w.members.list) if (m.kind === 'member') {
      m.satisfaction = 5;
      m.share = { GRAIN_CORN: 0.9 };
    }
    w.clock.monthIndex += 1;
    stepMemberDemocracy(makeContext(w));
    const s = w;
    expect(s.governance.memberVotes.some((v) => v.kind === 'recall')).toBe(true);
    expect(s.inbox.some((i) => /petition/.test(i.title))).toBe(true);
  });
});

describe('save migration v4 → v5', () => {
  it('adds board activity and bylaw fields', () => {
    const v5 = run(coop(1985, 10), 1);
    const v4 = JSON.parse(JSON.stringify(v5));
    v4.schemaVersion = 4;
    for (const k of ['politicalCapital', 'agenda', 'nextItemId', 'votes', 'demands', 'reviews', 'pip', 'endorse', 'elections', 'memberVotes', 'lastPetitionMonth']) delete v4.governance[k];
    for (const k of ['quorumPct', 'capitalApproval', 'memberPetitionPct', 'termLimit']) delete v4.governance.bylaws[k];
    for (const h of v4.history) delete h.boardConfidence;
    const m = migrate(v4);
    expect(m.schemaVersion).toBe(SCHEMA_VERSION);
    expect(m.governance.agenda).toEqual([]);
    expect(m.governance.bylaws.capitalApproval).toBeGreaterThan(0);
    expect(checkInvariants(run(m, 12))).toEqual([]);
  });
});
