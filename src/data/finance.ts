// Co-op finance parameters (DESIGN §11–13): patronage and member reactions, redemption
// defaults, lender equity, patronage and covenants, regional co-op patronage programs and
// budgeting. Dollar amounts are 2024 dollars unless named otherwise.

import { annual, s, type AnnualPoint } from './types';

export const PATRONAGE = {
  /** Months after fiscal year end when the audit is finished and the proposal goes to the board. */
  auditMonths: 2,
  voteMonthsAfterFye: 3,
  payMonthsAfterFye: 4,
  /** Member marginal income tax rate applied to qualified allocations (federal + state, by era). */
  memberTaxRate: [
    { year: 1970, value: 0.3, confidence: 'low' },
    { year: 1982, value: 0.28, confidence: 'low' },
    { year: 1988, value: 0.22, confidence: 'low' },
    { year: 2003, value: 0.2, confidence: 'low' },
    { year: 2018, value: 0.18, confidence: 'low' },
  ] as AnnualPoint[],
  /** Grievance severity per unit of (member tax − cash check) / allocation. */
  taxBillGrievance: s(4, 'low', 'Members who owe more tax on their patronage than the check pays complain'),
  /** Loyalty change per year per point of cash share above the reference. */
  cashLoyalty: s(0.08, 'low'),
  cashReference: s(0.3, 'low', 'A typical cash share members expect'),
  /** Loyalty change when no patronage is allocated in a year with positive member business. */
  noPatronageLoyalty: s(-0.03, 'low'),
  /** Grievance for retired or estate holders whose equity has waited longer than this many years. */
  stuckEquityYears: s(15, 'low'),
  stuckEquityGrievance: s(0.6, 'low'),
  /** Minimum allocation per member; smaller amounts go to unallocated (2024 $). */
  minAllocation: s(5, 'low', 'Common de minimis bylaw provision'),
};

export const REDEMPTION = {
  /** Default estate discount rate when early estate payout is discounted (0 = par). */
  estateDiscount: s(0, 'medium'),
  defaultAge: 70,
  /** Base capital plan: years of business used for each member's target. */
  baseCapitalYears: 5,
  /** Fairness meter: members with no patronage in this many years count as inactive. */
  inactiveYears: 3,
  /** Default revolving target period shown to the board (years). */
  targetRevolveYears: s(15, 'low', 'Many local co-ops revolved on 10–20 year cycles'),
};

export const NOL = {
  /** Carryforward years by the fiscal year the loss arose. */
  carryYears: [
    { fromYear: 1970, years: 5 },
    { fromYear: 1976, years: 7 },
    { fromYear: 1981, years: 15 },
    { fromYear: 1998, years: 20 },
    { fromYear: 2018, years: 99 },
  ],
  /** From 2018 a carryforward can offset at most this share of taxable income. */
  limit2018: 0.8,
  confidence: 'medium' as const,
};

// ---------- Lender ----------

export type LenderKind = 'coopBank' | 'commercial';
export const lenderKind = (id: string): LenderKind => (id === 'bc-district' || id === 'cobank' ? 'coopBank' : 'commercial');

