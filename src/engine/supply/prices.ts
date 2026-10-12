// Supply prices: wholesale cost per unit, the market (competitors') price, and ours.

import { FEED_DEMAND, LINES, DIVISION_CONFIG, type LineDef, type LineId } from '../../data/supply';
import type { SeriesId } from '../../data/markets';
import { yearOf } from '../core/calendar';
import type { GameState, Posture } from '../types';
import { futuresPrice, localBasis } from '../grain/prices';
import { marketValue, type MarketPath } from '../world/marketPath';

export interface LinePrice {
  /** Nominal $ per unit. For $-denominated lines the unit is $1 of 2024 retail value. */
  cost: number;
  market: number;
  ours: number;
}

/** Wholesale (replacement) cost per unit this month. */
export function lineCost(state: GameState, path: MarketPath, def: LineDef, mi: number, idx: number, pl: number): number {
  const c = def.cost;
  switch (c.kind) {
    case 'series': {
      let v = 0;
      c.series.forEach((s: SeriesId, i) => (v += c.weights[i] * marketValue(path, s, mi)));
      return v * c.factor;
    }
    case 'ration': {
      const cornCash = futuresPrice(path, 'corn', mi) + localBasis(state, 'corn', mi, idx);
      const cornBuPerTon = (FEED_DEMAND.cornShare.value * 2000) / 56;
      let corn = cornBuPerTon * cornCash;
      if (yearOf(mi) >= FEED_DEMAND.distillersFrom && Number.isFinite(marketValue(path, 'ddgs', mi))) {
        const d = FEED_DEMAND.distillersShare.value;
        corn = corn * (1 - d / FEED_DEMAND.cornShare.value) + d * marketValue(path, 'ddgs', mi);
      }
      return corn + FEED_DEMAND.mealShare.value * marketValue(path, 'soymeal', mi) + FEED_DEMAND.premixPerTon2024.value * pl;
    }
    case 'fixed2024':
      return (c.perUnit * pl) / (1 + (def.margin.kind === 'pct' ? def.margin.value : 0));
    case 'service':
      return 0;
  }
}

/** The going price in the territory. */
export function marketPrice(def: LineDef, cost: number, idx: number, pl: number): number {
  if (def.cost.kind === 'fixed2024') return pl;
  if (def.margin.kind === 'pct') return cost * (1 + def.margin.value);
  return cost + def.margin.value * idx;
}

export function ourPrice(def: LineDef, market: number, posture: Posture): number {
  return market * (1 + DIVISION_CONFIG[def.division].posturePct.value[posture] / 100);
}

export function linePrice(state: GameState, path: MarketPath, id: LineId, mi: number, idx: number, pl: number, posture: Posture): LinePrice {
  const def = LINES[id];
  const cost = lineCost(state, path, def, mi, idx, pl);
  const market = marketPrice(def, cost, idx, pl);
  return { cost, market, ours: ourPrice(def, market, posture) };
}

/** A series relative to its 3-year average (shortage detection). */
export function seriesRatio(path: MarketPath, series: SeriesId, mi: number): number {
  let s = 0;
  for (let k = 1; k <= 36; k++) s += marketValue(path, series, mi - k);
  return marketValue(path, series, mi) / (s / 36);
}
