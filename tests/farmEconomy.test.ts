import { describe, expect, it } from 'vitest';
import { advanceMonth, checkInvariants, DEFAULT_SETUP, newGame, type GameState } from '../src/engine/index';
import { LOCAL_CROP } from '../src/data/economy';
import { LINES } from '../src/data/supply';
import { toMonthIndex } from '../src/engine/core/calendar';
import { grainCostIndex } from '../src/engine/grain/prices';
import { lineCost, linePrice, marketPrice } from '../src/engine/supply/prices';
import { pathFor, priceLevel } from '../src/engine/world/macro';
import {
  carryFactor, farmEconomyView, farmIncomeIndex, inputDemand, localCrop, nationalIncomeIndex, plantingShift, regionalCropDev, soyCornRatio, townYieldFactor,
} from '../src/engine/world/farmEconomy';

const game = (year: number, seed = 1) => newGame({ ...DEFAULT_SETUP, startYear: year, startingMembers: 300, gameSeed: seed, mapSeed: seed });
const at = (s: GameState, mi: number): GameState => ({ ...s, clock: { ...s.clock, monthIndex: mi } });

describe('farm economy (D-132)', () => {
  it('local weather: a territory shock, county shocks, and now and then a county disaster, repeatable from the seed', () => {
    const s = game(1980, 2);
    const years = Array.from({ length: 200 }, (_, i) => 1800 + i);
    const crops = years.map((y) => localCrop(s, y));
    const terr = crops.map((c) => c.territory - 1);
    const mean = terr.reduce((a, b) => a + b, 0) / terr.length;
    const sd = Math.sqrt(terr.reduce((a, b) => a + (b - mean) ** 2, 0) / terr.length);
    expect(Math.abs(mean)).toBeLessThan(0.02);
    expect(sd).toBeGreaterThan(LOCAL_CROP.territorySd.value * 0.7);
    expect(sd).toBeLessThan(LOCAL_CROP.territorySd.value * 1.3);
    const disasters = crops.filter((c) => c.disaster).length / crops.length;
    expect(disasters).toBeGreaterThan(0.05);
    expect(disasters).toBeLessThan(0.2);
    // Same seed, same weather; a disaster county yields less than the territory.
    expect(localCrop(game(1980, 2), 1850)).toEqual(localCrop(s, 1850));
    const hit = crops.find((c) => c.disaster)!;
    const town = s.world.towns.find((t) => t.countyId === hit.disaster!.countyId);
    if (town) expect(townYieldFactor(s, hit.year, town.id)).toBeLessThan(hit.territory);
  });

  it('planting leans to soybeans when soybeans are dear against corn, and to corn when cheap', () => {
    const s = game(1975);
    const path = pathFor(s);
    for (let y = 1980; y <= 2020; y++) {
      const { now, norm } = soyCornRatio(path, toMonthIndex(y, 1));
      const shift = plantingShift(path, y);
      if (now > norm * 1.03) expect(shift, String(y)).toBeLessThan(0);
      if (now < norm * 0.97) expect(shift, String(y)).toBeGreaterThan(0);
    }
  });

  it('farmers buy less P&K and crop protection when income is poor, and herds follow profitability', () => {
    const s = game(1975);
    let lean = 0;
    let flush = 0;
    for (let y = 1978; y <= 2020; y++) {
      const mi = toMonthIndex(y, 6);
      const st = at(s, mi);
      const d = inputDemand(st, mi);
      const income = farmIncomeIndex(st, mi);
      if (income < 0.9) { expect(d.pk, String(y)).toBeLessThan(1); lean++; }
      if (income > 1.1) { expect(d.pk, String(y)).toBeGreaterThan(1); flush++; }
      expect(d.herds.hogs).toBeGreaterThanOrEqual(0.8);
      expect(d.herds.hogs).toBeLessThanOrEqual(1.2);
    }
    expect(lean).toBeGreaterThan(2);
    expect(flush).toBeGreaterThan(2);
    // The early-1980s squeeze shows in national income.
    expect(nationalIncomeIndex(pathFor(s), toMonthIndex(1982, 6))).toBeLessThan(0.7);
  });

  it('posted prices lag wholesale: a spike squeezes the margin, a drop widens it', () => {
    const s = game(1975);
    const path = pathFor(s);
    const id = 'FUEL_DIESEL' as const;
    const ratioAt = (mi: number) => {
      const pl = priceLevel(path, mi);
      const idx = (grainCostIndex(path, mi) + pl) / 2;
      const cost = lineCost(s, path, LINES[id], mi, idx, pl);
      return linePrice(at(s, mi), path, id, mi, idx, pl, 'market').market / marketPrice(LINES[id], cost, idx, pl);
    };
    // The sharpest real rise and fall in diesel over two months in this game's history.
    const real = (mi: number) => lineCost(s, path, LINES[id], mi, (grainCostIndex(path, mi) + priceLevel(path, mi)) / 2, priceLevel(path, mi)) / priceLevel(path, mi);
    const months = Array.from({ length: 12 * 40 }, (_, i) => toMonthIndex(1976, 1) + i);
    const change = (mi: number) => real(mi) / real(mi - 1) - 1;
    const rise = [...months].sort((a, b) => change(b) - change(a))[0];
    const fall = [...months].sort((a, b) => change(a) - change(b))[0];
    expect(ratioAt(rise)).toBeLessThan(1);
    expect(ratioAt(fall)).toBeGreaterThan(1);
  });

  it('big crops pay storage and short crops do not', () => {
    const s = game(1975);
    const path = pathFor(s);
    const years = Array.from({ length: 40 }, (_, i) => 1980 + i);
    const big = years.filter((y) => regionalCropDev(path, 'corn', y) > 0.1);
    const short = years.filter((y) => regionalCropDev(path, 'corn', y) < -0.1);
    expect(big.length).toBeGreaterThan(0);
    expect(short.length).toBeGreaterThan(0);
    for (const y of big) expect(carryFactor(path, 'corn', toMonthIndex(y, 11))).toBeGreaterThan(1);
    for (const y of short) expect(carryFactor(path, 'corn', toMonthIndex(y, 11))).toBeLessThan(1);
  });

  it('the year brings planting, crop-condition and harvest reports, the panel has history, and the books balance', () => {
    let s = game(1990, 3);
    for (let i = 0; i < 12; i++) s = advanceMonth(s).state;
    const titles = s.inbox.map((x) => x.title);
    expect(titles).toContain('Planting outlook 1990');
    expect(titles).toContain('Crop conditions, July 1990');
    expect(titles).toContain('Harvest report 1990');
    const v = farmEconomyView(s);
    expect(v.years.length).toBeGreaterThan(0);
    expect(Number.isFinite(v.localCorn)).toBe(true);
    expect(checkInvariants(s)).toEqual([]);
  });
});
