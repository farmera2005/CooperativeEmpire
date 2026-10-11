import { describe, expect, it } from 'vitest';
import { MARKET_SERIES, SERIES_IDS, DATA_END_YEAR } from '../../data/markets';
import { HISTORY } from '../../data/history';
import { ECCB } from '../../data/regions/eccb';
import { makeDriftPlan, eventMonth } from './drift';
import { annualAverage, getMarketPath, marketValue } from './marketPath';
import { generateTerritory } from './territory';
import { toMonthIndex } from '../core/calendar';

describe('market data', () => {
  it('has one value per year through the data end for every series', () => {
    for (const id of SERIES_IDS) {
      const d = MARKET_SERIES[id];
      const first = d.availableFrom ?? 1970;
      expect(d.annual[0].year, id).toBe(first);
      expect(d.annual[d.annual.length - 1].year, id).toBe(DATA_END_YEAR);
      expect(d.annual.length, id).toBe(DATA_END_YEAR - first + 1);
      for (const p of d.annual) expect(Number.isFinite(p.value) && p.value >= 0, `${id} ${p.year}`).toBe(true);
    }
  });
  it('has unique history ids and valid predecessors', () => {
    const ids = new Set(HISTORY.map((e) => e.id));
    expect(ids.size).toBe(HISTORY.length);
    for (const e of HISTORY) for (const a of e.after ?? []) expect(ids.has(a), `${e.id} after ${a}`).toBe(true);
  });
});

describe('market paths', () => {
  it('strict mode reproduces annual anchors', () => {
    const path = getMarketPath(3, 'strict', {});
    for (const id of ['corn', 'soybeans', 'anhydrous', 'crude', 'prime', 'cpi'] as const) {
      for (const year of [1970, 1974, 1988, 2008, 2012, 2022]) {
        const anchor = MARKET_SERIES[id].annual.find((p) => p.year === year)!.value;
        expect(Math.abs(annualAverage(path, id, year) / anchor - 1), `${id} ${year}`).toBeLessThan(0.005);
      }
    }
  });
  it('drift mode shifts events but respects ordering', () => {
    const plan = makeDriftPlan(11, 'drift');
    expect(Object.keys(plan).length).toBeGreaterThan(10);
    for (const e of HISTORY) for (const a of e.after ?? []) expect(eventMonth(e.id, plan)).toBeGreaterThan(eventMonth(a, plan));
    for (const e of HISTORY.filter((x) => !x.driftable)) expect(plan[e.id]).toBeUndefined();
    const strict = getMarketPath(11, 'strict', {});
    const drifted = getMarketPath(11, 'drift', plan);
    expect(marketValue(strict, 'corn', toMonthIndex(2012, 8))).not.toBeCloseTo(marketValue(drifted, 'corn', toMonthIndex(2012, 8)), 2);
  });
  it('continues procedurally after the data with finite, plausible values', () => {
    const path = getMarketPath(5, 'drift', makeDriftPlan(5, 'drift'));
    for (let y = DATA_END_YEAR + 1; y < DATA_END_YEAR + 40; y++) {
      for (const id of SERIES_IDS) {
        const v = marketValue(path, id, toMonthIndex(y, 6));
        expect(Number.isFinite(v) && v >= 0, `${id} ${y}`).toBe(true);
      }
      const corn = marketValue(path, 'corn', toMonthIndex(y, 6));
      expect(corn).toBeGreaterThan(1);
      expect(corn).toBeLessThan(40);
    }
  });
});

describe('territory', () => {
  it('generates a connected map within the region ranges', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      for (const members of [50, 400, 5000]) {
        const t = generateTerritory(seed, ECCB, 1970, members);
        expect(t.towns.length).toBeGreaterThanOrEqual(ECCB.towns.min);
        expect(t.towns.length).toBeLessThanOrEqual(ECCB.towns.max);
        for (const row of t.distances) for (const d of row) expect(d).toBeLessThan(1e6);
        const main = t.rail.find((r) => r.kind === 'mainline')!;
        expect(main.townIds.length).toBeGreaterThanOrEqual(3);
        expect(new Set(t.towns.map((x) => x.name)).size).toBe(t.towns.length);
      }
    }
  });
});
