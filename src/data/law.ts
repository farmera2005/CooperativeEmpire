// Tax law and legal parameters by year. Not drifted (D-009).

import type { Confidence } from './types';

export interface FederalTaxRegime {
  fromYear: number;
  /** Graduated brackets: [upper bound of taxable income in dollars (Infinity for top), rate]. */
  brackets: [number, number][];
  confidence: Confidence;
  note?: string;
}

// Simplified corporate brackets. The 1987 blended rate and surtax bubbles are approximated.
export const FEDERAL_CORPORATE_TAX: FederalTaxRegime[] = [
  { fromYear: 1970, brackets: [[25_000, 0.22], [Infinity, 0.48]], confidence: 'high', note: '22% normal tax + 26% surtax above $25,000' },
  { fromYear: 1975, brackets: [[25_000, 0.2], [50_000, 0.22], [Infinity, 0.48]], confidence: 'medium' },
  { fromYear: 1979, brackets: [[25_000, 0.17], [50_000, 0.2], [75_000, 0.3], [100_000, 0.4], [Infinity, 0.46]], confidence: 'high' },
  { fromYear: 1983, brackets: [[25_000, 0.15], [50_000, 0.18], [75_000, 0.3], [100_000, 0.4], [Infinity, 0.46]], confidence: 'high' },
  { fromYear: 1987, brackets: [[50_000, 0.15], [75_000, 0.25], [Infinity, 0.4]], confidence: 'medium', note: '1987 blended transition rate approximated as 40%' },
  { fromYear: 1988, brackets: [[50_000, 0.15], [75_000, 0.25], [Infinity, 0.34]], confidence: 'high' },
  { fromYear: 1993, brackets: [[50_000, 0.15], [75_000, 0.25], [10_000_000, 0.34], [Infinity, 0.35]], confidence: 'high', note: 'Surtax phase-outs omitted' },
  { fromYear: 2018, brackets: [[Infinity, 0.21]], confidence: 'high' },
];

export const STATE_CORPORATE_TAX_RATE = { value: 0.06, confidence: 'low' as Confidence, note: 'Simple flat Corn Belt state rate; real states vary 4–9.5%.' };

/** Domestic production activities deduction (IRC 199), 2005–2017. */
export const DPAD = [
  { fromYear: 2005, toYear: 2006, pct: 0.03 },
  { fromYear: 2007, toYear: 2009, pct: 0.06 },
  { fromYear: 2010, toYear: 2017, pct: 0.09 },
] as const;
export const DPAD_WAGE_LIMIT = 0.5;

/** Section 199A(g), 2018 onward. */
export const SEC_199AG = { fromYear: 2018, pct: 0.09, wageLimit: 0.5, confidence: 'high' as Confidence };

/** Subchapter T: minimum cash portion of a qualified patronage refund. */
export const QUALIFIED_MIN_CASH_PCT = 0.2;

export function federalRegime(year: number): FederalTaxRegime {
  let r = FEDERAL_CORPORATE_TAX[0];
  for (const reg of FEDERAL_CORPORATE_TAX) if (year >= reg.fromYear) r = reg;
  return r;
}
