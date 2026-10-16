// Farm supply divisions: agronomy, feed, energy, retail (DESIGN §9.2–9.5).
// Dollar figures are 2024 dollars unless noted. Per-unit margins and fees scale with the grain
// cost index (D-031); product costs come from market series where one exists, otherwise from
// 2024 anchors scaled by CPI. All values are low confidence unless noted.

import type { SeriesId } from './markets';
import { s, type AnnualPoint, type Sourced } from './types';

export type SupplyDivision = 'AGRONOMY' | 'FEED' | 'ENERGY' | 'RETAIL';
export const SUPPLY_DIVISIONS: SupplyDivision[] = ['AGRONOMY', 'FEED', 'ENERGY', 'RETAIL'];
export const DIVISION_LABEL: Record<SupplyDivision | 'GRAIN' | 'CORP', string> = {
  GRAIN: 'Grain', AGRONOMY: 'Agronomy', FEED: 'Feed', ENERGY: 'Energy', RETAIL: 'Retail', CORP: 'Corporate',
};

export type LineId =
  | 'FERT_N' | 'FERT_PK' | 'CROP_PROTECTION' | 'SEED' | 'APPLICATION'
  | 'FEED_SWINE' | 'FEED_DAIRY' | 'FEED_BEEF' | 'FEED_TOLL'
  | 'FUEL_DIESEL' | 'FUEL_GAS' | 'PROPANE' | 'LUBES'
  | 'STATION_FUEL' | 'STORE_INSIDE' | 'FARM_STORE';

const ap = (pts: [number, number][], confidence: 'high' | 'medium' | 'low' = 'low', source?: string): AnnualPoint[] =>
  pts.map(([year, value]) => ({ year, value, confidence, ...(source ? { source } : {}) }));

export interface LineDef {
  id: LineId;
  division: SupplyDivision;
  label: string;
  unit: 'ton' | 'gal' | 'acre' | '$';
  /** How the wholesale cost per unit is set. */
  cost:
    | { kind: 'series'; series: SeriesId[]; weights: number[]; factor: number }
    | { kind: 'ration' }
    | { kind: 'fixed2024'; perUnit: number }
    | { kind: 'service' };
  /** Normal markup. 'pct' of cost, or 2024 $ per unit scaled by the margin index. */
  margin: { kind: 'pct'; value: number } | { kind: 'perUnit'; value: number };
  /** Share of annual demand falling in each month, Jan..Dec (normalized at use). */
  season: number[];
  /** Carried in inventory layers (position business) vs bought as sold. */
  inventory: 'position' | 'flow';
  /** Inventory capacity component and units of capacity per unit of product. */
  storage?: { component: string; perUnit: number };
  /** Share of sales on account (rest cash). */
  creditShare: number;
  availableFrom?: number;
}

const N_SEASON = [0, 0.02, 0.15, 0.3, 0.12, 0.08, 0, 0, 0, 0.13, 0.17, 0.03];
const PK_SEASON = [0, 0.02, 0.15, 0.2, 0.08, 0, 0, 0, 0.05, 0.25, 0.22, 0.03];
const CP_SEASON = [0, 0, 0.05, 0.25, 0.35, 0.25, 0.08, 0.02, 0, 0, 0, 0];
const SEED_SEASON = [0, 0, 0.15, 0.5, 0.33, 0.02, 0, 0, 0, 0, 0, 0];
const FLAT = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
const DIESEL_SEASON = [0.04, 0.04, 0.07, 0.13, 0.13, 0.08, 0.06, 0.06, 0.1, 0.17, 0.09, 0.03];
const RETAIL_SEASON = [0.075, 0.07, 0.08, 0.085, 0.09, 0.09, 0.095, 0.09, 0.085, 0.08, 0.08, 0.08];

