// Grain division parameters. Dollar figures are 2024 dollars per bushel unless noted and are
// scaled to the game year by GRAIN_COST_INDEX (freight, basis spreads, handling margins and
// fees moved less than general inflation over 1970–2024). Low confidence unless noted.

import { s, type AnnualPoint } from './types';
import type { LoadoutType } from './facilities';

export type Commodity = 'corn' | 'soybeans' | 'wheat';
export const COMMODITIES: Commodity[] = ['corn', 'soybeans', 'wheat'];
export const COMMODITY_LABEL: Record<Commodity, string> = { corn: 'Corn', soybeans: 'Soybeans', wheat: 'Wheat' };

/** Pounds per bushel. */
export const TEST_WEIGHT: Record<Commodity, number> = { corn: 56, soybeans: 60, wheat: 60 };

/** Index of grain handling costs (freight, basis spreads, margins, fees) relative to 2024. */
export const GRAIN_COST_INDEX: AnnualPoint[] = [
  { year: 1970, value: 0.3, confidence: 'low', source: 'Estimated: rural freight and elevator charges vs 2024' },
  { year: 1975, value: 0.38, confidence: 'low' },
  { year: 1980, value: 0.55, confidence: 'low' },
  { year: 1985, value: 0.6, confidence: 'low' },
  { year: 1990, value: 0.63, confidence: 'low' },
  { year: 1995, value: 0.66, confidence: 'low' },
  { year: 2000, value: 0.7, confidence: 'low' },
  { year: 2005, value: 0.78, confidence: 'low' },
  { year: 2010, value: 0.87, confidence: 'low' },
  { year: 2015, value: 0.92, confidence: 'low' },
  { year: 2020, value: 0.95, confidence: 'low' },
  { year: 2024, value: 1.0, confidence: 'low' },
];

export type DestinationKind = 'processor' | 'riverTerminal' | 'exportRail';

/** Destination basis vs nearby futures (2024 $/bu), annual average. */
export const DEST_BASIS: Record<DestinationKind, Record<Commodity, number>> = {
  processor: { corn: 0.0, soybeans: -0.05, wheat: -0.15 },
  riverTerminal: { corn: -0.1, soybeans: -0.08, wheat: -0.15 },
  exportRail: { corn: 0.7, soybeans: 0.8, wheat: 0.6 },
};
export const DEST_BASIS_CONFIDENCE = s('see table', 'low', 'Interior processor, Illinois River terminal and rail-export/feeder destination basis, 2024 $/bu');

/** Seasonal adjustment to basis (2024 $/bu), Jan..Dec. Wide at harvest, narrowing into summer. */
export const BASIS_SEASON: Record<Commodity, number[]> = {
  corn: [0, 0.02, 0.03, 0.04, 0.05, 0.06, 0.06, 0.03, -0.06, -0.12, -0.08, -0.03],
  soybeans: [0, 0.02, 0.03, 0.03, 0.04, 0.05, 0.06, 0.05, -0.04, -0.1, -0.07, -0.03],
  wheat: [0.03, 0.03, 0.03, 0.02, 0, -0.1, -0.08, -0.03, 0, 0.02, 0.03, 0.03],
};
/** Monthly AR(1) noise on destination basis (2024 $/bu). */
export const BASIS_NOISE_SD = s(0.035, 'low');
export const BASIS_NOISE_PERSISTENCE = s(0.7, 'low');

export const TRUCK_FREIGHT = {
  /** Commercial truck freight, 2024 $/bu: fixed + per loaded mile. */
  fixed: s(0.03, 'low'),
  perMile: s(0.0035, 'low', 'About $3.50 per loaded mile for ~1,000 bu, with empty return'),
};
/** Rail freight from the territory to the export/feeder destination (2024 $/bu) by loadout. */
export const RAIL_FREIGHT: Record<Exclude<LoadoutType, 'truck'>, number> = { single: 0.95, unit25: 0.85, unit50: 0.78, unit75: 0.72, shuttle: 0.6 };
export const RAIL_FREIGHT_CONFIDENCE = s('see table', 'low', 'Relative rail rates by train size; shuttle discount is the point');
/** Cars per month the railroad will supply, by loadout. */
export const RAIL_CARS_PER_MONTH: Record<Exclude<LoadoutType, 'truck'>, number> = { single: 30, unit25: 50, unit50: 100, unit75: 150, shuttle: 330 };
export const BU_PER_CAR = s<Record<Commodity, number>>({ corn: 3600, soybeans: 3500, wheat: 3500 }, 'medium', 'Covered hopper ~3,500–4,000 bu');
export const SHUTTLE_TRAIN_BU = s(400_000, 'medium', '110 cars');
/** Shuttle trains must be loaded within the railroad window; failing costs this per train (2024 $). */
export const SHUTTLE_PENALTY = s(25_000, 'low');

