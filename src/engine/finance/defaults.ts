import { REDEMPTION } from '../../data/finance';
import type { EquityProgram, PatronageProposal, RedemptionPolicy, RegionalBook } from '../types';

/** A common local co-op plan: pools by division, grain on bushels, supply on sales, 30% cash. */
export function defaultProposal(): PatronageProposal {
  return {
    pooling: 'byDivision',
    basis: { GRAIN: 'units', AGRONOMY: 'sales', FEED: 'sales', ENERGY: 'sales', RETAIL: 'sales' },
    lossTreatment: 'absorbUnallocated',
    pools: { ALL: { cash: 0.3, qualified: 0.7, nonqualified: 0, unallocated: 0 } },
    passDeduction: 0,
  };
}

export function defaultRedemption(): RedemptionPolicy {
  return {
    budgetFixed: 0,
    budgetPctOfSavings: 0.2,
    plans: [{ kind: 'estate', discountPct: REDEMPTION.estateDiscount.value }, { kind: 'ageOfPatron', age: REDEMPTION.defaultAge }, { kind: 'revolving' }],
  };
}

export function emptyEquityProgram(): EquityProgram {
  return {
    proposal: defaultProposal(), redemption: defaultRedemption(), pending: null, approved: null, lossCarryforward: 0, nol: [],
    nqRedeemedFY: 0, history: [], fyLines: {},
  };
}

/** Add to the fiscal-year business tally of a product line (patronage bases). */
export function addFyLine(ep: EquityProgram, line: string, units: number, revenue: number, cogs: number): void {
  const x = (ep.fyLines[line] ??= { units: 0, revenue: 0, cogs: 0 });
  x.units += units;
  x.revenue += revenue;
  x.cogs += cogs;
}

export const emptyRegional = (): RegionalBook => ({ purchases: {}, equity: {}, last: null });