export const LINES: Record<LineId, LineDef> = {
  FERT_N: { id: 'FERT_N', division: 'AGRONOMY', label: 'Nitrogen (anhydrous, UAN, urea)', unit: 'ton', cost: { kind: 'series', series: ['anhydrous', 'uan28', 'urea'], weights: [0.6, 0.25 * (0.82 / 0.28), 0.15 * (0.82 / 0.46)], factor: 0.87 }, margin: { kind: 'pct', value: 0.11 }, season: N_SEASON, inventory: 'position', storage: { component: 'dry-fert-plant|nh3-storage|liquid-fert-tanks', perUnit: 1 }, creditShare: 0.7 },
  FERT_PK: { id: 'FERT_PK', division: 'AGRONOMY', label: 'Phosphate & potash', unit: 'ton', cost: { kind: 'series', series: ['dap', 'potash'], weights: [0.5, 0.5], factor: 0.87 }, margin: { kind: 'pct', value: 0.11 }, season: PK_SEASON, inventory: 'position', storage: { component: 'dry-fert-plant', perUnit: 1 }, creditShare: 0.7 },
  CROP_PROTECTION: { id: 'CROP_PROTECTION', division: 'AGRONOMY', label: 'Crop protection', unit: '$', cost: { kind: 'fixed2024', perUnit: 1 }, margin: { kind: 'pct', value: 0.08 }, season: CP_SEASON, inventory: 'flow', creditShare: 0.75 },
  SEED: { id: 'SEED', division: 'AGRONOMY', label: 'Seed', unit: '$', cost: { kind: 'fixed2024', perUnit: 1 }, margin: { kind: 'pct', value: 0.1 }, season: SEED_SEASON, inventory: 'flow', creditShare: 0.75 },
  APPLICATION: { id: 'APPLICATION', division: 'AGRONOMY', label: 'Custom application', unit: 'acre', cost: { kind: 'service' }, margin: { kind: 'perUnit', value: 9 }, season: [0, 0, 0.12, 0.25, 0.25, 0.12, 0.04, 0, 0, 0.1, 0.12, 0], inventory: 'flow', creditShare: 0.8 },
  FEED_SWINE: { id: 'FEED_SWINE', division: 'FEED', label: 'Swine feed', unit: 'ton', cost: { kind: 'ration' }, margin: { kind: 'perUnit', value: 45 }, season: FLAT, inventory: 'flow', creditShare: 0.85 },
  FEED_DAIRY: { id: 'FEED_DAIRY', division: 'FEED', label: 'Dairy feed', unit: 'ton', cost: { kind: 'ration' }, margin: { kind: 'perUnit', value: 45 }, season: FLAT, inventory: 'flow', creditShare: 0.85 },
  FEED_BEEF: { id: 'FEED_BEEF', division: 'FEED', label: 'Beef feed & supplements', unit: 'ton', cost: { kind: 'ration' }, margin: { kind: 'perUnit', value: 55 }, season: [1.3, 1.3, 1.2, 1, 0.8, 0.7, 0.7, 0.7, 0.8, 1, 1.2, 1.3], inventory: 'flow', creditShare: 0.85 },
  FEED_TOLL: { id: 'FEED_TOLL', division: 'FEED', label: 'Toll milling for integrators', unit: 'ton', cost: { kind: 'service' }, margin: { kind: 'perUnit', value: 15 }, season: FLAT, inventory: 'flow', creditShare: 1 },
  FUEL_DIESEL: { id: 'FUEL_DIESEL', division: 'ENERGY', label: 'Farm diesel (delivered)', unit: 'gal', cost: { kind: 'series', series: ['diesel'], weights: [1], factor: 1 }, margin: { kind: 'perUnit', value: 0.28 }, season: DIESEL_SEASON, inventory: 'flow', creditShare: 0.6 },
  FUEL_GAS: { id: 'FUEL_GAS', division: 'ENERGY', label: 'Farm gasoline (delivered)', unit: 'gal', cost: { kind: 'series', series: ['gasoline'], weights: [1], factor: 1 }, margin: { kind: 'perUnit', value: 0.28 }, season: DIESEL_SEASON, inventory: 'flow', creditShare: 0.6 },
  PROPANE: { id: 'PROPANE', division: 'ENERGY', label: 'Propane (heating & crop drying)', unit: 'gal', cost: { kind: 'series', series: ['propane'], weights: [1], factor: 1 }, margin: { kind: 'perUnit', value: 0.85 }, season: FLAT, inventory: 'position', storage: { component: 'propane-storage', perUnit: 1 }, creditShare: 0.5 },
  LUBES: { id: 'LUBES', division: 'ENERGY', label: 'Lubricants', unit: '$', cost: { kind: 'fixed2024', perUnit: 1 }, margin: { kind: 'pct', value: 0.2 }, season: DIESEL_SEASON, inventory: 'flow', creditShare: 0.6 },
  STATION_FUEL: { id: 'STATION_FUEL', division: 'RETAIL', label: 'Station fuel', unit: 'gal', cost: { kind: 'series', series: ['gasoline', 'diesel'], weights: [0.8, 0.2], factor: 1 }, margin: { kind: 'perUnit', value: 0.2 }, season: RETAIL_SEASON, inventory: 'flow', creditShare: 0.1 },
  STORE_INSIDE: { id: 'STORE_INSIDE', division: 'RETAIL', label: 'C-store inside sales', unit: '$', cost: { kind: 'fixed2024', perUnit: 1 }, margin: { kind: 'pct', value: 0.43 }, season: RETAIL_SEASON, inventory: 'flow', creditShare: 0 },
  FARM_STORE: { id: 'FARM_STORE', division: 'RETAIL', label: 'Farm & home store', unit: '$', cost: { kind: 'fixed2024', perUnit: 1 }, margin: { kind: 'pct', value: 0.33 }, season: [0.06, 0.06, 0.09, 0.11, 0.11, 0.09, 0.08, 0.08, 0.08, 0.09, 0.08, 0.07], inventory: 'flow', creditShare: 0.4 },
};
export const LINE_IDS = Object.keys(LINES) as LineId[];
export const LINES_BY_DIVISION = (d: SupplyDivision): LineId[] => LINE_IDS.filter((id) => LINES[id].division === d);
export const LINE_CONFIDENCE = s('see LINES', 'low', 'Cost factors (dealer cost vs USDA retail price), markups and seasonality are estimates');

