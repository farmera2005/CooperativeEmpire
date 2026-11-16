import { describe, expect, it } from 'vitest';
import { advanceMonth, applyCommand, checkInvariants, DEFAULT_SETUP, newGame, type GameState } from '../src/engine/index';
import { balance } from '../src/engine/ledger/ledger';

function game(): GameState {
  let s = newGame({ ...DEFAULT_SETUP, startYear: 1990, startingMembers: 300, gameSeed: 3, mapSeed: 3, capitalPreset: 'well' });
  s = applyCommand(s, { type: 'buyFacility', offerId: s.coop.offers.find((o) => o.kind === 'elevator')!.id, financePct: 0.5 }, { boardApproved: true }).state;
  return s;
}

describe('renaming the co-op (D-146)', () => {
  it('a new name goes to the board, not straight onto the sign', () => {
    const s = game();
    const r = applyCommand(s, { type: 'proposeNameChange', name: 'Prairie Gold Cooperative' });
    expect(r.ok).toBe(true);
    expect(r.state.coop.name).toBe(s.coop.name);
    const item = r.state.governance.agenda.find((i) => i.type === 'nameChange');
    expect(item?.newName).toBe('Prairie Gold Cooperative');
    // A revised name replaces the pending one.
    const r2 = applyCommand(r.state, { type: 'proposeNameChange', name: 'Prairie Gold Co-op' });
    expect(r2.state.governance.agenda.filter((i) => i.type === 'nameChange').map((i) => i.newName)).toEqual(['Prairie Gold Co-op']);
  });

  it('refuses names that are empty, unchanged or taken', () => {
    const s = game();
    expect(applyCommand(s, { type: 'proposeNameChange', name: '  ' }).ok).toBe(false);
    expect(applyCommand(s, { type: 'proposeNameChange', name: s.coop.name.toUpperCase() }).ok).toBe(false);
    const rival = s.competitors.find((c) => c.status === 'active')!;
    expect(applyCommand(s, { type: 'proposeNameChange', name: rival.name }).ok).toBe(false);
  });

  it('when the board and then the members adopt it, the co-op is renamed and pays for it', () => {
    let s = game();
    const old = s.coop.name;
    for (const m of s.members.list) if (m.status === 'active') m.satisfaction = 95;
    s.governance.boardConfidence = 95;
    s = applyCommand(s, { type: 'proposeNameChange', name: 'Prairie Gold Cooperative' }).state;
    for (let i = 0; i < 8 && s.coop.name === old; i++) {
      for (const m of s.members.list) if (m.status === 'active') m.satisfaction = 95;
      s = advanceMonth(s).state;
    }
    expect(s.coop.name).toBe('Prairie Gold Cooperative');
    expect(s.setup.coopName).toBe('Prairie Gold Cooperative');
    expect(s.coop.formerNames?.map((f) => f.name)).toEqual([old]);
    expect(s.governance.memberVotes.find((v) => v.kind === 'name')?.result?.passed).toBe(true);
    expect(balance(s.ledger, '7600')).toBeGreaterThan(0);
    expect(checkInvariants(s)).toEqual([]);
    // Members want years between name changes.
    const again = applyCommand(s, { type: 'proposeNameChange', name: 'Golden Prairie Cooperative' });
    expect(again.ok).toBe(false);
  });
});
