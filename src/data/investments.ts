// Larger ag businesses a local co-op can take an equity stake in (D-112). All the plants are
// fictional; returns are on the stake (return on equity), by year where the industry's good and
// bad years are known, otherwise the long-run mean with seeded noise. Dollar amounts are 2024
// dollars. Sources: farmdoc daily ethanol and biodiesel profitability models (Univ. of Illinois),
// Iowa State Ag Decision Maker, USDA ERS, trade press on farmer-owned plants; magnitudes to tune.

import { s, type Sourced } from './types';

export type InvestmentType = 'ethanol' | 'biodiesel' | 'soyCrush' | 'shuttle' | 'packing' | 'wind' | 'sugar';

export interface InvestmentDef {
  label: string;
  /** Name pattern; {t} is a town in the territory. */
  names: string[];
  description: string;
  /** Years when new stakes are offered, and the yearly chance of an offer in those years. */
  windows: { from: number; to: number; prob: number }[];
  /** Stake a co-op can take (2024 $). */
  minStake: number;
  maxStake: number;
  /** Total equity in the plant (2024 $), for our share. */
  plantEquity: number;
  /** Long-run return on equity and its year-to-year spread. */
  mean: number;
  sd: number;
  /** Known industry years (return on equity). */
  years: Record<number, number>;
  /** Chance a plant fails in a year: base, while young (first `youngYears`), and after a losing year. */
  failure: { young: number; youngYears: number; afterLoss: number };
  /** Division whose investment account carries the stake. */
  division: 'GRAIN' | 'FEED' | 'ENERGY';
}