// ---------------- Demand drivers ----------------

export const AGRONOMY_DEMAND = {
  /** N line is priced per ton of anhydrous-equivalent N: UAN and urea prices are scaled by N content (82% vs 28% / 46%). */
  /** Pounds of N per acre on corn; wheat gets wheatNShare of it; soybeans none. */
  nLbsPerAcreCorn: ap([[1970, 105], [1980, 135], [1990, 140], [2000, 150], [2010, 160], [2020, 170]], 'medium', 'USDA ERS fertilizer use, Corn Belt (approx.)'),
  wheatNShare: s(0.55, 'low'),
  /** Tons of nitrogen product (anhydrous-equivalent) per pound of N. */
  tonsPerLbN: s(1 / (0.82 * 2000), 'high', 'Anhydrous is 82% N'),
  /** Tons of P&K product per acre per year (applied about every other year). */
  pkTonsPerAcre: s({ corn: 0.09, soybeans: 0.07, wheat: 0.05, other: 0.02 }, 'low'),
  /** Crop protection and seed spend per acre in 2024 dollars, and the real spending trend. */
  cpPerAcre2024: s({ corn: 70, soybeans: 55, wheat: 25, other: 10 }, 'low'),
  cpRealIndex: ap([[1970, 0.35], [1980, 0.6], [1990, 0.75], [2000, 0.8], [2010, 0.9], [2024, 1]]),
  seedPerAcre2024: s({ corn: 130, soybeans: 65, wheat: 35, other: 20 }, 'low'),
  seedRealIndex: ap([[1970, 0.25], [1985, 0.35], [1995, 0.45], [2000, 0.65], [2010, 0.95], [2024, 1]], 'low', 'Biotech traits from 1996 raised seed cost per acre sharply'),
  /** Share of seed bought through local retailers (the rest direct from seed company dealers). */
  seedRetailShare: s(0.4, 'low'),
  /** Share of acres custom-applied by a retailer, and passes per acre. */
  customShare: ap([[1970, 0.15], [1990, 0.35], [2010, 0.5], [2024, 0.55]]),
  passesPerAcre: s(1.6, 'low'),
  /** Acres per workable day per application rig (machines got much bigger). */
  acresPerRigDay: ap([[1970, 150], [1990, 300], [2010, 650], [2024, 750]]),
  /** Grievance severity per share of booked acres applied late. */
  lateGrievance: s(3, 'low'),
};

