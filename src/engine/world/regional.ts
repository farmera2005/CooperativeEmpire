// Regional adjustments (D-140): the market data carries central Illinois yields and basis; a
// region scales yields by crop and year and shifts basis, and scales sugar beet yields.

import { ECCB, REGIONS, type RegionDef } from '../../data/regions/eccb';
import { valueAt } from '../../data/types';
import { HARVEST_CALENDAR, type Commodity } from '../../data/grain';
import { yearOf } from '../core/calendar';
import type { GameState } from '../types';
import { pathFor } from './macro';
import { marketValue } from './marketPath';

const SERIES: Record<Commodity, 'yieldCorn' | 'yieldSoy' | 'yieldWheat'> = { corn: 'yieldCorn', soybeans: 'yieldSoy', wheat: 'yieldWheat' };

/** The region's yield against the market data's central Illinois yield, for a crop and year. */
export function yieldFactor(state: GameState, c: Commodity, year: number): number {
  const f = REGIONS[state.world.regionId]?.yieldFactor?.[c];
  return f ? valueAt(f, year) : 1;
}

/** Regional yield (bu/acre) for a crop in a month. */
export function regionalYield(state: GameState, c: Commodity, mi: number): number {
  return marketValue(pathFor(state), SERIES[c], mi) * yieldFactor(state, c, yearOf(mi));
}

/** Regional basis against central Illinois, 2024 $/bu. */
export const basisOffset = (state: GameState, c: Commodity): number => REGIONS[state.world.regionId]?.basisOffset?.value[c] ?? 0;

/** Sugar beet yields against the data's curve. */
export const beetYieldFactor = (state: GameState): number => REGIONS[state.world.regionId]?.beetYieldFactor?.value ?? 1;

/** Grain a typical farm grows in a region and year, bushels (crop shares × regional yields × farm size), against central Illinois yields. */
function grainPerFarm(r: RegionDef, year: number): number {
  const typical: Record<Commodity, number> = { corn: 100, soybeans: 33, wheat: 44 };
  let bu = 0;
  for (const c of ['corn', 'soybeans', 'wheat'] as Commodity[]) bu += valueAt(r.cropShares[c], year) * typical[c] * (r.yieldFactor ? valueAt(r.yieldFactor[c], year) : 1);
  return bu * valueAt(r.meanFarmAcres, year);
}

/**
 * How big country elevators run in a region against central Illinois (D-140): they were built
 * for the grain around them, so a region with smaller farms, lower yields or more non-grain crops
 * has smaller houses. Exactly 1 in the central Corn Belt.
 */
export function elevatorScale(state: GameState, year: number): number {
  // Houses run somewhat smaller where farms grow less grain, but a co-op serves more farms there.
  return Math.sqrt(grainScale(state.world.regionId, year));
}

/** Grain per farm in a region against central Illinois (exactly 1 there), bounded. */
export function grainScale(regionId: string, year: number): number {
  const r = REGIONS[regionId];
  if (!r || r.id === ECCB.id) return 1;
  return Math.max(0.35, Math.min(1.6, grainPerFarm(r, year) / grainPerFarm(ECCB, year)));
}

/**
 * Founding members the setup suggests in a region (D-140): enough farms to bring a central
 * Illinois co-op's grain — more members where farms are small, fewer on the Plains.
 */
export const suggestedMembers = (regionId: string, year: number, base = 400): number => Math.round(base / grainScale(regionId, year) / 10) * 10;

/** Share of a crop harvested by month in the region (Jan..Dec). */
export function harvestCalendar(state: GameState, c: Commodity): number[] {
  return REGIONS[state.world.regionId]?.harvestCalendar?.[c] ?? HARVEST_CALENDAR[c];
}