export const LENDER = {
  /** Co-op bank stock requirement as a share of average loan balances. */
  equityTarget: {
    'bc-district': s(0.03, 'low', 'Banks for Cooperatives built borrower stock from retained patronage'),
    cobank: s(0.04, 'low', 'CoBank targets roughly 3–4% of average loan volume'),
  } as Record<string, { value: number; confidence: 'high' | 'medium' | 'low'; note?: string }>,
  /** Patronage as % of average loan balance per year. */
  patronageRate: {
    'bc-district': [
      { year: 1970, value: 0.6, confidence: 'low' },
      { year: 1980, value: 0.3, confidence: 'low' },
      { year: 1985, value: 0.1, confidence: 'low', source: 'Farm Credit System losses 1985–87' },
      { year: 1988, value: 0.4, confidence: 'low' },
    ] as AnnualPoint[],
    cobank: [
      { year: 1989, value: 0.5, confidence: 'low' },
      { year: 2000, value: 0.8, confidence: 'low' },
      { year: 2010, value: 1.0, confidence: 'low', source: 'CoBank cash patronage ~100 bps on average loans' },
      { year: 2025, value: 1.0, confidence: 'low' },
    ] as AnnualPoint[],
  } as Record<string, AnnualPoint[]>,
  /** Cash share of lender patronage (rest in lender stock). */
  patronageCash: {
    'bc-district': s(0.3, 'low'),
    cobank: s(0.65, 'low', 'CoBank paid about two-thirds cash in the 2000s–2010s'),
  } as Record<string, { value: number; confidence: 'high' | 'medium' | 'low'; note?: string }>,
  /** Lender stock held above target is retired each year in this month. */
  patronageMonth: 3,
  /** Lender switch: fee as a share of debt moved. */
  switchFee: s(0.005, 'low'),
};

export interface CovenantSet {
  minCurrentRatio: number;
  minEquityRatio: number;
  maxTermDebtToFixed: number;
  minDebtService: number;
}

export const COVENANTS = {
  byKind: {
    coopBank: s<CovenantSet>({ minCurrentRatio: 1.1, minEquityRatio: 0.3, maxTermDebtToFixed: 0.8, minDebtService: 1.25 }, 'low', 'Typical co-op bank loan agreement'),
    commercial: s<CovenantSet>({ minCurrentRatio: 1.2, minEquityRatio: 0.35, maxTermDebtToFixed: 0.75, minDebtService: 1.35 }, 'low'),
  },
  /** A waiver costs this share of the commitment and adds spread (points). */
  waiverFee: s(0.0025, 'low'),
  watchSpread: s(0.25, 'low'),
  waiverSpread: s(0.5, 'low'),
  specialSpread: s(1.0, 'low'),
  /** Consecutive breaching year-end tests before moving down a step. */
  quartersToEscalate: 1,
  /** Consecutive compliant year-end tests before moving up a step. */
  quartersToRecover: 1,
  /** Year-end tests in special credit with breaches (including low equity or debt service) before the lender forces action. */
  quartersToForce: 2,
  /** A commercial bank cuts the line this much at renewal in farm-crisis years when the co-op is on watch or worse. */
  crisisLineCut: s(0.3, 'low'),
  crisisYears: [1982, 1987] as [number, number],
  /** Consultant fee under special credit (2024 $ per month). */
  consultantMonthly: s(8000, 'low'),
};

// ---------- Regional co-ops ----------

export type RegionalCategory = 'grain' | 'agronomy' | 'feed' | 'energy' | 'retail';

export interface RegionalProgram {
  /** Patronage as % of purchases by category; grain as 2024 $ per bushel marketed. */
  rate: Partial<Record<RegionalCategory, number>>;
  cashPortion: number;
  revolveYears: number;
  /** Multiplier on patronage by year (financial health); 0 = none. */
  health?: AnnualPoint[];
  /** Years in which equity revolvement is suspended. */
  suspendRevolve?: [number, number];
  /** Share of equity recovered in bankruptcy. */
  recoveryPct?: number;
  confidence: 'high' | 'medium' | 'low';
  note?: string;
}

const prog = (p: Omit<RegionalProgram, 'confidence'> & { confidence?: 'high' | 'medium' | 'low' }): RegionalProgram => ({ confidence: 'low', ...p });
const STD = { agronomy: 2.5, feed: 2, energy: 3, retail: 1.5, grain: 0.02 };