/** A typical country elevator's handling margin (2024 $/bu): local bid = best truck destination − this. */
export const NORMAL_MARGIN: Record<Commodity, number> = { corn: 0.18, soybeans: 0.18, wheat: 0.22 };
/** Bid adjustment by pricing posture (2024 $/bu). Aggressive bids more. */
export const POSTURE_BID = s({ aggressive: 0.04, market: 0, premium: -0.04 }, 'low');

/** Farmer hauling cost (2024 $/bu/mile) and how far farmers will haul. */
export const FARM_HAUL_PER_MILE = s(0.006, 'low');
export const MAX_HAUL_MILES: AnnualPoint[] = [
  { year: 1970, value: 20, confidence: 'low' },
  { year: 1990, value: 30, confidence: 'low' },
  { year: 2010, value: 40, confidence: 'low' },
];

/** Share of each crop harvested in each month (Jan..Dec). */
export const HARVEST_CALENDAR: Record<Commodity, number[]> = {
  corn: [0, 0, 0, 0, 0, 0, 0, 0, 0.15, 0.55, 0.3, 0],
  soybeans: [0, 0, 0, 0, 0, 0, 0, 0, 0.3, 0.6, 0.1, 0],
  wheat: [0, 0, 0, 0, 0, 0.4, 0.6, 0, 0, 0, 0, 0],
};
/** In a wet fall, share of October harvest pushed to November, and of November to December. */
export const WET_FALL_SHIFT = s({ octToNov: 0.25, novToDec: 0.2 }, 'low');

/** Share of production stored on the farm at harvest (rest is sold or stored at elevators). */
export const ON_FARM_STORAGE: AnnualPoint[] = [
  { year: 1970, value: 0.35, confidence: 'low' },
  { year: 1985, value: 0.5, confidence: 'low' },
  { year: 2000, value: 0.55, confidence: 'low' },
  { year: 2020, value: 0.6, confidence: 'low' },
];
export const ON_FARM_LARGE_BONUS = s(0.1, 'low');
export const ON_FARM_WHEAT_FACTOR = s(0.25, 'low', 'Little wheat is held on farm');
/** Share of on-farm stored grain sold in each month (Jan..Dec), for corn and soybeans. */
export const ON_FARM_SELL_SCHEDULE = [0.14, 0.1, 0.12, 0.08, 0.12, 0.14, 0.12, 0.1, 0, 0, 0, 0.08];
/** Wheat stored on farm is sold Aug–Dec. */
export const ON_FARM_WHEAT_SCHEDULE = [0, 0, 0, 0, 0, 0, 0, 0.3, 0.25, 0.2, 0.15, 0.1];

/** Corn fed on the farm, bushels per head of inventory per year. */
export const FEED_CORN_PER_HEAD = s({ hogs: 20, dairy: 50, beefCows: 8, cattleOnFeed: 55, poultry: 0 }, 'low');

/** Farm-to-farm yield variation (sd of a fixed per-farm factor). */
export const FARM_YIELD_SD = s(0.08, 'low');

/** Farmer marketing choices at delivery to the co-op. */
export const FARMER_MARKETING = {
  openStorageBase: s(0.12, 'low', 'Share of harvest deliveries put in open storage'),
  openStorageCarryBoost: s(4, 'low', 'Added share per $/bu/month of carry (2024 $)'),
  dpBase: s(0.04, 'low', 'Share of deliveries on delayed price'),
  dpWeakPriceBoost: s(0.12, 'low', 'Added DP share when price is >15% below its 3-year average'),
  /** Share of open-storage and DP bushels sold/priced each month outside harvest. */
  monthlySellRate: s(0.14, 'low'),
};

export const FEES = {
  /** Storage (2024 $/bu/month) charged on open storage. */
  storagePerMonth: s(0.03, 'low'),
  /** Drying (2024 $/point/bu). */
  dryingPerPoint: s(0.045, 'low'),
  /** DP service charge (2024 $/bu/month). */
  dpPerMonth: s(0.01, 'low'),
};

export const DRYING = {
  /** Base moisture for corn; points above it are dried and docked. */
  baseMoisture: s(15, 'high', 'Standard No. 2 yellow corn moisture basis is 15.0–15.5%'),
  /** Farmer shrink factor per point (pricing); physical water loss is ~1.18%/pt. */
  shrinkFactorPerPoint: s(0.014, 'high', 'Common 1.4% per point moisture shrink'),
  waterLossPerPoint: s(0.0118, 'high', '(1 / (100 − 15)) per point'),
  propaneGalPerBuPoint: s(0.02, 'low'),
  electricityPerBu: s(0.012, 'low', '2024 $ per bushel handled'),
};

