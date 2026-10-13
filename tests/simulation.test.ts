import { describe, expect, it } from 'vitest';
import { advanceMonth, DEFAULT_SETUP, hashValue, newGame, parseSave, serializeSave, toSaveFile, checkInvariants, type GameState } from '../src/engine/index';
import { cloneState } from '../src/engine/sim/clone';

const run = (s: GameState, months: number) => {
  for (let i = 0; i < months; i++) s = advanceMonth(s).state;
  return s;
};

describe('simulation', () => {
  it('is deterministic for the same seed and commands', () => {
    const setup = { ...DEFAULT_SETUP, startingMembers: 150, gameSeed: 99, mapSeed: 5 };
    const a = run(newGame(setup), 30);
    const b = run(newGame(setup), 30);
    expect(hashValue(a)).toBe(hashValue(b));
  });

  it('does not mutate its input', () => {
    const s = newGame({ ...DEFAULT_SETUP, startingMembers: 100 });
    const h = hashValue(s);
    advanceMonth(s);
    expect(hashValue(s)).toBe(h);
  });

  for (const startYear of [1970, 1985, 2010]) {
    it(`runs ${startYear} for 12 years with ledger invariants every month`, () => {
      // A co-op that owns nothing loses its overhead every year; well capitalized, it lasts.
      let s = newGame({ ...DEFAULT_SETUP, startYear, startingMembers: 300, gameSeed: startYear, mapSeed: startYear, historyMode: 'drift', capitalPreset: 'well' });
      for (let i = 0; i < 144; i++) {
        s = advanceMonth(s).state; // throws InvariantError on failure
      }
      expect(s.outcome).toBeNull();
      expect(checkInvariants(s)).toEqual([]);
      expect(s.history.length).toBe(145);
    });
  }

  it('consolidates farms over decades toward the structural target', () => {
    let s = newGame({ ...DEFAULT_SETUP, startingMembers: 800, gameSeed: 3, capitalPreset: 'custom', customCapital: 5_000_000_00 });
    const farms0 = s.history[0].activeFarms;
    s = run(s, 12 * 50);
    const last = s.history[s.history.length - 1];
    const decline = 1 - last.activeFarms / farms0;
    expect(decline).toBeGreaterThan(0.35);
    expect(decline).toBeLessThan(0.75);
    expect(last.totalAcres / last.activeFarms).toBeGreaterThan(450);
  });

  it('round-trips through a save file', () => {
    const s = run(newGame({ ...DEFAULT_SETUP, startingMembers: 120 }), 14);
    const text = serializeSave(toSaveFile(s, 'test', '2026-01-01T00:00:00Z'));
    const back = parseSave(text);
    expect(hashValue(back.state)).toBe(hashValue(s));
    expect(hashValue(advanceMonth(back.state).state)).toBe(hashValue(advanceMonth(s).state));
  });

  it('rejects bad save files', () => {
    expect(() => parseSave('nope')).toThrow();
    expect(() => parseSave(JSON.stringify({ format: 'other' }))).toThrow();
    const s = cloneState(newGame({ ...DEFAULT_SETUP, startingMembers: 60 }));
    s.schemaVersion = 999;
    expect(() => parseSave(serializeSave(toSaveFile(s, 'x', 'y')))).toThrow();
  });

  it('advances a 5,000-member co-op well under a second per month', () => {
    let s = newGame({ ...DEFAULT_SETUP, startingMembers: 5000, gameSeed: 1 });
    s = advanceMonth(s).state;
    const t0 = performance.now();
    for (let i = 0; i < 12; i++) s = advanceMonth(s).state;
    const per = (performance.now() - t0) / 12;
    expect(per).toBeLessThan(1000);
  });
});
