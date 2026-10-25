// What existing facilities are worth (D-130). Each unit is valued at the cost of its modern
// equivalent — an old concrete house at what the same bushels of storage cost today, not
// what it would cost to pour again — less its age, wear and any obsolescence. Sites for sale,
// merger appraisals and salvage all start here.

import { COMPONENTS, midCost, type ComponentId } from '../../data/facilities';
import { VALUATION } from '../../data/equipment';
import { yearOf } from '../core/calendar';
import type { GameState, InstalledUnit } from '../types';
import { constructionLevel } from '../world/macro';
import type { MarketPath } from '../world/marketPath';
import { decompose, modelOf, modelsFor, unitValue2024 } from './units';

const STORAGE: ComponentId[] = ['storage-wood', 'storage-concrete', 'storage-steel', 'storage-flat'];

/** Cheapest 2024 $ per unit of capacity among models offered new in `year` for these components. */
function cheapestPerUnit(components: ComponentId[], year: number): number | null {
  let best: number | null = null;
  for (const c of components) {
    for (const m of modelsFor(c, year)) {
      const per = midCost(c, year) * (m.costFactor ?? 1);
      if (best === null || per < best) best = per;
    }
  }
  return best;
}

/** What it would cost (2024 $) to provide a unit's capacity with today's equipment. */
export function modernReplacement2024(u: InstalledUnit, year: number): number {
  if (u.component === 'site') return midCost('site', year) * u.qty;
  const own = unitValue2024(u, year);
  // Storage is storage: a wood or concrete house is replaced by today's cheapest bins or tanks.
  const peers = STORAGE.includes(u.component) && u.component !== 'storage-flat' ? ['storage-steel', 'storage-concrete'] as ComponentId[] : [u.component];
  const per = cheapestPerUnit(peers, year);
  return per === null ? own : Math.min(own, per * u.qty);
}

/** Share of a unit's modern replacement it is worth: age against life, condition, obsolescence. */
export function unitWorthShare(u: InstalledUnit, year: number): number {
  if (u.component === 'site') return 1;
  const def = COMPONENTS[u.component];
  const floor = def.account === '1510' ? VALUATION.floorStructure.value : VALUATION.floorEquipment.value;
  const years = Math.max(0, year - u.builtYear);
  const age = def.lifeYears > 0 ? Math.max(floor, 1 - years / (def.lifeYears * VALUATION.lifeStretch.value)) : 1;
  const m = modelOf(u.modelId);
  const obsolete = u.modelId.startsWith('legacy:') || (m.availableTo !== undefined && year >= m.availableTo) ? VALUATION.obsoleteFactor.value : 1;
  const cf = VALUATION.conditionFloor.value;
  return age * (cf + ((1 - cf) * u.condition) / 100) * obsolete;
}

/** Used value of units, nominal cents (fractional; round when posting). */
export function usedValueOfUnits(path: MarketPath, mi: number, units: InstalledUnit[]): number {
  const y = yearOf(mi);
  let v = 0;
  for (const u of units) v += modernReplacement2024(u, y) * unitWorthShare(u, y);
  return v * constructionLevel(path, mi) * 100;
}

/** Modern-equivalent replacement of units (no depreciation), nominal cents. */
export function modernReplacementOfUnits(path: MarketPath, mi: number, units: InstalledUnit[]): number {
  const y = yearOf(mi);
  return units.reduce((a, u) => a + modernReplacement2024(u, y), 0) * constructionLevel(path, mi) * 100;
}

/** Units a site described by component totals would be split into (same as when it is bought). */
export function siteUnits(state: GameState, components: Partial<Record<ComponentId, number>>, builtYear: number, condition: number, key: string): InstalledUnit[] {
  let n = 1;
  return decompose(components, { builtYear, nowYear: yearOf(state.clock.monthIndex), condition, key: `${state.setup.gameSeed}|${key}`, nextId: () => n++ });
}

/** Key that ties a competitor's site to its units, so a valuation, an offer and a purchase agree. */
export const competitorSiteKey = (competitorId: number, siteId: number): string => `site|${competitorId}|${siteId}`;
