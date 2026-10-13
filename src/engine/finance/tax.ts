// Subchapter T income tax (DESIGN §11.3): graduated federal brackets by year, a flat state
// rate, DPAD (2005–2017) and 199A(g) (2018+), and net operating loss carryforwards.

import { NOL } from '../../data/finance';
import { DPAD, DPAD_WAGE_LIMIT, federalRegime, SEC_199AG, STATE_CORPORATE_TAX_RATE } from '../../data/law';
import { roundCents, type Cents } from '../core/money';

export function federalTax(taxable: Cents, year: number): Cents {
  if (taxable <= 0) return 0;
  const dollars = taxable / 100;
  let tax = 0;
  let lower = 0;
  for (const [upper, rate] of federalRegime(year).brackets) {
    const slice = Math.min(dollars, upper) - lower;
    if (slice > 0) tax += slice * rate;
    if (dollars <= upper) break;
    lower = upper;
  }
  return roundCents(tax * 100);
}

export const stateTax = (taxable: Cents): Cents => (taxable > 0 ? roundCents(taxable * STATE_CORPORATE_TAX_RATE.value) : 0);

/** Production-activities deduction rate for a fiscal year (DPAD or 199A(g)), and its wage limit. */
export function productionDeductionRate(fy: number): { pct: number; wageLimit: number; label: string } {
  if (fy >= SEC_199AG.fromYear) return { pct: SEC_199AG.pct, wageLimit: SEC_199AG.wageLimit, label: 'Section 199A(g)' };
  for (const d of DPAD) if (fy >= d.fromYear && fy <= d.toYear) return { pct: d.pct, wageLimit: DPAD_WAGE_LIMIT, label: 'DPAD (Section 199)' };
  return { pct: 0, wageLimit: 0, label: '' };
}

export function nolCarryYears(fy: number): number {
  let y = NOL.carryYears[0].years;
  for (const r of NOL.carryYears) if (fy >= r.fromYear) y = r.years;
  return y;
}

export interface TaxInput {
  fy: number;
  savingsBeforeTax: Cents;
  /** Cash + qualified retained patronage (deductible). */
  qualifiedAllocations: Cents;
  nqRedeemed: Cents;
  /** Production deduction kept by the co-op. */
  deduction: Cents;
  nol: { fy: number; amount: Cents; expires: number }[];
}

export interface TaxResult {
  taxableBeforeNol: Cents;
  nolUsed: Cents;
  taxable: Cents;
  federal: Cents;
  state: Cents;
  tax: Cents;
  /** NOL schedule after this year (used, expired and new losses applied). */
  nol: { fy: number; amount: Cents; expires: number }[];
}

export function computeTax(x: TaxInput): TaxResult {
  const taxableBeforeNol = x.savingsBeforeTax - x.qualifiedAllocations - x.nqRedeemed - x.deduction;
  const nol = x.nol.filter((n) => n.expires >= x.fy && n.amount > 0).map((n) => ({ ...n }));
  let nolUsed = 0;
  let taxable = taxableBeforeNol;
  if (taxable > 0) {
    let room = x.fy >= 2018 ? roundCents(taxable * NOL.limit2018) : taxable;
    for (const n of nol) {
      const use = Math.min(room, n.amount);
      n.amount -= use;
      room -= use;
      nolUsed += use;
    }
    taxable -= nolUsed;
  } else if (taxable < 0) {
    nol.push({ fy: x.fy, amount: -taxable, expires: x.fy + nolCarryYears(x.fy) });
    taxable = 0;
  }
  const federal = federalTax(taxable, x.fy);
  const state = stateTax(taxable);
  return { taxableBeforeNol, nolUsed, taxable, federal, state, tax: federal + state, nol: nol.filter((n) => n.amount > 0) };
}