export const SHRINK = {
  handlingLoss: s(0.0025, 'medium', 'Handling shrink per bushel shipped'),
  pileMonthlyLossWet: s(0.005, 'low', 'Extra monthly loss on ground-pile bushels in wet months'),
  pileWetMonths: [3, 4, 5, 6, 9, 10, 11],
};

export const OPERATIONS = {
  harvestHoursPerDay: s(12, 'low'),
  harvestDaysPerWeek: s(6.5, 'low'),
  /** Wet corn holding ahead of the dryer, in hours of receiving. */
  wetHoldingHours: s(10, 'low'),
  /** Hours per month the leg is available for truck load-out (normal / harvest). */
  shipHoursPerMonth: s({ normal: 180, harvest: 70 }, 'low'),
  /** Turned-away bushels go to competitors; waits above this many hours cause grievances. */
  waitGrievanceHours: s(1.5, 'low'),
  /** Harvest week utilization above which waits explode: wait ≈ k·u/(1−u). */
  waitK: s(0.6, 'low'),
  maxWaitHours: s(12, 'low'),
  /** Grievance severity per hour of average wait above the threshold, and per share of volume turned away. */
  grievancePerWaitHour: s(0.15, 'low'),
  grievancePerTurnedAway: s(2, 'low'),
  /** Weight of this harvest's worst wait in farmers' memory (EMA, updated each December). */
  waitMemoryWeight: s(0.5, 'low'),
  /** Remembered hours of wait per unit share of volume turned away. */
  turnedAwayWaitEquivalent: s(10, 'low'),
  futuresContractBu: s(5000, 'high', 'CBOT grain contract size'),
};

export const STAFF = {
  fteBase: s(1.0, 'low'),
  ftePerMillionBu: s(2, 'low'),
  /** Labor needed relative to 2024 for the same facility (automation, bigger trucks, electronic scales). */
  laborIntensity: [
    { year: 1970, value: 1.8, confidence: 'low' as const },
    { year: 1990, value: 1.4, confidence: 'low' as const },
    { year: 2010, value: 1.1, confidence: 'low' as const },
    { year: 2024, value: 1.0, confidence: 'low' as const },
  ],
  ftePerTenThousandBuHr: s(0.6, 'low'),
  annualWage: s(50_000, 'low', '2024 $ elevator hand / operator'),
  benefitsRate: s(0.3, 'low'),
  levelFactor: s({ lean: 0.8, standard: 1, full: 1.2 }, 'low'),
  payFactor: s({ below: 0.9, at: 1, above: 1.12 }, 'low'),
  /** Extra wages in harvest months as share of regular wages. */
  harvestOvertime: s(0.35, 'low'),
};

export const FACILITY_COSTS = {
  insuranceRate: s(0.005, 'low', 'Annual property insurance as share of replacement cost'),
  propertyTaxRate: s(0.008, 'low', 'Annual property tax as share of net book value'),
  bondAndIndemnityRate: s(0.002, 'low', 'Annual warehouse bond + indemnity assessment as share of obligations to farmers'),
  /** Weekly breakdown probability in harvest at condition 100; rises as condition falls. */
  breakdownWeekly: s(0.005, 'low'),
  renovateCostShare: s(0.25, 'low', 'Renovation cost as share of replacement cost; restores condition'),
  renovateConditionGain: s(35, 'low'),
  renovationLifeYears: 15,
  renovationMonths: 4,
  /** Monthly chance an undiscovered environmental liability surfaces. */
  envDiscoveryMonthly: s(0.02, 'low'),
  /** Mothballed sites: share of normal repairs and of normal condition decay. */
  mothballRepairShare: s(0.2, 'low'),
  mothballDecayShare: s(0.5, 'low'),
  /** Salvage value when closing a site, as share of depreciated replacement cost. */
  salvageShare: s(0.35, 'low'),
};

export const HEDGING = {
  marginRate: s(0.07, 'medium', 'Initial margin ≈ 5–8% of contract value'),
  slippageSd: s(0.05, 'low', 'Execution error in hedge ratio with the GM covering the desk'),
  defaultPositionLimit: s(25_000, 'low', 'Board limit on net open bushels per commodity'),
  /** Monthly carry captured by hedged storage (2024 $/bu/month), normal market. */
  carryPerMonth: s<Record<Commodity, number>>({ corn: 0.035, soybeans: 0.03, wheat: 0.04 }, 'low'),
  /** Carry shrinks and inverts as price rises above its 3-year average. */
  inversionSlope: s(3, 'low'),
  /** Hold grain when expected monthly storage return exceeds this (2024 $/bu) by carry appetite. */
  carryAppetiteThreshold: s({ low: 0.01, normal: 0, high: -0.01 }, 'low'),
  /** Withdraw excess margin when the account exceeds requirement × trigger, down to × target. */
  marginExcessTrigger: s(1.25, 'low'),
  marginExcessTarget: s(1.1, 'low'),
};

