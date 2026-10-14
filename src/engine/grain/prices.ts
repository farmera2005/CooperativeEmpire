// Grain prices for a month: futures, destination basis, the local market bid, our bid,
// carry, and freight. Everything the farmer and the merchandiser compare.

import { ETHANOL } from '../../data/competition';
import {
  BASIS_SEASON, DEST_BASIS, GRAIN_COST_INDEX, HEDGING, NORMAL_MARGIN, POSTURE_BID, RAIL_FREIGHT, TRUCK_FREIGHT,
  type Commodity, type DestinationKind,
} from '../../data/grain';
import type { LoadoutType } from '../../data/facilities';
import { valueAt } from '../../data/types';
import { monthOf, toMonthIndex, yearOf } from '../core/calendar';
import type { Destination, GameState, Posture, Town, WorldState } from '../types';
import { annualAverage, marketValue, type MarketPath } from '../world/marketPath';

const LAST_INDEX_YEAR = GRAIN_COST_INDEX[GRAIN_COST_INDEX.length - 1].year;

/** Grain cost index for month mi (1.0 = 2024). Follows CPI after the table ends. */
export function grainCostIndex(path: MarketPath, mi: number): number {
  const y = yearOf(mi) + (monthOf(mi) - 1) / 12;
  if (y <= LAST_INDEX_YEAR) return valueAt(GRAIN_COST_INDEX, y);
  return GRAIN_COST_INDEX[GRAIN_COST_INDEX.length - 1].value * (marketValue(path, 'cpi', mi) / annualAverage(path, 'cpi', LAST_INDEX_YEAR));
}

export const futuresPrice = (path: MarketPath, c: Commodity, mi: number): number => marketValue(path, c, mi);

/** Which destinations accept a commodity. Processors are commodity-specific. */
export function destinationAccepts(d: Destination, c: Commodity): boolean {
  if (d.commodities) return d.commodities.includes(c);
  return true;
}

/** Truck miles from a town to an off-map destination: to the map edge it sits beyond, plus beyond. */
export function milesToDestination(world: Pick<WorldState, 'width' | 'height'>, town: Pick<Town, 'x' | 'y'> | null, d: Destination): number {
  // Plants on the map (ethanol): road miles from the town.
  const onMap = d.x >= 0 && d.x <= world.width && d.y >= 0 && d.y <= world.height;
  if (onMap) return town ? Math.hypot(town.x - d.x, town.y - d.y) * ETHANOL.roadFactor : Math.min(world.width, world.height) / 2;
  if (!town) return d.milesFromEdge + Math.min(world.width, world.height) / 2;
  let inside = 0;
  if (d.x < 0) inside = town.x;
  else if (d.x > world.width) inside = world.width - town.x;
  else if (d.y < 0) inside = town.y;
  else inside = world.height - town.y;
  return d.milesFromEdge + Math.max(0, inside);
}

export const truckFreight = (miles: number, idx: number): number => (TRUCK_FREIGHT.fixed.value + TRUCK_FREIGHT.perMile.value * miles) * idx;
export const railFreight = (loadout: Exclude<LoadoutType, 'truck'>, idx: number): number => RAIL_FREIGHT[loadout] * idx;

/** Destination basis (nominal $/bu vs futures) for a kind and commodity this month. */
export function destinationBasis(state: GameState, kind: DestinationKind, c: Commodity, mi: number, idx: number): number {
  return (DEST_BASIS[kind][c] + BASIS_SEASON[c][monthOf(mi) - 1] + (state.coop.grain.basisNoise[c] ?? 0)) * idx;
}

export interface SaleOption {
  mode: 'truck' | LoadoutType;
  destination: string;
  /** Price received at the elevator after freight, as basis vs futures ($/bu). */
  netBasis: number;
  grossBasis: number;
  freight: number;
}

/** Best truck sale from a given town (or a typical location when town is null). */
export function bestTruckSale(state: GameState, c: Commodity, mi: number, idx: number, town: Town | null): SaleOption | null {
  let best: SaleOption | null = null;
  for (const d of state.world.destinations) {
    if (d.kind !== 'processor' && d.kind !== 'riverTerminal' && d.kind !== 'ethanol') continue;
    if (!destinationAccepts(d, c)) continue;
    const gross = destinationBasis(state, d.kind, c, mi, idx);
    const freight = truckFreight(milesToDestination(state.world, town, d), idx);
    const net = gross - freight;
    if (!best || net > best.netBasis) best = { mode: 'truck', destination: d.name, netBasis: net, grossBasis: gross, freight };
  }
  return best;
}

export function railSale(state: GameState, c: Commodity, mi: number, idx: number, loadout: Exclude<LoadoutType, 'truck'>): SaleOption {
  const gross = destinationBasis(state, 'exportRail', c, mi, idx);
  const freight = railFreight(loadout, idx);
  return { mode: loadout, destination: 'Rail to export/feeder market', netBasis: gross - freight, grossBasis: gross, freight };
}

/** The local market cash bid (basis) a typical country elevator posts this month. */
export function localBasis(state: GameState, c: Commodity, mi: number, idx: number): number {
  const best = bestTruckSale(state, c, mi, idx, null);
  return (best?.netBasis ?? -0.3 * idx) - NORMAL_MARGIN[c] * idx;
}

export const postureBid = (p: Posture, idx: number): number => POSTURE_BID.value[p] * idx;

/** Price relative to its 3-year average: above 1 means a tight market. */
export function priceRatio(path: MarketPath, c: Commodity, mi: number): number {
  let s = 0;
  for (let k = 1; k <= 36; k++) s += marketValue(path, c, mi - k);
  return marketValue(path, c, mi) / (s / 36);
}

/** Carry captured per month by hedged storage ($/bu/month, nominal). Negative = inverted market. */
export function carryPerMonth(path: MarketPath, c: Commodity, mi: number, idx: number): number {
  const ratio = priceRatio(path, c, mi);
  return HEDGING.carryPerMonth.value[c] * idx * (1 - HEDGING.inversionSlope.value * Math.max(0, ratio - 1.05));
}

/** Seasonal basis change expected next month ($/bu nominal). */
export function basisAppreciationNext(c: Commodity, mi: number, idx: number): number {
  const m = monthOf(mi) - 1;
  return (BASIS_SEASON[c][(m + 1) % 12] - BASIS_SEASON[c][m]) * idx;
}

export const decemberOf = (year: number): number => toMonthIndex(year, 12);
