// Sugar beets (D-133): growing, storing and processing beets into sugar, pulp and molasses at a
// co-op factory fed by piling stations, with growers paid per ton and through patronage.
// Numbers from docs/research/sugar.md (USDA ERS, extension, co-op reports); most are low or
// medium confidence.

import { s, type AnnualPoint } from './types';

const ap = (pts: [number, number][], confidence: 'high' | 'medium' | 'low', source?: string): AnnualPoint[] =>
  pts.map(([year, value], i) => ({ year, value, confidence, ...(i === 0 && source ? { source } : {}) }));

export const SUGAR = {
  /** Growers haul beets to a piling station or the factory within this distance (miles). */
  reachMiles: s(30, 'medium', 'Receiving stations are spaced so most growers haul 10–30 miles'),
  /** Beets take at most this share of a grower's row-crop acres (rotation: one year in three or four). */
  maxRotationShare: s(0.25, 'medium', 'Beets one year in three to four to manage disease (Cercospora, Rhizoctonia, nematodes)'),
  /** Beet yield in the eastern Corn Belt / Great Lakes beet country, tons an acre. */
  yieldTonsPerAcre: ap([[1970, 17], [1982, 18.5], [2002, 22], [2010, 25], [2023, 31]], 'medium', 'American Crystal 17.5 t/a (1982), US 22.1 (2000–05), American Crystal ~32 (2023–24); Michigan historically 15–20'),
  /** Sugar content at harvest, % of beet weight, and its year-to-year spread. */
  sugarPct: ap([[1970, 15.5], [1990, 16.5], [2010, 17.5], [2023, 18.3]], 'medium', 'American Crystal 18.5% sugar in 2023–24'),
  sugarPctSd: s(0.7, 'low'),
  /** A wet fall lowers sugar content (points). */
  wetFallSugarPenalty: s(0.6, 'low'),
  /** Grower's cost to raise an acre of beets, 2024 $ (seed, fertilizer, chemicals, harvest, land charge excluded). */
  growerCostPerAcre2024: s(1350, 'medium', 'NDSU/U of M budgets: $472 (1976/77), $1,099 (2018), $1,350 (2022), $1,563 (2024) per acre'),
  /** Harvest: pre-pile in September (sliced at once), the main harvest in October. */
  harvest: { prepileMonth: 9, prepileShare: s(0.15, 'medium'), mainMonth: 10 },
  /** Harvest days a piler works in the months it is open. */
  pilerDays: { 9: 8, 10: 24 } as Record<number, number>,
  /** Sugar lost from piled beets each month as a share of the sugar in them, by calendar month (warm months worst). */
  pileSugarLossPerMonth: s([0.008, 0.008, 0.012, 0.025, 0.04, 0.06, 0.07, 0.07, 0.035, 0.025, 0.015, 0.01], 'medium', 'Piles lose 0.2–0.5 lb sucrose/ton/day (under 0.13 chilled and sound, ~1.1 damaged) out of ~330 lb a ton'),
  /** Weight shrink of piled beets per month. */
  pileShrinkPerMonth: s(0.004, 'low'),
  /** Ventilated piles keep this share of the losses. */
  ventilatedLossShare: s(0.6, 'low', 'Forced-air ventilation cools piles and cuts respiration losses'),
  /** Beets still piled at the end of this month are written off. */
  campaignEndMonth: 5,
  /** Months the factory slices: from the pre-pile harvest until the piles are gone (or spoil). */
  campaignMonths: [9, 10, 11, 12, 1, 2, 3, 4, 5],
  /** Share of a month the factory runs during the campaign (maintenance stops, breakdowns). */
  uptime: s(0.92, 'medium'),
  /** Share of the sugar in sliced beets recovered as sugar, before desugarization. */
  extraction: ap([[1970, 0.79], [1990, 0.81], [2010, 0.82]], 'medium', 'USDA recovery ~15.0–15.35% of beet weight (2020s) at ~18% sugar; 10–15% of the sugar is lost to molasses without desugarization'),
  /** Molasses desugarization recovers this much more of the sugar in beets. */
  desugarizationGain: s(0.06, 'medium', 'Chromatographic separators recover 81–88% of the sugar in molasses; first US plant at Renville 1989'),
  /** Co-products per ton of beets sliced. */
  pulpTonsPerTon: s(0.05, 'medium', 'Dried pulp pellets ~100 lb per ton of beets'),
  molassesTonsPerTon: s(0.0375, 'medium', '~75 lb molasses per ton of beets'),
  /** Desugarization takes this share of the molasses. */
  desugarizedMolassesShare: s(0.7, 'low'),
  /** Wet pulp sold without drying fetches this share of pellet value. */
  wetPulpValueShare: s(0.35, 'low'),
  /** Processing inputs per ton sliced: natural gas (MMBtu), lime rock, coke, chemicals and supplies (2024 $). */
  energyMmbtuPerTon: ap([[1970, 1.6], [1990, 1.3], [2010, 1.1]], 'low', '140–200 kWh of heat per tonne before pulp drying, which can be up to half of factory energy'),
  suppliesPerTon2024: s(12, 'low', 'Lime rock and coke (~0.25 t limestone per t sugar), chemicals, packaging; processing runs ~$35–45/t all in (2020)'),
  /** Seasonal campaign crew per 1,000 tons a day of slicing, FTE during campaign months. */
  campaignFtePer1000Tpd: s(15, 'low', 'American Crystal: ~1,400 full-time and ~900 seasonal staff across six factories slicing ~13M tons'),
  campaignWage2024: s(52_000, 'low'),
  /** Year-round factory and station wage, 2024 $. */
  yearRoundWage2024: s(62_000, 'low', 'Unionized factory trades and operators'),
  /** Hauling beets from piling stations to the factory, 2024 $ per ton-mile and per ton. */
  haulPerTonMile2024: s(0.14, 'medium', 'Co-op hauling allowances of $0.058–0.079/ton-mile (2025) are set at half the commercial rate'),
  haulPerTon2024: s(2, 'low'),
  /** Selling through a marketing agency: share of sugar revenue. */
  marketingCostPct: s(0.04, 'low'),
  /** Grower payment at delivery as a share of the product value of a ton (sugar at its content, pulp, molasses). */
  defaultGrowerShare: 0.5,
  /** What grower co-ops pay out in all (delivery payments plus patronage), as a share of a ton's product value; growers count on it before there is a record. */
  growerNetShare: s(0.65, 'low', 'American Crystal paid ~$70–83/ton (2022–24) against ~$110–130 of sugar, pulp and molasses at wholesale less freight'),
  growerShareBounds: [0.35, 0.7] as [number, number],
  /** Paying from proceeds: margin of sales the co-op keeps when it resets the share. */
  /** Paying from proceeds: the most the share rises in a year (points of value). */
  proceedsMaxRaise: s(0.04, 'low'),
  /** Delivery share a sugar co-op founded at game start begins with. */
  foundingGrowerShare: 0.45,
  proceedsMargin: s(0.04, 'low', 'Beet co-ops pay growers nearly all net proceeds, keeping a little for reserves and debt service'),
  /** Growers sign up when beets beat corn; this many points of willingness per unit of the ratio of returns above 0.8. */
  signupSlope: s(0.7, 'low'),
  /** Corn's return over direct costs per acre against its gross value (to compare with beets). */
  cornNetShare: s(0.35, 'low'),
  /** Pulp pellets trade at this share of corn's value per ton. */
  pulpCornRatio: s(0.9, 'medium', 'Pellets $140/ton (2019) to $220/ton (2020), near corn on a feeding-value basis'),
  /** Molasses, 2024 $ per ton. */
  molasses2024: s(120, 'low'),
  /** Sugar kept in silos beyond capacity must be sold at once at this discount. */
  overflowDiscount: s(0.05, 'low'),
  /**
   * Beet shares (delivery-right preferred stock). Growers buy a share for each acre they want to
   * grow; it is how grower co-ops financed buying or building factories. Growers subscribe when
   * a share pays back quickly against beets' advantage over corn: all in at this many years or
   * fewer, none at the upper figure.
   */
  sharePaybackYears: s<[number, number]>([1.5, 7], 'low', 'American Crystal shares traded at $3,778–5,400 an acre (2011–24) against ~$1,000+ a year of beet returns over direct costs'),
  /** Months between share drives. */
  shareDriveGapMonths: 12,
  /** Capacity each lime kiln, boiler and pulp dryer unit supports, tons of beets a day. */
  kilnTpd: s(6000, 'low'),
  boilerTpd: s(4500, 'low'),
};