export const REGIONALS: Record<string, RegionalProgram> = {
  farmland: prog({
    rate: STD, cashPortion: 0.25, revolveYears: 15,
    health: annual(1993, [1, 0.8, 0.7, 0.6, 0.4, 0.3, 0.2, 0.1, 0], 'low', 'Farmland losses late 1990s'),
    suspendRevolve: [1998, 2002], recoveryPct: 0.02,
    note: 'Chapter 11 in 2002; local co-ops lost most of their Farmland equity.',
  }),
  agway: prog({
    rate: STD, cashPortion: 0.25, revolveYears: 15,
    health: annual(1996, [1, 0.6, 0.4, 0.3, 0.2, 0.1, 0], 'low'), suspendRevolve: [1999, 2002], recoveryPct: 0.05,
  }),
  cenex: prog({ rate: { ...STD, energy: 3.5 }, cashPortion: 0.3, revolveYears: 12 }),
  'farmers-union-gta': prog({ rate: STD, cashPortion: 0.3, revolveYears: 12 }),
  'harvest-states': prog({ rate: STD, cashPortion: 0.3, revolveYears: 12 }),
  'cenex-harvest-states': prog({ rate: STD, cashPortion: 0.3, revolveYears: 12 }),
  chs: prog({
    rate: { ...STD, energy: 4 }, cashPortion: 0.35, revolveYears: 10,
    health: annual(2003, [1, 1.1, 1.3, 1.5, 1.6, 1.7, 1.2, 1.3, 1.6, 1.7, 1.5, 1.4, 1.1, 0.8, 0.7, 0.8, 1, 1.1, 1.2, 1.3, 1.1, 1, 1], 'low', 'Refinery margins drove CHS energy patronage'),
  }),
  'land-o-lakes': prog({ rate: STD, cashPortion: 0.35, revolveYears: 12 }),
  'fs-services': prog({ rate: STD, cashPortion: 0.4, revolveYears: 10 }),
  growmark: prog({ rate: STD, cashPortion: 0.45, revolveYears: 10, note: 'GROWMARK paid a high cash share' }),
  landmark: prog({ rate: STD, cashPortion: 0.3, revolveYears: 12 }),
  'ohio-farmers-grain': prog({ rate: STD, cashPortion: 0.3, revolveYears: 12 }),
  countrymark: prog({ rate: STD, cashPortion: 0.3, revolveYears: 12, health: annual(1995, [1, 0.6, 0.5, 0.6, 0.8, 1], 'low', 'Countrymark restructuring late 1990s') }),
  'indiana-farm-bureau-coop': prog({ rate: STD, cashPortion: 0.3, revolveYears: 12 }),
  'southern-states': prog({ rate: STD, cashPortion: 0.3, revolveYears: 15 }),
  mfa: prog({ rate: STD, cashPortion: 0.35, revolveYears: 12 }),
  agp: prog({ rate: { grain: 0.03 }, cashPortion: 0.4, revolveYears: 10 }),
};

export const REGIONAL_DEFAULT: RegionalProgram = prog({ rate: STD, cashPortion: 0.3, revolveYears: 12 });

export const AFFILIATION = {
  /** One-time cost of switching a business line's affiliation: re-signage, contracts (2024 $). */
  switchCost: s(25_000, 'low'),
  /** Month regional patronage arrives (calendar). */
  patronageMonth: 1,
};

/** Preferred regional for each line when a setup leaves affiliations empty (first available wins). */
export const DEFAULT_AFFILIATION_ORDER: Record<RegionalCategory, string[]> = {
  agronomy: ['fs-services', 'growmark', 'countrymark', 'landmark', 'chs', 'farmland', 'land-o-lakes'],
  energy: ['fs-services', 'growmark', 'countrymark', 'landmark', 'cenex', 'cenex-harvest-states', 'chs', 'farmland'],
  feed: ['land-o-lakes', 'growmark', 'countrymark', 'farmland'],
  grain: ['fs-services', 'growmark', 'countrymark', 'landmark', 'farmers-union-gta', 'harvest-states', 'cenex-harvest-states', 'chs'],
  retail: ['southern-states', 'agway'],
};

export const BUDGET = {
  /** Month before fiscal year end when the budget is drafted and when it is approved. */
  draftMonthsBeforeFye: 3,
  approveMonthsBeforeFye: 1,
};
