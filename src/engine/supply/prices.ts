// Supply prices: wholesale cost per unit, the market (competitors') price, and ours.

import { FEED_DEMAND, LINES, DIVISION_CONFIG, SUPPLIER_VOLUME, type LineDef, type LineId, type SupplyDivision } from '../../data/supply';
import { valueAt } from '../../data/types';
import { incomeStatement } from '../ledger/statements';
import { pathFor, priceLevel } from '../world/macro';
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

/**
 * `discount` is our supplier volume discount (D-107): it lowers what we pay, not the going
 * price in the territory, so a big buyer earns a wider margin or can price more sharply.
 */
export function linePrice(state: GameState, path: MarketPath, id: LineId, mi: number, idx: number, pl: number, posture: Posture, discount = 0): LinePrice {
  const def = LINES[id];
  const cost = lineCost(state, path, def, mi, idx, pl);
  const market = marketPrice(def, cost, idx, pl);
  const ours = SUPPLIER_VOLUME.excludedLines.includes(id) ? cost : cost * (1 - discount);
  return { cost: ours, market, ours: ourPrice(def, market, posture) };
}

export interface SupplierTerms {
  /** Discount off wholesale cost this month (0..1). */
  pct: number;
  /** Trailing 12 months' purchases (cost of goods sold), 2024 $. */
  volume2024: number;
  /** The best discount suppliers give anyone this year in this division. */
  maxPct: number;
  /** Purchases (2024 $) that would add another percentage point, or null at the top. */
  nextPointAt2024: number | null;
}

/** Discount as a function of annual purchases (2024 $) for a division and year. */
export function volumeDiscount(d: SupplyDivision, year: number, volume2024: number): number {
  const v = SUPPLIER_VOLUME;
  const max = valueAt(v.maxDiscount, year) * v.divisionWeight.value[d];
  if (volume2024 <= v.floor2024.value) return 0;
  return max * Math.min(1, Math.log(volume2024 / v.floor2024.value) / Math.log(v.top2024.value / v.floor2024.value));
}

/** Our supplier terms in a farm-supply division, from what we bought over the last twelve months. */
export function supplierTerms(state: GameState, d: SupplyDivision): SupplierTerms {
  const mi = state.clock.monthIndex;
  const path = pathFor(state);
  // The twelve completed months before this one; a short history is annualized. 2024 dollars.
  const from = Math.max(state.ledger.firstMonth, mi - 12);
  const months = mi - from;
  const volume2024 = months > 0 ? (incomeStatement(state.ledger, from, mi - 1, d).cogs / 100 / priceLevel(path, mi)) * (12 / months) : 0;
  const yr = yearOf(mi);
  const v = SUPPLIER_VOLUME;
  const maxPct = valueAt(v.maxDiscount, yr) * v.divisionWeight.value[d];
  const pct = volumeDiscount(d, yr, volume2024);
  // Purchases that would raise the discount by one point: invert the log curve.
  const target = pct + 0.01;
  const nextPointAt2024 = maxPct > 0 && target < maxPct ? v.floor2024.value * Math.pow(v.top2024.value / v.floor2024.value, target / maxPct) : null;
  return { pct, volume2024, maxPct, nextPointAt2024 };
}

/** A series relative to its 3-year average (shortage detection). */
export function seriesRatio(path: MarketPath, series: SeriesId, mi: number): number {
  let s = 0;
  for (let k = 1; k <= 36; k++) s += marketValue(path, series, mi - k);
  return marketValue(path, series, mi) / (s / 36);
}