export const INVESTMENTS: Sourced<Record<InvestmentType, InvestmentDef>> = s({
  ethanol: {
    label: 'Ethanol plant', names: ['{t} Renewable Fuels LLC', '{t} Ethanol LLC', 'Prairie {t} Energy LLC'],
    description: 'A farmer-owned dry-mill ethanol plant: it buys members\' corn and sells ethanol and distillers grains. Profits swing with the corn-ethanol spread.',
    windows: [{ from: 1994, to: 2000, prob: 0.15 }, { from: 2001, to: 2008, prob: 0.6 }, { from: 2009, to: 2025, prob: 0.15 }],
    minStake: 250_000, maxStake: 5_000_000, plantEquity: 120_000_000, mean: 0.1, sd: 0.25,
    years: { 1995: 0.06, 1996: -0.04, 1997: 0.06, 1998: 0.08, 1999: 0.08, 2000: 0.1, 2001: 0.15, 2002: 0.12, 2003: 0.15, 2004: 0.2, 2005: 0.45, 2006: 0.35, 2007: 0.25, 2008: -0.2, 2009: 0.08, 2010: 0.2, 2011: 0.15, 2012: -0.08, 2013: 0.1, 2014: 0.4, 2015: 0.08, 2016: 0.08, 2017: 0.06, 2018: -0.02, 2019: -0.02, 2020: -0.05, 2021: 0.25, 2022: 0.2, 2023: 0.2, 2024: 0.05, 2025: 0.15 },
    failure: { young: 0.01, youngYears: 3, afterLoss: 0.08 }, division: 'GRAIN',
  },
  biodiesel: {
    label: 'Biodiesel plant', names: ['{t} Biofuels LLC', '{t} Soy Energy LLC'],
    description: 'A soybean-oil biodiesel plant. Margins live and die by the federal blender\'s credit, which lapsed and was restored again and again.',
    windows: [{ from: 2004, to: 2008, prob: 0.4 }, { from: 2009, to: 2014, prob: 0.1 }],
    minStake: 200_000, maxStake: 3_000_000, plantEquity: 25_000_000, mean: 0.04, sd: 0.25,
    years: { 2005: 0.1, 2006: 0.25, 2007: 0.25, 2008: 0.05, 2009: -0.2, 2010: -0.13, 2011: 0.4, 2012: 0.05, 2013: 0.3, 2014: -0.08, 2015: -0.13, 2016: 0.15, 2017: 0.05, 2018: 0.1, 2019: 0.2, 2020: 0.2, 2021: 0.2, 2022: 0.2, 2023: 0.05, 2024: -0.2, 2025: -0.05 },
    failure: { young: 0.02, youngYears: 3, afterLoss: 0.1 }, division: 'ENERGY',
  },
  soyCrush: {
    label: 'Soybean crushing plant', names: ['{t} Soy Processors', '{t} Soybean Processing LLC'],
    description: 'A farmer-owned soybean crushing plant selling meal and oil. The 2020s renewable-diesel boom drove record crush margins.',
    windows: [{ from: 1993, to: 2005, prob: 0.12 }, { from: 2021, to: 2025, prob: 0.3 }],
    minStake: 500_000, maxStake: 10_000_000, plantEquity: 250_000_000, mean: 0.11, sd: 0.15,
    years: { 1996: 0.2, 1997: 0.2, 1999: 0, 2000: 0, 2001: 0, 2014: 0.2, 2018: 0.02, 2021: 0.4, 2022: 0.45, 2023: 0.35, 2024: 0.03, 2025: 0.03 },
    failure: { young: 0.01, youngYears: 3, afterLoss: 0.03 }, division: 'GRAIN',
  },
  shuttle: {
    label: 'Shuttle-train loading terminal', names: ['{t} Rail Terminal LLC', '{t} Shuttle Loader JV'],
    description: 'A 110-car shuttle loader owned with neighboring co-ops: it earns the railroads\' unit-train rates on members\' grain.',
    windows: [{ from: 1998, to: 2025, prob: 0.15 }],
    minStake: 1_000_000, maxStake: 15_000_000, plantEquity: 40_000_000, mean: 0.1, sd: 0.05,
    years: { 2007: 0.18, 2008: 0.18, 2012: 0.02, 2013: 0.04, 2014: 0.04, 2018: 0.03, 2019: 0.03, 2020: 0.18, 2021: 0.18 },
    failure: { young: 0, youngYears: 0, afterLoss: 0 }, division: 'GRAIN',
  },
  packing: {
    label: 'Producer-owned packing plant', names: ['{t} Premium Pork', 'Heartland {t} Beef Packers'],
    description: 'A livestock producers\' packing plant with delivery rights. A few have done well; many failed in their first years.',
    windows: [{ from: 1997, to: 2000, prob: 0.15 }, { from: 2006, to: 2008, prob: 0.15 }, { from: 2021, to: 2025, prob: 0.2 }],
    minStake: 100_000, maxStake: 2_000_000, plantEquity: 200_000_000, mean: 0.03, sd: 0.3,
    years: {},
    failure: { young: 0.04, youngYears: 5, afterLoss: 0.06 }, division: 'FEED',
  },
  wind: {
    label: 'Farmer-owned wind project', names: ['{t} Wind LLC', '{t} Community Wind'],
    description: 'Community-owned wind turbines selling power under a long-term contract, with the federal production tax credit.',
    windows: [{ from: 2001, to: 2012, prob: 0.2 }],
    minStake: 250_000, maxStake: 3_000_000, plantEquity: 20_000_000, mean: 0.09, sd: 0.06,
    years: { 2008: 0.15, 2015: 0.04, 2016: 0.04, 2017: 0.04, 2018: 0.04, 2019: 0.04, 2020: 0.04 },
    failure: { young: 0, youngYears: 0, afterLoss: 0 }, division: 'ENERGY',
  },
  sugar: {
    label: 'Sugar beet processing co-op shares', names: ['{t} Sugar Cooperative', 'Valley {t} Beet Sugar'],
    description: 'Shares in a growers\' sugar beet processing co-op, protected by the federal sugar program.',
    windows: [{ from: 1972, to: 2025, prob: 0.05 }],
    minStake: 100_000, maxStake: 1_000_000, plantEquity: 150_000_000, mean: 0.08, sd: 0.1,
    years: { 1985: 0.01, 1986: 0.01, 1999: 0.01, 2000: 0.01, 2011: 0.2, 2012: 0.2 },
    failure: { young: 0, youngYears: 0, afterLoss: 0 }, division: 'GRAIN',
  },
}, 'low', 'farmdoc daily ethanol/biodiesel models; ISU; trade press on farmer-owned plants (see D-112)');

export const INVEST_MARKET = {
  /** Offers stay open this many months. */
  offerMonths: 6,
  maxOpenOffers: 3,
  /** Selling a stake: price as a share of book value, plus this much per point of last year's return. */
  saleBase: s(0.85, 'low'),
  saleReturnFactor: s(1, 'low'),
};