export const FEED_DEMAND = {
  /** Manufactured feed bought per head of inventory per year (tons). */
  tonsPerHead: s({ hogs: 1.0, dairy: 2.4, beefCows: 0.15, cattleOnFeed: 0.6, poultry: 0 }, 'low'),
  /** Share of feed bought as manufactured feed vs mixed on the farm. */
  manufacturedShare: ap([[1970, 0.35], [1990, 0.5], [2010, 0.7], [2024, 0.72]]),
  /** Ration: share of a ton that is corn and soybean meal; the rest is premix at a 2024 $ cost per ton of feed. */
  cornShare: s(0.68, 'low'),
  mealShare: s(0.22, 'low'),
  premixPerTon2024: s(40, 'low'),
  distillersShare: s(0.1, 'low', 'From the mid-2000s DDGS replaces part of the corn'),
  distillersFrom: 2006,
  /** Pelleting adds this margin per ton (2024 $) on the share of tons pelleted. */
  pelletPremium: s(10, 'low'),
  pelletShare: s(0.4, 'low'),
  /** Toll milling volume offered by integrators as share of spare mill capacity, from this year. */
  tollFrom: 1990,
  tollSpareShare: s(0.5, 'low'),
  tollCancelMonthly: s(0.012, 'low', 'Concentration risk: the integrator can pull the contract'),
  /** Mill power and supplies per ton (2024 $), and bulk delivery cost per ton: base + per average mile. */
  powerPerTon2024: s(4, 'low'),
  deliveryPerTon2024: s(6, 'low'),
  deliveryPerTonMile2024: s(0.15, 'low'),
};

export const ENERGY_DEMAND = {
  dieselPerAcre: ap([[1970, 5.5], [1990, 4.5], [2010, 3.8], [2024, 3.5]]),
  gasolinePerAcre: ap([[1970, 3], [1980, 2], [1990, 0.8], [2010, 0.3], [2024, 0.25]]),
  /** Propane per farm household per heating degree day, and rural non-farm households per town resident. */
  propanePerHdd: s(0.11, 'low', '~650 gal/yr in a 6,000 HDD climate'),
  ruralHouseholdsPerResident: s(0.15, 'low', 'Propane-heated households around a town, per town resident'),
  /** Crop drying: gallons per bushel per point of moisture removed, for corn dried on the farm. */
  dryingGalPerBuPoint: s(0.02, 'low'),
  lubesPerAcre2024: s(2, 'low'),
  /** Propane prebuy: share of winter demand customers lock in Jul–Sep at the summer price. */
  prebuyShare: s(0.35, 'low'),
  /** Delivery cost per gallon (2024 $): base plus per average mile from the plant. */
  deliveryBase: s(0.05, 'low'),
  deliveryPerMile: s(0.004, 'low'),
  /** Supplier allocation: when propane is this far above its 3-year average, deliveries are cut to `allocation`. */
  shortageRatio: s(1.6, 'low'),
  allocation: s(0.8, 'low'),
  /** Commercial and town delivered fuel (gal per town resident per year, diesel/gasoline). */
  commercialGalPerResident: s(25, 'low', 'Trucking, contractors, schools, rural businesses'),
  /** Monthly tank rent per propane customer (2024 $). */
  tankRent: s(6, 'low'),
  /** Gallons a delivery truck can deliver per month. */
  truckGalPerMonth: ap([[1970, 35_000], [1990, 50_000], [2010, 65_000], [2024, 70_000]]),
};

export const RETAIL_DEMAND = {
  /** Station gallons per town resident per month, and highway traffic multiplier. */
  galPerResident: s(25, 'low'),
  highwayFactor: s(1.6, 'low'),
  /** Inside sales (2024 $) per gallon pumped. */
  insidePerGal: s(1.1, 'low', 'NACS: rural c-stores sell roughly $1–1.5 inside per gallon pumped'),
  /** Farm store spend per farm acre and per town resident per year (2024 $). */
  farmStorePerAcre: s(14, 'low'),
  farmStorePerResident: s(40, 'low'),
  /** Share of retail customers who are members: members in town over households, clamped. */
  memberShareRange: s<[number, number]>([0.05, 0.6], 'low'),
  householdsPerResident: s(0.4, 'low'),
};

// ---------------- Division-level economics ----------------

export interface DivisionConfig {
  /** Logit scale per 1% price advantage. */
  thetaPerPct: Sourced<number>;
  /** Price change of a posture, as % of price (aggressive cuts price). */
  posturePct: Sourced<{ aggressive: number; market: number; premium: number }>;
  /** Utility weights in "% of price" units. */
  loyalty: number;
  serviceQuality: number;
  /** Delivered divisions care little about distance. */
  distancePctPerMile: number;
  outsideOption: number;
  /** How far customers come (miles). */
  reachMiles: number;
}

