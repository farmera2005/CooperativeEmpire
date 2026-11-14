import { describe, expect, it } from 'vitest';
import { advanceMonth, applyCommand, checkInvariants, DEFAULT_SETUP, incomeStatement, newGame, type GameState } from '../src/engine/index';
import { balance } from '../src/engine/ledger/ledger';
import { cloneState } from '../src/engine/sim/clone';

function game(debugMode: boolean): GameState {
  let s = newGame({ ...DEFAULT_SETUP, startYear: 1990, startingMembers: 300, gameSeed: 3, mapSeed: 3, capitalPreset: 'well', debugMode });
  s = applyCommand(s, { type: 'buyFacility', offerId: s.coop.offers.find((o) => o.kind === 'elevator')!.id, financePct: 0.5 }, { boardApproved: true }).state;
  return s;
}

describe('debug mode', () => {
  it('refuses debug tools in a normal game', () => {
    const r = applyCommand(game(false), { type: 'debug', action: { kind: 'addCash', amount: 100_000_00 } });
    expect(r.ok).toBe(false);
  });

  it('a game under way can enter debug mode, for good (D-145)', () => {
    let s = game(false);
    for (let i = 0; i < 3; i++) s = advanceMonth(s).state;
    const r = applyCommand(s, { type: 'enterDebugMode' });
    expect(r.ok).toBe(true);
    expect(r.state.setup.debugMode).toBe(true);
    expect(r.state.setup.debugSinceMonth).toBe(s.clock.monthIndex);
    expect(r.state.inbox.some((m) => m.title === 'Debug mode entered')).toBe(true);
    expect(applyCommand(r.state, { type: 'debug', action: { kind: 'addCash', amount: 100_000_00 } }).ok).toBe(true);
    expect(applyCommand(r.state, { type: 'enterDebugMode' }).ok).toBe(false);
    expect(s.setup.debugMode).toBeFalsy();
    expect(checkInvariants(advanceMonth(r.state).state)).toEqual([]);
  });

  it('adds cash through the books, against debug equity, without touching income', () => {
    const s = game(true);
    const cash = balance(s.ledger, '1000');
    const r = applyCommand(s, { type: 'debug', action: { kind: 'addCash', amount: 1_000_000_00 } });
    expect(r.ok, r.messages.map((m) => m.text).join()).toBe(true);
    expect(balance(r.state.ledger, '1000') - cash).toBe(1_000_000_00);
    expect(balance(r.state.ledger, '3950')).toBe(-1_000_000_00);
    const mi = r.state.clock.monthIndex;
    expect(incomeStatement(r.state.ledger, mi, mi).netSavings).toBe(incomeStatement(s.ledger, mi, mi).netSavings);
    expect(checkInvariants(advanceMonth(r.state).state)).toEqual([]);
  });

  it('with no game over on, a firing is cancelled and play continues', () => {
    let s = applyCommand(game(true), { type: 'debug', action: { kind: 'setNoGameOver', on: true } }).state;
    s = cloneState(s);
    // A GM on a performance plan with no confidence left is fired at the next meeting.
    s.governance = { ...s.governance, boardConfidence: 0, pip: true };
    s.coop.foundedMonth -= 24;
    s = advanceMonth(s).state;
    expect(s.outcome).toBeNull();
    expect(s.inbox.some((i) => i.title.startsWith('Debug: game over cancelled'))).toBe(true);
    expect(s.governance.boardConfidence).toBeGreaterThanOrEqual(50);
  });

  it('places a leader with the chosen skill and sets confidence and satisfaction', () => {
    let s = game(true);
    s = applyCommand(s, { type: 'debug', action: { kind: 'hireLeader', role: 'CFO', skill: 19 } }).state;
    const cfo = s.people.leaders.find((l) => l.role === 'CFO')!;
    expect(cfo.skills.finance).toBe(19);
    expect(cfo.revealed.finance).toEqual([19, 19]);
    s = applyCommand(s, { type: 'debug', action: { kind: 'setConfidence', value: 90 } }).state;
    s = applyCommand(s, { type: 'debug', action: { kind: 'setSatisfaction', value: 75 } }).state;
    expect(s.governance.boardConfidence).toBe(90);
    expect(s.members.list.filter((m) => m.status === 'active').every((m) => m.satisfaction === 75)).toBe(true);
  });
});
