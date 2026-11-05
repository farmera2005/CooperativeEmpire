import { describe, expect, it } from 'vitest';
import { advanceMonth, checkInvariants, DEFAULT_SETUP, newGame, type GameState } from '../src/engine/index';

const setup = (size?: 'small' | 'standard' | 'large' | 'huge' | 'vast', seed = 4) => ({ ...DEFAULT_SETUP, startYear: 1975, startingMembers: 400, gameSeed: seed, mapSeed: seed, ...(size ? { territorySize: size } : {}) });
const run = (s: GameState, months: number) => {
  for (let i = 0; i < months && !s.outcome; i++) s = advanceMonth(s).state;
  return s;
};

describe('territory size (D-138)', () => {
  it('the standard size is the map as it was', () => {
    expect(JSON.stringify(newGame(setup('standard')).world)).toBe(JSON.stringify(newGame(setup()).world));
  });

  it('larger maps hold more counties, towns, farms and main lines; founders farm near home', () => {
    const std = newGame(setup('standard'));
    const big = newGame(setup('huge'));
    expect(big.world.counties.length).toBeGreaterThanOrEqual(std.world.counties.length * 3);
    expect(big.world.towns.length).toBeGreaterThanOrEqual(std.world.towns.length * 3);
    expect(big.members.list.length).toBeGreaterThanOrEqual(std.members.list.length * 3);
    expect(big.world.rail.filter((r) => r.kind === 'mainline').length).toBeGreaterThanOrEqual(2);
    const home = big.world.towns[big.coop.homeTownId];
    const avg = (kind: string) => {
      const ms = big.members.list.filter((m) => m.kind === kind);
      return ms.reduce((a, m) => a + Math.hypot(big.world.towns[m.townId].x - home.x, big.world.towns[m.townId].y - home.y), 0) / ms.length;
    };
    expect(avg('member')).toBeLessThan(avg('nonmember'));
  });

  it('a very large world runs and keeps its books', () => {
    expect(checkInvariants(run(newGame(setup('huge')), 6))).toEqual([]);
  }, 60_000);
});

describe('neighboring co-ops (D-139)', () => {
  it('outer counties of a larger map start with county-wide co-ops', () => {
    const s = newGame(setup('huge'));
    const county = s.competitors.filter((c) => c.kind === 'coop' && / County Cooperative$/.test(c.name));
    expect(county.length).toBeGreaterThan(0);
    expect(county.some((c) => c.sites.length >= 2)).toBe(true);
    const home = s.world.towns[s.coop.homeTownId].countyId;
    for (const c of county) for (const site of c.sites) expect(s.world.towns[site.townId].countyId).not.toBe(home);
  });

  it('co-ops consolidate over the decades', () => {
    const s0 = newGame(setup('huge'));
    const count = (s: GameState) => s.competitors.filter((c) => c.status === 'active' && c.kind === 'coop').length;
    const s = run(s0, 12 * 20);
    expect(count(s)).toBeLessThan(count(s0));
    expect(Math.max(...s.competitors.filter((c) => c.status === 'active' && c.kind === 'coop').map((c) => c.sites.length))).toBeGreaterThan(Math.max(...s0.competitors.filter((c) => c.kind === 'coop').map((c) => c.sites.length)));
  }, 120_000);
});
