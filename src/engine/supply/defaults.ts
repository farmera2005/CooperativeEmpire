import { FILL, SUPPLY_DIVISIONS, type SupplyDivision } from '../../data/supply';
import type { DivisionId, SupplyBook, SupplyPolicy } from '../types';

export function emptySupplyBook(): SupplyBook {
  return {
    inventory: {}, ar: { current: 0, past30: 0, past60: 0, past90: 0, harvest: 0 }, allowance: 0, prepay: 0, prebuyGal: 0, prebuyPrice: 0,
    rebatesAccrued: 0, rebateBase: 0, lateMemory: 0, townShare: {}, toll: null, report: null, reports: [],
  };
}

export function defaultSupplyPolicy(): SupplyPolicy {
  return { posture: 'market', credit: 'normal', prepayProgram: true, summerFillPct: FILL.defaultSummerPct, winterFillPct: FILL.defaultWinterPct, tollMilling: false, prebuyProgram: true, supplyCover: 'covered' };
}

export const emptySupply = (): Record<SupplyDivision, SupplyBook> =>
  Object.fromEntries(SUPPLY_DIVISIONS.map((d) => [d, emptySupplyBook()])) as Record<SupplyDivision, SupplyBook>;
export const defaultSupplyPolicies = (): Record<SupplyDivision, SupplyPolicy> =>
  Object.fromEntries(SUPPLY_DIVISIONS.map((d) => [d, defaultSupplyPolicy()])) as Record<SupplyDivision, SupplyPolicy>;
export const emptyPatronageStats = (): Record<DivisionId, { member: number; nonmember: number }> =>
  ({ GRAIN: { member: 0, nonmember: 0 }, AGRONOMY: { member: 0, nonmember: 0 }, FEED: { member: 0, nonmember: 0 }, ENERGY: { member: 0, nonmember: 0 }, RETAIL: { member: 0, nonmember: 0 }, CORP: { member: 0, nonmember: 0 } });