/**
 * Paying growers and financing the crop (D-135). Beet co-ops pay growers in installments: an
 * initial payment at delivery, more as the sugar is sold, the rest after the books close; the
 * unpaid part is owed to growers. Sugar in store is pledged for USDA CCC nonrecourse loans at the
 * loan rate, and forfeited to the CCC when the market falls below it. Lenders advance more on
 * refined sugar than on other inventory.
 */
export const SUGAR_FINANCE = {
  /** Share of a delivery's payment made at delivery; the rest is paid monthly through August. */
  initialPaymentShare: s(0.6, 'medium', 'American Crystal: initial payment at delivery, then monthly payments (60% → 85% of the estimate) and a final payment after year end'),
  /** Last month of the year's grower payments. */
  finalPaymentMonth: 8,
  /** CCC loan rate for refined beet sugar, $/cwt (¢/lb); 0 when there was no loan program. */
  loanRate: ap([
    [1976, 0], [1977, 16], [1978, 16], [1979, 0], [1981, 0], [1982, 20.2], [1985, 21.6], [1996, 22.9], [2008, 22.9], [2009, 23.77],
    [2012, 24.09], [2017, 24.09], [2018, 25.38], [2024, 25.38], [2025, 32.77],
  ], 'medium', 'Refined beet loan rate: 22.9¢ (2002 Farm Bill), 25.38¢ (2018), 32.77¢ (2025); loan programs 1977–78 and from 1982'),
  /** A non-member farm is this much less ready than a member to sign a beet contract, which means joining the co-op (D-136). */
  nonmemberJoinShare: s(0.5, 'low'),
  /** CCC loans are charged the Treasury rate plus this many points. */
  cccSpread: s(1, 'low', 'CCC commodity loans: Treasury cost of funds plus 1 point'),
  /** Borrowing base advance on refined sugar (net of CCC loans on it) and on beets in the piles. */
  sugarAdvance: s(0.85, 'low', 'Refined sugar is a graded, readily sold commodity'),
  beetAdvance: s(0.6, 'low'),
};

