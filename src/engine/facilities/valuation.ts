// Used value of installed units (D-129): what they would cost new, less wear and age.

import { COMPONENTS } from '../../data/facilities';
import { yearOf } from '../core/calendar';
import type { InstalledUnit } from '../types';
import type { MarketPath } from '../world/marketPath';
import { unitsReplacementCost } from './units';

/** Replacement cost scaled by each unit's remaining life and condition, nominal cents. */
export function usedValueOfUnits(path: MarketPath, mi: number, units: InstalledUnit[]): number {
  const y = yearOf(mi);
  let v = 0;
  for (const u of units) {
    const life = COMPONENTS[u.component].lifeYears;
    const ageShare = life > 0 ? Math.max(0.15, 1 - (y - u.builtYear) / (life * 1.6)) : 1;
    v += unitsReplacementCost(path, mi, [u]) * ageShare * (u.component === 'site' ? 1 : 0.5 + u.condition / 200);
  }
  return v;
}
