// The farm economy around the co-op (D-132): local weather, planting decisions, input demand
// that answers to prices and farm income, livestock cycles, retail prices that lag wholesale,
// and grain margins that follow the size of the crop. All low or medium confidence: they are
// calibrated to the size of swings seen in USDA county data and co-op annual reports, not
// estimated from them.

import { s } from './types';

export const LOCAL_CROP = {
  /** Territory yield shock against the region's (sd of the share): a few counties share weather. */
  territorySd: s(0.08, 'low', 'County corn yields vary ~15% a year against ~10% for a state; a territory sits between'),
  /** Each county's own shock on top. */
  countySd: s(0.06, 'low'),
  /** Chance a year brings a local disaster to one county, and the yield it takes. */
  disasterProb: s(0.12, 'low', 'Hail, a dry pocket, flooding or a derecho somewhere in a territory about one year in eight'),
  disasterCut: s<[number, number]>([0.15, 0.4], 'low'),
  /** Floor on a county's yield factor. */
  floor: 0.3,
  /** How far off July's crop-condition estimate can be (sd of the share). */
  julyEstimateSd: s(0.05, 'low'),
};

export const PLANTING = {
  /** Corn share of corn+soybean acres moves this many points per 1.0 rise in the soybean:corn price ratio above its 10-year norm. */
  cornShareSlope: s(-0.15, 'low', 'Acreage response: a 2.8 ratio against a 2.4 norm moves ~6 points of acres to soybeans'),
  maxShift: 0.1,
};

export const INPUT_DEMAND = {
  /** Nitrogen rate elasticity to the anhydrous:corn price ratio against its 10-year norm. */
  nElasticity: s(-0.2, 'low', 'Short-run N demand elasticity −0.1 to −0.3; economic optimum rates move with the price ratio'),
  nBounds: [0.85, 1.1] as [number, number],
  /** P&K and lime follow farm income: farmers skip them in lean years and catch up in good ones. */
  pkElasticity: s(0.6, 'low', 'P&K sales fell ~15% in 2015–16 and more in the mid-1980s when income fell'),
  pkBounds: [0.65, 1.15] as [number, number],
  cpElasticity: s(0.15, 'low'),
  cpBounds: [0.9, 1.05] as [number, number],
};

export const LIVESTOCK_CYCLE = {
  /** Herds follow profitability a year earlier: output price over feed (corn) price against its 10-year norm. */
  lagMonths: 12,
  hogs: s({ elasticity: 0.35, bound: 0.2 }, 'low', 'The hog cycle: sow herds expand 1–2 years after good hog:corn ratios and liquidate after poor ones'),
  dairy: s({ elasticity: 0.12, bound: 0.08 }, 'low'),
  beefCows: s({ elasticity: 0.1, bound: 0.08 }, 'low'),
  cattleOnFeed: s({ elasticity: 0.3, bound: 0.18 }, 'low'),
};

/**
 * Retail prices follow wholesale with a lag (months averaged), so a wholesale spike squeezes
 * the margin and a drop widens it. Averages are taken in real terms, so inflation alone
 * does not thin margins.
 */
export const PRICE_LAG = s<Record<string, number>>({
  FUEL_DIESEL: 2, FUEL_GAS: 1, PROPANE: 2, LUBES: 3, FERT_N: 4, FERT_PK: 4, FEED_SWINE: 1, FEED_DAIRY: 1, FEED_BEEF: 1,
}, 'low', 'Posted prices lag replacement cost: weeks for fuel, a season for fertilizer');

export const CROP_SIZE = {
  /** Harvest basis swing scales with the local crop against trend: a big crop widens the harvest discount and its recovery. */
  basisSeasonSlope: s(1.5, 'low', 'Record crops (2004, 2014) brought wide harvest basis and strong storage returns; short crops (1983, 1988, 2012) the reverse'),
  basisBounds: [0.4, 2] as [number, number],
  /** Futures carry scales with the regional crop against trend. */
  carrySlope: s(2, 'low'),
  carryBounds: [0.3, 1.8] as [number, number],
  /** The local elevator margin scales with the local crop against trend. */
  marginSlope: s(1.5, 'low', 'Elevator margins widen in big crops (farmers must sell, space is short) and compress in short ones'),
  marginBounds: [0.4, 1.8] as [number, number],
  /** Years of yields a trend is fitted to. */
  trendYears: 8,
};

export const LOCAL_STRESS = {
  /** Farm stress added per share of the territory's crop lost against trend (credit losses). */
  perShortfall: s(1.5, 'low', 'A local drought hurts local farm finances more than national income shows'),
  /** A crop this far below trend is shrugged off (crop insurance, a normal bad year). */
  tolerance: s(0.03, 'low'),
};

/** Months of the farm-economy reports in the inbox. */
export const ECONOMY_REPORTS = { planting: 3, conditions: 7, harvest: 11 };