/** The beet share market among growers (D-137). */
export const SHARE_MARKET = {
  /** A share is worth this many years of beets' advantage over corn per acre. */
  paybackYears: s(3.5, 'low', 'American Crystal shares traded at $3,778–5,400 an acre (2011–24) against roughly $1,000–1,500 an acre of beet returns over direct costs'),
  /** Each year the price moves this far toward that value, and with the balance of buyers and sellers. */
  anchorWeight: s(0.4, 'low'),
  imbalanceSlope: s(0.3, 'low'),
  /** Chance an active shareholder sells part of their shares in a year for ordinary reasons, and the part. */
  annualTurnover: s(0.06, 'low', 'Estate planning, reorganizing a farm, trimming acres'),
  turnoverSellShare: s(0.5, 'low'),
  /** Holders sell shares beyond this multiple of the rotation acres they could plant. */
  excessHolding: s(1.2, 'low'),
  /** Share of their rotation room a grower buys in a year when a share costs what it earns, and the most. */
  buyShareAtValue: s(0.15, 'low'),
  maxBuyShare: s(0.5, 'low'),
  /** Floor on the price, 2024 $. */
  minPrice: s(25, 'low'),
};

/** Sugar field staff and the campaign crew (D-135). */
export const SUGAR_STAFF = {
  /** Agriculturists: field staff who contract growers, advise on seed, disease and harvest timing, and run the piling grounds. */
  agriculturistWage2024: s(72_000, 'low', 'Beet co-op agriculturists, mid-2020s'),
  agriculturistExpense2024: s(16_000, 'low', 'Pickup, phone and travel'),
  growersPerAgriculturist: s(70, 'low', 'An agriculturist works with roughly 50–100 growers'),
  maxAgriculturists: 60,
  /** At full coverage: tons per acre, sugar content (points), sign-up willingness and pile losses. */
  maxYieldGain: s(0.05, 'low', 'Variety choice, Cercospora control and harvest timing'),
  maxSugarGain: s(0.3, 'low'),
  maxSignupGain: s(0.1, 'low'),
  maxPileLossCut: s(0.2, 'low', 'Pile management: piling temperatures, ventilation, early slicing of damaged beets'),
  /** Campaign crew level: factory uptime (points) and crew cost. */
  crew: s<Record<'lean' | 'standard' | 'full', { uptime: number; cost: number }>>({ lean: { uptime: -0.03, cost: 0.85 }, standard: { uptime: 0, cost: 1 }, full: { uptime: 0.02, cost: 1.15 } }, 'low', 'Short crews mean more downtime and slower restarts'),
};