export const DIVISION_CONFIG: Record<SupplyDivision, DivisionConfig> = {
  AGRONOMY: { thetaPerPct: s(0.35, 'low'), posturePct: s({ aggressive: -3, market: 0, premium: 3 }, 'low'), loyalty: 6, serviceQuality: 3, distancePctPerMile: 0.08, outsideOption: -2, reachMiles: 30 },
  FEED: { thetaPerPct: s(0.4, 'low'), posturePct: s({ aggressive: -3, market: 0, premium: 3 }, 'low'), loyalty: 6, serviceQuality: 3, distancePctPerMile: 0.06, outsideOption: -3, reachMiles: 35 },
  ENERGY: { thetaPerPct: s(0.45, 'low'), posturePct: s({ aggressive: -3, market: 0, premium: 3 }, 'low'), loyalty: 5, serviceQuality: 3, distancePctPerMile: 0.03, outsideOption: -4, reachMiles: 30 },
  RETAIL: { thetaPerPct: s(0.5, 'low'), posturePct: s({ aggressive: -2, market: 0, premium: 2 }, 'low'), loyalty: 1, serviceQuality: 2, distancePctPerMile: 0.5, outsideOption: -1, reachMiles: 12 },
};

export const CREDIT = {
  /** Share of the receivable balance collected each month by credit policy. */
  collectRate: s({ strict: 0.75, normal: 0.6, loose: 0.45 }, 'low'),
  /** Collection rate on older balances, as a multiple of the current-month rate. */
  agingCollect: s({ past30: 1, past60: 0.75, past90: 0.35 }, 'low'),
  harvestCollect: s(0.4, 'low', 'Share of harvest-term balances collected each month Oct–Dec'),
  /** Share of 90+ day balances written off each month. */
  writeOffMonthly: s(0.03, 'low'),
  /** Allowance held against 90+ and 60–90 day balances. */
  allowancePast90: s(0.5, 'low'),
  allowancePast60: s(0.15, 'low'),
  /** Share of agronomy spring credit sales booked on harvest terms, by policy. */
  harvestTermsShare: s({ strict: 0, normal: 0.3, loose: 0.5 }, 'low'),
  /** Annual loss rate on receivables in normal times, by policy; multiplied by farm income stress. */
  lossRate: s({ strict: 0.004, normal: 0.008, loose: 0.018 }, 'low'),
  stressMultiplier: s(6, 'low', 'Bad debt scales up sharply when real net farm income falls (1980s)'),
  /** Share-of-wallet bonus (% of price) for credit terms, times the member's credit need. */
  utility: s({ strict: -1.5, normal: 0, loose: 2 }, 'low'),
  /** Finance charge on past-due balances (annual % over prime). */
  financeChargeSpread: s(6, 'low'),
};

export const PREPAY = {
  /** Months customers prepay spring inputs, and share of spring demand prepaid. */
  months: [12, 1, 2],
  share: ap([[1970, 0.05], [1985, 0.2], [2000, 0.3], [2024, 0.4]]),
  /** December tax-driven prepay is heavier. */
  decemberWeight: s(0.6, 'low'),
  discountPct: s(2, 'low'),
};

export const FILL = {
  /** Fertilizer fill programs: months bought and discount vs replacement cost at the time. */
  summer: { months: [6, 7, 8], discountPct: s(6, 'low') },
  winter: { months: [12, 1, 2], discountPct: s(3, 'low') },
  /** Default share of next season's expected demand bought at each fill. */
  defaultSummerPct: 0.4,
  defaultWinterPct: 0.3,
};

export const REBATES = {
  /** Crop protection manufacturer rebates as % of CP sales, by tier reached (annual volume, 2024 $). */
  tiers: s<[number, number][]>([[0, 0.02], [1_000_000, 0.04], [5_000_000, 0.06], [15_000_000, 0.08]], 'low'),
  paidMonth: 10,
};

