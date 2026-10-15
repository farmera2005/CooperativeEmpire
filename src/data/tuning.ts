// Model coefficients and calibration constants, grouped by system. Every value is Sourced
// so the data review lists what needs expert attention. Dollar amounts are in 2024 dollars
// unless named otherwise; the engine scales them by CPI (see engine/world/macro.ts).

import { s } from './types';

export const DOLLAR_BASE_YEAR = 2024;

export const SETUP = {
  /** Starting capital per founding member (2024 $), by preset. */
  capitalPerMember: {
    shoestring: s(1500, 'low', 'Enough to buy a small used elevator with debt'),
    typical: s(4000, 'low'),
    well: s(10000, 'low'),
  },
  /** Minimum starting capital regardless of members (2024 $). */
  minCapital: s(250_000, 'low'),
  membersRange: [50, 5000] as [number, number],
  defaultMembers: 400,
  /** Non-member customers as a share of member count. */
  nonMemberShare: s(0.25, 'low', 'Non-member customers relative to members; more near highway towns'),
  /** Membership (common) stock par value per member (2024 $). */
  membershipStockPar: s(1000, 'low'),
};

export const GOVERNANCE_SETUP = {
  /** Board size by member count. */
  boardSizeByMembers: [
    { maxMembers: 300, size: 7 },
    { maxMembers: 2000, size: 9 },
    { maxMembers: Infinity, size: 11 },
  ],
  districts: 3,
  termYears: 3,
  supermajority: s(2 / 3, 'high', 'Common bylaw requirement for structural votes'),
  directorMinAge: 30,
  directorMaxAge: 72,
};

/** Scorecard weights (DESIGN §18): what a sound local co-op is judged on. */
export const SCORECARD = {
  weights: s({ savings: 3, equity: 3, returns: 2, satisfaction: 2, share: 1, growth: 1, lender: 2, safety: 1, board: 1 }, 'low', 'Design judgement'),
};

/** How repeated grievances combine (D-085). */
export const GRIEVANCES = {
  maxSeverity: s(4, 'low', 'Cap on one grievance kind per member'),
  repeatWeight: s(0.25, 'low', 'Share of the weaker complaint added when the same one recurs'),
  /** Farmers blame a disaster closure (explosion, fire) far less than a badly run house. */
  disasterFactor: s(0.3, 'low'),
};

export const OVERHEAD = {
  /**
   * GM salary: base + per member + per location, 2024 $. A one-house co-op's manager also runs
   * the elevator; a multi-location GM is paid for the job's scope (D-098).
   */
  gmSalaryBase: s(60_000, 'low'),
  gmSalaryPerMember: s(30, 'low'),
  gmSalaryPerLocation: s(10_000, 'low'),
  /** Benefits and payroll taxes as share of salary. */
  benefitsRate: s(0.28, 'low'),
  /** Office and admin expense per month, 2024 $ (base + per member). */
  officeMonthlyBase: s(1500, 'low'),
  /** Office and admin per location per month, 2024 $. */
  officeMonthlyPerLocation: s(600, 'low'),
  officeMonthlyPerMember: s(2, 'low'),
  /** Board per diem per director per monthly meeting, 2024 $. */
  directorPerDiem: s(250, 'low'),
  /** Annual audit fee (2024 $) base + per $1M of assets. */
  auditFeeBase: s(8_000, 'low'),
  auditFeePerMillionAssets: s(1_500, 'low', 'Small co-op audits ran a few thousand dollars; fees scale with the balance sheet'),
  /** Interest earned on cash: T-bill rate minus this spread (percentage points). */
  cashYieldSpread: s(1.0, 'low'),
};

export const DEMOGRAPHICS = {
  /** Gompertz mortality q(x) = a * exp(b * x), annual. */
  mortalityA: s(0.00012, 'medium', 'Approximates U.S. male life table'),
  mortalityB: s(0.085, 'medium'),
  /** Annual retirement probability by age. */
  retirement: s<[number, number][]>([[60, 0.0], [62, 0.04], [65, 0.1], [70, 0.18], [75, 0.3], [80, 0.5]], 'low'),
  /** Probability that an exiting farm has a family successor who keeps farming. */
  successorProb: s(0.35, 'low'),
  successorAge: s<[number, number]>([24, 40], 'low'),
  /** Max additional (financial/structural) exits per year as share of farms. */
  maxStructuralExitRate: s(0.04, 'low'),
  /** In farm-crisis conditions, extra exit pressure per unit of income stress. */
  stressExitRate: s(0.02, 'low'),
  /** New young entrants per year as share of farms (when farms below target). */
  entrantRate: s(0.03, 'low'),
  /** Number of neighbors receiving acres from an exiting farm without successor. */
  acreRecipients: [1, 3] as [number, number],
  /** Records of deceased/settled members with no equity are removed after this many months. */
  pruneAfterMonths: 12,
};

