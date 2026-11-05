import { describe, expect, it } from 'vitest';
import { advanceMonth, checkInvariants, DEFAULT_SETUP, newGame, type GameState } from '../src/engine/index';
import { REGION_IDS, REGIONS } from '../src/data/regions/eccb';
import { getBrand } from '../src/data/brands';
import { regionalYield } from '../src/engine/world/regional';
import { destinationBasis } from '../src/engine/grain/prices';

const setup = (regionId: string, startYear = 1980, seed = 2) => ({ ...DEFAULT_SETUP, regionId, startYear, startingMembers: 400, gameSeed: seed, mapSeed: seed, regionalAffiliations: [] });
const run = (s: GameState, months: number) => {
  for (let i = 0; i < months && !s.outcome; i++) s = advanceMonth(s).state;
  return s;
};

describe('regions (D-140)', () => {
  it('every region starts a game with its own railroads and keeps its books', () => {
    for (const id of REGION_IDS) {
      const s = newGame(setup(id));
      expect(s.world.regionId).toBe(id);
      for (const r of s.world.rail) {
        const b = getBrand(r.ownerBrandId);
        if (b) expect(b.regions ?? [id]).toContain(id);
      }
      expect(checkInvariants(run(s, 3))).toEqual([]);
    }
  }, 120_000);

  it('regional yields and basis follow the region', () => {
    const il = newGame(setup('eccb'));
    const nd = newGame(setup('rrv'));
    const mi = il.clock.monthIndex;
    expect(regionalYield(nd, 'corn', mi)).toBeLessThan(regionalYield(il, 'corn', mi) * 0.8);
    expect(regionalYield(il, 'corn', mi)).toBeGreaterThan(0);
    expect(destinationBasis(nd, 'processor', 'corn', mi, 1)).toBeLessThan(destinationBasis(il, 'processor', 'corn', mi, 1));
    expect(REGIONS.glk.yieldFactor!.wheat[1].value).toBeGreaterThan(1);
  });

  it('regional news reaches only co-ops in that region', () => {
    const flood = (s: GameState) => s.inbox.some((m) => /Red River Crests/.test(m.title));
    expect(flood(run(newGame(setup('rrv', 1997)), 5))).toBe(true);
    expect(flood(run(newGame(setup('eccb', 1997)), 5))).toBe(false);
  }, 60_000);
});