export const SHARE_MODEL = {
  /** Logit scale per 2024 dollar of net price per bushel. */
  theta: s(28, 'low', 'A 5¢ better net price moves roughly a sixth more of the volume'),
  loyalty: s(0.06, 'low', '2024 $/bu equivalent preference of a fully loyal member for their co-op'),
  contractOffered: s(0.006, 'low', '$/bu equivalent per contract type offered'),
  waitPerHour: s(0.012, 'low', '$/bu equivalent per hour of remembered harvest wait'),
  grievance: s(0.012, 'low', '$/bu equivalent per unit of grievance severity'),
  serviceQuality: s(0.03, 'low', '$/bu equivalent for service quality from −1 to +1'),
  inertiaUp: s(0.25, 'low', 'Monthly share adjustment toward target when gaining'),
  inertiaDown: s(0.4, 'low', 'Monthly share adjustment toward target when losing'),
  grievanceDecayMonths: s(24, 'low'),
  /** Hauling direct to a processor or terminal, skipping local elevators ($/bu equivalent; large farms less penalized). */
  outsideOption: s(-0.1, 'low'),
  outsideOptionLarge: s(-0.05, 'low'),
  /** Service effect of facility staffing level (−1..1 scale). */
  staffingService: s({ lean: -0.4, standard: 0, full: 0.3 }, 'low'),
  /** Share-of-wallet gained from bundling is added in M3. */
};

export const MARKETPLACE = {
  initialOffers: 3,
  offersPerYear: s<[number, number]>([1, 2], 'low'),
  offerMonths: 8,
  discount: s<[number, number]>([0.55, 0.85], 'low', 'Motivated-seller price as share of depreciated replacement cost'),
  dueDiligenceCost: s(15_000, 'low', '2024 $'),
  envLiabilityProb: s(0.15, 'low'),
  envLiabilityCost: s<[number, number]>([50_000, 600_000], 'low', '2024 $ cleanup'),
  /** Probability that due diligence finds a hidden liability. */
  diligenceFindProb: s(0.8, 'low'),
  /** When diligence finds contamination, the seller cuts the price by this share of the cleanup cost… */
  sellerCleanupShare: s(0.8, 'low'),
  /** …but not below this share of the asking price. */
  minPriceAfterCleanup: s(0.3, 'low'),
};

/** Elevator size ranges by era, for competitors and facilities offered for sale. */
export const ELEVATOR_SIZES = {
  storageBu: [
    { year: 1970, value: [100_000, 500_000] },
    { year: 1990, value: [300_000, 1_500_000] },
    { year: 2010, value: [800_000, 4_000_000] },
  ],
  receiveBuHr: [
    { year: 1970, value: [2_000, 6_000] },
    { year: 1990, value: [5_000, 15_000] },
    { year: 2010, value: [10_000, 30_000] },
  ],
  dryBuHr: [
    { year: 1970, value: [200, 800] },
    { year: 1990, value: [800, 2_500] },
    { year: 2010, value: [2_000, 6_000] },
  ],
  confidence: 'low' as const,
};

export const COMPETITORS = {
  elevatorProbTown: s(0.5, 'low'),
  elevatorProbSeat: s(0.95, 'low'),
  kindShares: s({ independent: 0.5, coop: 0.4, national: 0.1 }, 'low'),
  /** Price posture spread (2024 $/bu sd) and service quality (−1..1) spread. */
  postureSd: s(0.02, 'low'),
  /** Elevator size relative to the era range, by competitor kind. Retiring independents run smaller, older houses. */
  sizeScale: s({ independent: 0.6, coop: 1.2, national: 2 }, 'low'),
  serviceSd: s(0.35, 'low'),
};

export const SATISFACTION = {
  /** EMA weight of this month's experience. */
  alpha: s(0.1, 'low'),
  pricePerDollar: s(300, 'low', 'Satisfaction points per 2024 $/bu of net price advantage'),
  waitPerHour: s(3, 'low'),
  grievancePerSeverity: s(4, 'low'),
  /** Monthly chance a satisfied non-member customer joins. */
  joinProb: s(0.01, 'low'),
  /** Satisfaction points a fully loyal member gives the co-op regardless of results. */
  loyaltyBonus: s(10, 'low'),
};