/**
 * Refined beet sugar, Midwest wholesale, $ per cwt (annual). Used for the "sugar" market series
 * (markets.ts). Beet sugar sells a little under cane in the Midwest.
 */
export const SUGAR_PRICE_SOURCE = 'USDA ERS Sugar and Sweeteners Yearbook, Midwest refined beet sugar wholesale';

/**
 * The investor-owned sugar company in the territory (D-133). Through the 1970s–2000s most U.S.
 * beet factories passed from investor-owned companies to grower co-ops (American Crystal 1973,
 * Amalgamated 1997, Michigan Sugar and Western Sugar 2002) or closed. Every game has one such
 * fictional company that sells out to growers or shuts its factory.
 */
export const SUGAR_COMPANY = {
  names: ['Northern Beet Sugar Company', 'Lakeshore Sugar Company', 'Prairie Star Sugar Company', 'Wolf River Sugar Company', 'Maple Valley Sugar Company'],
  /** Years after the game starts that the company decides to sell. */
  saleAfterYears: [3, 14] as [number, number],
  /** Asking price against the used value of the plants: sellers who would otherwise close. */
  priceShare: s<[number, number]>([0.2, 0.4], 'low', 'Growers bought American Crystal for $86M (1973) and Michigan Sugar\'s four factories for $45M plus $18.5M of debt (2002)'),
  /** Months the sale stays open before the factory closes. */
  offerMonths: 12,
  /** The factory's first campaign and the condition of its plants when offered. */
  builtYear: [1905, 1955] as [number, number],
  condition: [45, 75] as [number, number],
  stations: 2,
  stationMiles: [10, 28] as [number, number],
  /** A sugar co-op founded at game start (D-134): working cash raised with the shares, as a share of the price. */
  /** Share of the founding purchase financed with a term loan. */
  foundingFinancePct: s(0.6, 'low', 'Co-op lenders financed grower purchases of factories against beet shares and the plants'),
  /** Names growers gave sugar co-ops ({town}, {county}). */
  namePatterns: ['{county} Beet Growers Cooperative', '{town} Sugar Cooperative', '{county} Sugar Beet Growers Association', '{town} Valley Sugar Cooperative', 'Growers\' Sugar Cooperative of {county} County'],
  /** Sugar taken over with a factory is valued at the growers' share of its price plus this much for processing. */
  takeoverProcessingShare: s(0.12, 'low'),
  foundingWorkingCash: s(0.15, 'low', 'Enough to carry the first months before the seasonal line is set to the crop'),
};