export const MEMBER_TRAITS = {
  loyalty: s<[number, number]>([0.3, 0.9], 'low', 'Uniform range at founding'),
  priceSens: s<[number, number]>([0.2, 0.8], 'low'),
  serviceSens: s<[number, number]>([0.2, 0.8], 'low'),
  /** Large farms are this much more price sensitive. */
  largeFarmPriceSensBonus: s(0.15, 'low'),
  initialSatisfaction: s(60, 'low'),
};

export const DIRECTOR_TRAITS = {
  literacy: s<[number, number]>([4, 16], 'low'),
  loyaltyToGM: s<[number, number]>([45, 70], 'low'),
};

export const WEATHER = {
  /** Field-day multipliers in a wet spring / wet fall. */
  wetSeasonFieldDayFactor: s(0.6, 'low'),
  /** Weekly field-day noise sd (days). */
  fieldDayNoiseSd: s(0.9, 'low'),
  /** HDD anomaly sd (share of normal). */
  hddNoiseSd: s(0.12, 'low'),
  /** Harvest moisture (corn, % at harvest) normal and wet-fall values. */
  harvestMoistureNormal: s(19, 'low'),
  harvestMoistureWet: s(24, 'low'),
};

export const MARKETS_BUILD = {
  /** Strict mode keeps a little monthly noise so months differ, scaled by this factor. */
  strictNoiseScale: s(0.3, 'low'),
  /** Drift mode: max months an event can move, and magnitude range. */
  driftMaxMonths: 24,
  driftMagnitude: s<[number, number]>([0.6, 1.4], 'low'),
  /** AR(1) persistence of monthly market noise. */
  noisePersistence: s(0.6, 'low'),
  /** Trend smoothing window (years, centered). */
  trendWindowYears: 5,
  /** Taper (months) when moving a deviation window. */
  windowTaperMonths: 3,
};

export const TERRITORY = {
  /** Towns = base + span * sqrt(members / 5000), ± jitter, clamped to the region range. */
  townsBase: 15,
  townsSpan: 25,
  townsPerCounty: s(7, 'low'),
  minTownSpacingMiles: s(5, 'medium'),
  countySeatPop: s<[number, number]>([3000, 25000], 'low'),
  townPop: s<[number, number]>([100, 3000], 'low'),
  /** Rural road miles per straight-line mile. */
  roadCircuity: s(1.2, 'medium', 'Section-line roads'),
  majorHighways: 2,
  mainlineCaptureMiles: 4,
  branchLines: [1, 3] as [number, number],
  branchTowns: [2, 4] as [number, number],
  branchAbandonmentRisk: s<[number, number]>([0.02, 0.08], 'low', 'Annual probability once Staggers Act applies'),
  riverTerminalMiles: s<[number, number]>([30, 80], 'low'),
  processorMiles: s<[number, number]>([35, 90], 'low'),
};

export const LENDING = {
  /** Spread over prime (percentage points) by lender type. */
  spreadOverPrime: {
    'bc-district': s(0.0, 'low', 'Banks for Cooperatives often lent near prime'),
    cobank: s(0.25, 'low'),
    'local-bank': s(1.0, 'low'),
  } as Record<string, { value: number; confidence: 'high' | 'medium' | 'low'; note?: string }>,
  /** Co-op bank average-cost pricing: the rate follows prime averaged over this many months (D-097). */
  coopBankAveragingMonths: 36,
  /** Extra spread on term loans over the line rate. */
  termSpread: s(0.5, 'low'),
  termLoanMonths: s(120, 'low', '10-year amortization for facility loans'),
  /** Maximum share of a purchase or project the lender will finance. */
  maxFinancePct: s(0.7, 'low'),
  /** Cash buffer kept before repaying the line (2024 $). */
  cashBuffer: s(25_000, 'low'),
  /** Borrowing base advance rates. */
  advance: s({ receivables: 0.8, hedgedGrain: 0.85, unhedgedGrain: 0.5, otherInventory: 0.5, marginDeposits: 0.9 }, 'low'),
  /** Unsecured part of the line as a share of member equity. */
  unsecuredEquityShare: s(0.25, 'low'),
  /** Default seasonal line commitment as a multiple of member equity. */
  defaultCommitmentEquityMultiple: s(2, 'low'),
  maxCommitmentEquityMultiple: s(5, 'low'),
  /** At annual renewal the lender sizes the line to finance this share of a full house of grain. */
  inventoryFinanceShare: s(0.8, 'low'),
  renewalMonth: 9,
  /** Penalty spread when the line is over its limit or base. */
  overLimitPenalty: s(3, 'low'),
};