/** Competitor dealers by division: chance per town (county seats higher), and national chains by era. */
export const SUPPLY_COMPETITORS = {
  AGRONOMY: { probTown: 0.3, probSeat: 0.8 },
  FEED: { probTown: 0.12, probSeat: 0.5 },
  ENERGY: { probTown: 0.25, probSeat: 0.7 },
  RETAIL: { probTown: 0.5, probSeat: 1 },
  /** Real chains arriving in county seats; arrival year is drawn in this range. */
  chains: [
    { brandId: 'caseys', division: 'RETAIL', kind: 'station', from: 1978, to: 2005, prob: 0.6 },
    { brandId: 'speedway', division: 'RETAIL', kind: 'station', from: 1985, to: 2010, prob: 0.3 },
    { brandId: 'tractor-supply', division: 'RETAIL', kind: 'farmstore', from: 1990, to: 2015, prob: 0.5 },
    { brandId: 'rural-king', division: 'RETAIL', kind: 'farmstore', from: 1995, to: 2018, prob: 0.25 },
    { brandId: 'amerigas', division: 'ENERGY', kind: 'energy', from: 1977, to: 2000, prob: 0.4 },
    { brandId: 'ferrellgas', division: 'ENERGY', kind: 'energy', from: 1970, to: 1995, prob: 0.3 },
    { brandId: 'suburban-propane', division: 'ENERGY', kind: 'energy', from: 1985, to: 2005, prob: 0.2 },
  ] as { brandId: string; division: SupplyDivision; kind: string; from: number; to: number; prob: number }[],
  confidence: 'low' as const,
};

/** Labor: wages for supply divisions (2024 $) by division. */
export const SUPPLY_WAGES = s<Record<SupplyDivision, number>>({ AGRONOMY: 55_000, FEED: 48_000, ENERGY: 52_000, RETAIL: 30_000 }, 'low');

/** Facility running costs for supply sites besides staff and repairs (2024 $ per year). */
export const SITE_UTILITIES = s<Record<string, number>>({ agronomy: 30_000, feedmill: 60_000, energy: 12_000, station: 40_000, farmstore: 25_000 }, 'low');
/** Extra wages in busy months as share of regular wages, by division. */
export const SEASONAL_OVERTIME = s<Record<SupplyDivision, { months: number[]; share: number }>>({
  AGRONOMY: { months: [3, 4, 5, 10, 11], share: 0.35 },
  FEED: { months: [], share: 0 },
  ENERGY: { months: [10, 11, 12, 1, 2], share: 0.2 },
  RETAIL: { months: [5, 6, 7, 8], share: 0.1 },
}, 'low');

export const CROSS_DIVISION = {
  /** A second site of ours in the same town shares the manager, office and yard: base staff and site utilities are cut by this share. */
  sharedSiteSaving: s(0.5, 'low'),
  /** Share-of-wallet bonus (% of price) per other division the farmer already buys from us (diminishing: × sqrt(n)). */
  bundlePct: s(2, 'low'),
  /** Bonus (% of price) when the farmer's nearest location of ours is full-service (3+ divisions in town). */
  fullServicePct: s(1.5, 'low'),
  /** A grievance in one division counts this much in the others. */
  grievanceSpillover: s(0.3, 'low'),
  /** Share of a division's business counted as "buying from us" for bundling. */
  bundleThreshold: 0.25,
};

/** Share-of-wallet mechanics shared by supply divisions. */
export const SUPPLY_SHARE = {
  /** Service effect of facility staffing level (−1..1 scale). */
  staffingService: s({ lean: -0.4, standard: 0, full: 0.3 }, 'low'),
  /** Monthly adjustment toward target share when gaining / losing. */
  inertiaUp: s(0.2, 'low'),
  inertiaDown: s(0.35, 'low'),
  /** Utility (% of price) lost per unit of remembered late application share. */
  lateServicePenalty: s(3, 'low'),
  /** Utility (% of price) lost per unit of grievance severity. */
  grievancePct: s(2, 'low'),
  /** EMA weight of this month's late-application share in customers' memory. */
  lateMemoryWeight: s(0.15, 'low'),
  /** Share of late application acres below which nobody complains. */
  lateTolerance: s(0.02, 'low'),
  /** Toll-milling offers: needed spare capacity share and monthly chance an integrator offers. */
  tollSpareNeeded: s(0.2, 'low'),
  tollOfferMonthly: s(0.05, 'low'),
  /** Share of a farm's annual propane that is winter heating (Oct–Mar), for prebuy sizing. */
  propaneWinterShare: s(0.7, 'low'),
  /** Average share of corn dried on the farm (drying propane demand). */
  onFarmDryingShare: s(0.5, 'low'),
  /** Normal annual heating degree days used to size town propane prebuy. */
  normalHdd: s(6000, 'low'),
  /** Prebuy deliveries per month as a multiple of the prebuy share of that month's sales. */
  prebuyDeliveryPace: s(1.0, 'low'),
};
