// Market history, 1970 onward. Annual averages compiled from memory of USDA NASS/ERS,
// CBOT/CME, EIA, Federal Reserve, BLS and ENR publications. Every value is an estimate of
// the calendar-year average and carries a confidence flag. Correct freely: the engine
// rebuilds monthly paths from these anchors (see src/engine/world/markets.ts).

import { annual, type AnnualPoint, type Confidence } from './types';

export type SeriesId =
  | 'corn' | 'soybeans' | 'wheat' | 'soymeal' | 'ddgs'
  | 'hogs' | 'cattle' | 'milk'
  | 'crude' | 'diesel' | 'gasoline' | 'propane' | 'natgas'
  | 'anhydrous' | 'urea' | 'uan28' | 'dap' | 'potash'
  | 'prime' | 'tbill'
  | 'cpi' | 'constructionIndex' | 'landValue' | 'netFarmIncome'
  | 'yieldCorn' | 'yieldSoy' | 'yieldWheat';

export type SeriesGroup = 'grain' | 'livestock' | 'energy' | 'fertilizer' | 'rates' | 'macro' | 'yields';

export interface MarketSeriesDef {
  id: SeriesId;
  label: string;
  unit: string;
  group: SeriesGroup;
  /** How the series behaves month to month. */
  kind: 'price' | 'rate' | 'index' | 'yield';
  decimals: number;
  annual: AnnualPoint[];
  /** Multiplicative Jan..Dec factors (normalized to mean 1 at load). null = none. */
  seasonality: number[] | null;
  /** Monthly log-noise standard deviation for 'drift' mode; strict mode scales it down. */
  noiseSd: number;
  /** First year the series exists (e.g. DDGS). Before that, the series is absent. */
  availableFrom?: number;
  /** Procedural continuation after the data ends. */
  procedural: {
    /** Monthly mean reversion toward the inflation-adjusted long-run mean. */
    reversion: number;
    /** Monthly shock sd (log for prices, points for rates). */
    sd: number;
    /** Factor loadings for correlated shocks (grain, energy, livestock). */
    factor?: 'grain' | 'energy' | 'livestock' | 'fertilizer';
    loading?: number;
  };
  confidenceNote?: string;
}

const NASS = 'USDA NASS prices received / Agricultural Prices (from memory)';
const CBOT = 'CBOT/CME nearby futures, calendar-year average (estimated from memory)';
const ERS_FERT = 'USDA ERS Fertilizer Use and Price, average farm prices (from memory)';
const EIA = 'EIA spot/wholesale price series (from memory)';
const FED = 'Federal Reserve H.15 (from memory)';

const GRAIN_SEASON = [1.0, 1.01, 1.02, 1.03, 1.04, 1.05, 1.04, 1.0, 0.96, 0.94, 0.95, 0.97];
const SOY_SEASON = [1.0, 1.01, 1.02, 1.03, 1.04, 1.05, 1.05, 1.01, 0.97, 0.94, 0.95, 0.98];
const WHEAT_SEASON = [1.02, 1.02, 1.02, 1.01, 1.0, 0.96, 0.95, 0.97, 1.0, 1.01, 1.02, 1.02];
const NITROGEN_SEASON = [1.0, 1.02, 1.05, 1.06, 1.03, 0.97, 0.94, 0.95, 0.97, 0.99, 1.0, 1.0];
const PK_SEASON = [1.0, 1.01, 1.03, 1.03, 1.01, 0.98, 0.97, 0.98, 0.99, 1.0, 1.0, 1.0];

const yrs = (from: number, to: number, confidence: Confidence, source?: string) => ({ from, to, confidence, ...(source ? { source } : {}) });

export const MARKET_SERIES: Record<SeriesId, MarketSeriesDef> = {
  corn: {
    id: 'corn', label: 'Corn futures', unit: '$/bu', group: 'grain', kind: 'price', decimals: 4,
    annual: annual(1970, [
      1.33, 1.30, 1.30, 2.40, 3.20, 2.90, 2.65, 2.20, 2.30, 2.60,
      3.05, 3.20, 2.60, 3.15, 3.05, 2.50, 1.85, 1.75, 2.55, 2.55,
      2.55, 2.45, 2.35, 2.40, 2.45, 2.80, 3.65, 2.75, 2.30, 2.05,
      2.05, 2.05, 2.25, 2.40, 2.55, 2.10, 2.60, 3.85, 5.20, 3.80,
      4.20, 6.65, 6.95, 5.80, 4.10, 3.80, 3.60, 3.60, 3.70, 3.85,
      3.70, 5.80, 6.85, 5.40, 4.25, 4.30,
    ], 'medium', CBOT, [yrs(2005, 2025, 'high')]),
    seasonality: GRAIN_SEASON, noiseSd: 0.045,
    procedural: { reversion: 0.03, sd: 0.055, factor: 'grain', loading: 0.8 },
  },
  soybeans: {
    id: 'soybeans', label: 'Soybean futures', unit: '$/bu', group: 'grain', kind: 'price', decimals: 4,
    annual: annual(1970, [
      2.85, 3.20, 3.70, 6.80, 7.10, 5.70, 6.20, 7.40, 6.70, 7.20,
      7.40, 7.20, 6.10, 7.20, 7.10, 5.60, 5.10, 5.70, 8.00, 6.95,
      6.00, 5.80, 5.70, 6.20, 6.10, 6.20, 7.50, 7.80, 6.00, 4.85,
      4.90, 4.60, 5.10, 6.20, 7.75, 6.25, 6.00, 8.55, 12.30, 10.20,
      10.50, 13.20, 15.00, 14.00, 12.30, 9.40, 9.75, 9.70, 9.10, 8.95,
      9.70, 13.70, 14.70, 13.50, 10.75, 10.40,
    ], 'medium', CBOT, [yrs(2005, 2025, 'high')]),
    seasonality: SOY_SEASON, noiseSd: 0.045,
    procedural: { reversion: 0.03, sd: 0.05, factor: 'grain', loading: 0.75 },
  },
  wheat: {
    id: 'wheat', label: 'SRW wheat futures', unit: '$/bu', group: 'grain', kind: 'price', decimals: 4,
    annual: annual(1970, [
      1.55, 1.60, 1.85, 3.90, 4.70, 3.70, 3.20, 2.55, 3.10, 4.00,
      4.40, 4.20, 3.70, 3.75, 3.65, 3.30, 2.80, 2.85, 3.70, 4.10,
      3.20, 3.15, 3.70, 3.20, 3.55, 4.20, 5.00, 3.70, 2.90, 2.65,
      2.60, 2.75, 3.10, 3.30, 3.40, 3.30, 4.20, 6.75, 7.70, 5.20,
      5.70, 7.20, 7.80, 7.00, 5.90, 5.10, 4.40, 4.40, 5.00, 4.90,
      5.50, 7.10, 9.10, 6.50, 5.70, 5.40,
    ], 'medium', CBOT),
    seasonality: WHEAT_SEASON, noiseSd: 0.05,
    procedural: { reversion: 0.03, sd: 0.055, factor: 'grain', loading: 0.65 },
  },
  soymeal: {
    id: 'soymeal', label: 'Soybean meal (48%)', unit: '$/ton', group: 'grain', kind: 'price', decimals: 2,
    annual: annual(1970, [
      78, 76, 105, 230, 140, 130, 185, 200, 175, 190,
      200, 210, 185, 190, 155, 130, 155, 180, 250, 200,
      175, 175, 180, 195, 180, 175, 245, 260, 160, 145,
      175, 165, 165, 195, 220, 190, 180, 230, 330, 310,
      300, 345, 430, 440, 450, 330, 320, 320, 330, 305,
      320, 380, 430, 430, 330, 300,
    ], 'medium', 'CBOT soybean meal / Decatur 48% (from memory)'),
    seasonality: SOY_SEASON, noiseSd: 0.05,
    procedural: { reversion: 0.03, sd: 0.055, factor: 'grain', loading: 0.7 },
  },
  ddgs: {
    id: 'ddgs', label: 'Distillers dried grains', unit: '$/ton', group: 'grain', kind: 'price', decimals: 2,
    availableFrom: 2002,
    annual: annual(2002, [
      85, 95, 100, 85, 95, 120, 145, 115, 130, 200,
      230, 220, 160, 140, 120, 115, 140, 140, 150, 210,
      250, 220, 170, 160,
    ], 'low', 'USDA AMS Grain and Feedstuffs / ERS Feed Outlook (from memory)'),
    seasonality: GRAIN_SEASON, noiseSd: 0.05,
    procedural: { reversion: 0.03, sd: 0.05, factor: 'grain', loading: 0.6 },
  },
  hogs: {
    id: 'hogs', label: 'Hogs, live basis', unit: '$/cwt', group: 'livestock', kind: 'price', decimals: 2,
    annual: annual(1970, [
      22.7, 17.5, 26.7, 38.4, 34.2, 46.1, 43.1, 39.4, 46.6, 41.8,
      38.0, 43.9, 52.3, 46.8, 47.1, 44.0, 49.3, 51.2, 42.3, 42.5,
      53.7, 49.1, 41.6, 45.2, 39.9, 40.5, 51.9, 52.9, 34.4, 30.3,
      42.3, 44.4, 33.4, 37.2, 49.3, 50.1, 46.0, 46.6, 47.8, 41.6,
      55.1, 66.1, 64.2, 64.1, 76.0, 50.2, 46.2, 50.6, 46.0, 49.0,
      43.0, 68.0, 75.0, 60.0, 62.0, 68.0,
    ], 'medium', NASS, [yrs(2020, 2025, 'low', 'live-equivalent estimated from lean hog futures')]),
    seasonality: [0.95, 0.97, 0.98, 1.02, 1.06, 1.08, 1.07, 1.04, 1.0, 0.96, 0.93, 0.94], noiseSd: 0.06,
    procedural: { reversion: 0.04, sd: 0.06, factor: 'livestock', loading: 0.6 },
  },
  cattle: {
    id: 'cattle', label: 'Fed steers', unit: '$/cwt', group: 'livestock', kind: 'price', decimals: 2,
    annual: annual(1970, [
      29.7, 32.4, 35.8, 44.5, 41.9, 44.6, 39.1, 40.4, 52.3, 67.7,
      67.0, 63.8, 64.3, 62.4, 65.3, 58.4, 57.8, 64.6, 69.5, 72.5,
      78.6, 74.3, 75.4, 76.4, 68.6, 66.8, 65.1, 66.3, 61.5, 65.6,
      69.7, 72.7, 67.0, 84.7, 84.7, 87.3, 85.4, 91.8, 92.3, 83.2,
      95.4, 114.7, 122.9, 125.9, 154.6, 148.1, 120.9, 121.5, 117.1, 116.8,
      108.5, 122.0, 144.0, 175.0, 188.0, 225.0,
    ], 'medium', NASS),
    seasonality: [1.0, 1.01, 1.03, 1.03, 1.01, 0.99, 0.98, 0.98, 0.99, 1.0, 0.99, 0.99], noiseSd: 0.03,
    procedural: { reversion: 0.02, sd: 0.035, factor: 'livestock', loading: 0.4 },
  },
  milk: {
    id: 'milk', label: 'All-milk price', unit: '$/cwt', group: 'livestock', kind: 'price', decimals: 2,
    annual: annual(1970, [
      5.71, 5.87, 6.07, 7.14, 8.33, 8.75, 9.66, 9.72, 10.60, 12.00,
      13.05, 13.76, 13.61, 13.58, 13.46, 12.76, 12.51, 12.54, 12.26, 13.56,
      13.68, 12.24, 13.09, 12.80, 12.97, 12.74, 14.75, 13.36, 15.46, 14.38,
      12.40, 15.04, 12.18, 12.55, 16.13, 15.19, 12.90, 19.21, 18.45, 12.93,
      16.35, 20.24, 18.56, 20.05, 23.98, 17.08, 16.39, 17.69, 16.30, 18.63,
      18.24, 18.69, 25.34, 20.48, 22.60, 21.50,
    ], 'high', NASS, [yrs(2024, 2025, 'medium')]),
    seasonality: [1.0, 0.99, 0.97, 0.96, 0.96, 0.98, 1.0, 1.02, 1.04, 1.04, 1.03, 1.01], noiseSd: 0.035,
    procedural: { reversion: 0.03, sd: 0.04, factor: 'livestock', loading: 0.3 },
  },
  crude: {
    id: 'crude', label: 'Crude oil', unit: '$/bbl', group: 'energy', kind: 'price', decimals: 2,
    annual: annual(1970, [
      3.40, 3.60, 3.58, 4.15, 9.07, 10.38, 10.89, 11.96, 12.46, 17.72,
      28.07, 35.24, 31.87, 30.0, 29.3, 27.6, 15.0, 19.2, 16.0, 19.6,
      24.5, 21.5, 20.6, 18.4, 17.2, 18.4, 22.1, 20.6, 14.4, 19.3,
      30.4, 25.9, 26.2, 31.1, 41.5, 56.6, 66.0, 72.3, 99.7, 61.9,
      79.5, 95.0, 94.1, 97.9, 93.3, 48.7, 43.3, 50.8, 65.2, 57.0,
      39.2, 68.0, 94.9, 77.6, 76.6, 65.0,
    ], 'high', 'WTI spot (1983+); U.S. refiner acquisition cost, composite (1970–82)', [yrs(1970, 1982, 'medium')]),
    seasonality: null, noiseSd: 0.06,
    procedural: { reversion: 0.02, sd: 0.07, factor: 'energy', loading: 0.9 },
  },
  diesel: {
    id: 'diesel', label: 'Diesel, rack', unit: '$/gal', group: 'energy', kind: 'price', decimals: 4,
    annual: annual(1970, [
      0.11, 0.115, 0.115, 0.15, 0.30, 0.32, 0.34, 0.38, 0.40, 0.65,
      0.85, 0.98, 0.92, 0.82, 0.80, 0.77, 0.47, 0.52, 0.47, 0.56,
      0.70, 0.62, 0.58, 0.55, 0.50, 0.51, 0.62, 0.57, 0.40, 0.49,
      0.88, 0.76, 0.70, 0.85, 1.15, 1.70, 1.95, 2.10, 2.95, 1.65,
      2.15, 2.95, 3.05, 2.95, 2.75, 1.60, 1.30, 1.60, 2.05, 1.90,
      1.20, 2.05, 3.55, 2.70, 2.40, 2.20,
    ], 'medium', EIA, [yrs(1970, 1982, 'low')]),
    seasonality: [1.02, 1.02, 1.01, 1.0, 0.99, 0.99, 0.99, 0.99, 1.0, 1.0, 1.0, 1.0], noiseSd: 0.05,
    procedural: { reversion: 0.02, sd: 0.065, factor: 'energy', loading: 0.85 },
  },
  gasoline: {
    id: 'gasoline', label: 'Gasoline, rack', unit: '$/gal', group: 'energy', kind: 'price', decimals: 4,
    annual: annual(1970, [
      0.12, 0.12, 0.12, 0.15, 0.27, 0.30, 0.32, 0.35, 0.37, 0.56,
      0.85, 0.97, 0.88, 0.81, 0.75, 0.75, 0.47, 0.53, 0.51, 0.57,
      0.67, 0.62, 0.58, 0.53, 0.52, 0.55, 0.61, 0.59, 0.43, 0.52,
      0.86, 0.78, 0.75, 0.88, 1.20, 1.60, 1.85, 2.10, 2.45, 1.70,
      2.05, 2.70, 2.80, 2.70, 2.55, 1.65, 1.35, 1.65, 1.90, 1.75,
      1.20, 2.05, 2.80, 2.45, 2.20, 2.00,
    ], 'medium', EIA, [yrs(1970, 1982, 'low')]),
    seasonality: [0.96, 0.97, 1.0, 1.03, 1.05, 1.05, 1.04, 1.03, 1.0, 0.97, 0.95, 0.95], noiseSd: 0.055,
    procedural: { reversion: 0.02, sd: 0.07, factor: 'energy', loading: 0.85 },
  },
  propane: {
    id: 'propane', label: 'Propane, wholesale', unit: '$/gal', group: 'energy', kind: 'price', decimals: 4,
    annual: annual(1970, [
      0.05, 0.05, 0.055, 0.08, 0.15, 0.17, 0.20, 0.23, 0.23, 0.30,
      0.42, 0.48, 0.40, 0.40, 0.38, 0.35, 0.24, 0.27, 0.24, 0.27,
      0.38, 0.33, 0.31, 0.30, 0.28, 0.30, 0.40, 0.37, 0.25, 0.32,
      0.60, 0.50, 0.40, 0.58, 0.75, 0.90, 1.00, 1.20, 1.40, 0.85,
      1.15, 1.40, 1.00, 0.95, 1.05, 0.45, 0.45, 0.75, 0.85, 0.55,
      0.50, 1.05, 1.15, 0.75, 0.75, 0.80,
    ], 'medium', 'Mont Belvieu / Conway propane spot (from memory)', [yrs(1970, 1989, 'low')]),
    seasonality: [1.12, 1.08, 1.0, 0.95, 0.92, 0.92, 0.93, 0.95, 0.98, 1.02, 1.06, 1.10], noiseSd: 0.07,
    procedural: { reversion: 0.025, sd: 0.08, factor: 'energy', loading: 0.7 },
  },
  natgas: {
    id: 'natgas', label: 'Natural gas', unit: '$/MMBtu', group: 'energy', kind: 'price', decimals: 3,
    annual: annual(1970, [
      0.17, 0.18, 0.19, 0.22, 0.30, 0.44, 0.58, 0.79, 0.91, 1.18,
      1.59, 1.98, 2.46, 2.59, 2.66, 2.51, 1.94, 1.67, 1.69, 1.69,
      1.71, 1.64, 1.74, 2.04, 1.85, 1.69, 2.76, 2.53, 2.08, 2.27,
      4.31, 3.96, 3.38, 5.47, 5.89, 8.69, 6.73, 6.97, 8.86, 3.94,
      4.37, 4.00, 2.75, 3.73, 4.37, 2.62, 2.52, 2.99, 3.15, 2.56,
      2.03, 3.89, 6.45, 2.53, 2.20, 3.50,
    ], 'high', 'Henry Hub spot (1990+); U.S. wellhead price (1970–89)', [yrs(1970, 1989, 'medium')]),
    seasonality: [1.1, 1.06, 1.0, 0.96, 0.95, 0.96, 0.98, 0.98, 0.97, 0.98, 1.02, 1.06], noiseSd: 0.08,
    procedural: { reversion: 0.025, sd: 0.09, factor: 'energy', loading: 0.5 },
  },
  anhydrous: {
    id: 'anhydrous', label: 'Anhydrous ammonia', unit: '$/ton', group: 'fertilizer', kind: 'price', decimals: 2,
    annual: annual(1970, [
      80, 74, 75, 92, 199, 226, 184, 168, 158, 168,
      227, 245, 248, 238, 247, 230, 196, 171, 177, 199,
      199, 210, 197, 199, 230, 330, 340, 290, 260, 240,
      230, 400, 280, 370, 420, 415, 520, 520, 755, 680,
      500, 820, 860, 850, 790, 750, 600, 520, 520, 570,
      500, 750, 1450, 1050, 800, 800,
    ], 'medium', ERS_FERT, [yrs(2023, 2025, 'low')]),
    seasonality: NITROGEN_SEASON, noiseSd: 0.035,
    procedural: { reversion: 0.025, sd: 0.045, factor: 'fertilizer', loading: 0.8 },
    confidenceNote: 'Annual values are spring retail; 2008 and 2022 had higher intra-year peaks encoded as events.',
  },
  urea: {
    id: 'urea', label: 'Urea', unit: '$/ton', group: 'fertilizer', kind: 'price', decimals: 2,
    annual: annual(1970, [
      95, 92, 92, 110, 195, 225, 175, 160, 155, 165,
      200, 225, 200, 190, 200, 190, 155, 150, 175, 180,
      175, 185, 180, 185, 205, 260, 270, 230, 200, 175,
      180, 270, 220, 260, 300, 350, 395, 455, 590, 490,
      430, 570, 610, 580, 550, 510, 380, 360, 370, 400,
      370, 550, 940, 650, 560, 600,
    ], 'medium', ERS_FERT, [yrs(1970, 1979, 'low'), yrs(2023, 2025, 'low')]),
    seasonality: NITROGEN_SEASON, noiseSd: 0.04,
    procedural: { reversion: 0.025, sd: 0.05, factor: 'fertilizer', loading: 0.8 },
  },
  uan28: {
    id: 'uan28', label: 'UAN 28%', unit: '$/ton', group: 'fertilizer', kind: 'price', decimals: 2,
    annual: annual(1970, [
      60, 58, 58, 70, 120, 135, 115, 105, 100, 105,
      130, 145, 140, 135, 140, 130, 110, 100, 105, 115,
      115, 120, 115, 115, 130, 165, 175, 150, 130, 120,
      125, 200, 145, 180, 210, 240, 260, 290, 420, 340,
      270, 390, 400, 400, 380, 350, 270, 240, 250, 260,
      240, 380, 640, 450, 360, 380,
    ], 'low', ERS_FERT),
    seasonality: NITROGEN_SEASON, noiseSd: 0.035,
    procedural: { reversion: 0.025, sd: 0.045, factor: 'fertilizer', loading: 0.8 },
  },
  dap: {
    id: 'dap', label: 'DAP (18-46-0)', unit: '$/ton', group: 'fertilizer', kind: 'price', decimals: 2,
    annual: annual(1970, [
      89, 87, 88, 104, 208, 240, 180, 165, 170, 190,
      250, 260, 235, 230, 240, 225, 210, 205, 225, 230,
      225, 230, 215, 210, 230, 260, 270, 270, 275, 260,
      240, 240, 235, 250, 270, 300, 310, 430, 850, 640,
      500, 700, 680, 620, 580, 600, 520, 460, 490, 500,
      440, 650, 990, 830, 760, 820,
    ], 'medium', ERS_FERT, [yrs(1970, 1979, 'low')]),
    seasonality: PK_SEASON, noiseSd: 0.03,
    procedural: { reversion: 0.02, sd: 0.04, factor: 'fertilizer', loading: 0.6 },
  },
  potash: {
    id: 'potash', label: 'Potash (0-0-60)', unit: '$/ton', group: 'fertilizer', kind: 'price', decimals: 2,
    annual: annual(1970, [
      58, 58, 59, 66, 92, 105, 95, 90, 90, 105,
      130, 135, 125, 120, 125, 115, 105, 105, 125, 135,
      135, 140, 140, 135, 145, 155, 165, 170, 175, 175,
      170, 175, 170, 175, 190, 240, 260, 280, 550, 770,
      450, 590, 650, 600, 480, 470, 380, 340, 340, 370,
      350, 520, 840, 650, 470, 470,
    ], 'medium', ERS_FERT, [yrs(1970, 1979, 'low')]),
    seasonality: PK_SEASON, noiseSd: 0.025,
    procedural: { reversion: 0.02, sd: 0.035, factor: 'fertilizer', loading: 0.5 },
  },
  prime: {
    id: 'prime', label: 'Prime rate', unit: '%', group: 'rates', kind: 'rate', decimals: 2,
    annual: annual(1970, [
      7.91, 5.72, 5.25, 8.03, 10.81, 7.86, 6.84, 6.83, 9.06, 12.67,
      15.26, 18.87, 14.85, 10.79, 12.04, 9.93, 8.33, 8.21, 9.32, 10.87,
      10.01, 8.46, 6.25, 6.00, 7.15, 8.83, 8.27, 8.44, 8.35, 7.99,
      9.23, 6.91, 4.67, 4.12, 4.34, 6.19, 7.96, 8.05, 5.09, 3.25,
      3.25, 3.25, 3.25, 3.25, 3.25, 3.26, 3.51, 4.10, 4.90, 5.28,
      3.54, 3.25, 4.86, 8.20, 8.33, 7.40,
    ], 'high', FED, [yrs(2025, 2025, 'medium')]),
    seasonality: null, noiseSd: 0,
    procedural: { reversion: 0.02, sd: 0.15 },
  },
  tbill: {
    id: 'tbill', label: '3-month T-bill', unit: '%', group: 'rates', kind: 'rate', decimals: 2,
    annual: annual(1970, [
      6.39, 4.33, 4.07, 7.03, 7.83, 5.77, 4.97, 5.27, 7.19, 10.07,
      11.43, 14.03, 10.61, 8.61, 9.52, 7.48, 5.98, 5.82, 6.69, 8.12,
      7.51, 5.42, 3.45, 3.02, 4.29, 5.51, 5.02, 5.07, 4.81, 4.66,
      5.85, 3.45, 1.62, 1.02, 1.38, 3.16, 4.73, 4.41, 1.48, 0.16,
      0.14, 0.06, 0.09, 0.06, 0.03, 0.05, 0.32, 0.93, 1.94, 2.06,
      0.37, 0.05, 2.02, 5.07, 4.97, 4.10,
    ], 'high', FED, [yrs(2025, 2025, 'medium')]),
    seasonality: null, noiseSd: 0,
    procedural: { reversion: 0.02, sd: 0.15 },
  },
  cpi: {
    id: 'cpi', label: 'CPI-U (1982–84 = 100)', unit: 'index', group: 'macro', kind: 'index', decimals: 1,
    annual: annual(1970, [
      38.8, 40.5, 41.8, 44.4, 49.3, 53.8, 56.9, 60.6, 65.2, 72.6,
      82.4, 90.9, 96.5, 99.6, 103.9, 107.6, 109.6, 113.6, 118.3, 124.0,
      130.7, 136.2, 140.3, 144.5, 148.2, 152.4, 156.9, 160.5, 163.0, 166.6,
      172.2, 177.1, 179.9, 184.0, 188.9, 195.3, 201.6, 207.3, 215.3, 214.5,
      218.1, 224.9, 229.6, 233.0, 236.7, 237.0, 240.0, 245.1, 251.1, 255.7,
      258.8, 271.0, 292.7, 304.7, 313.7, 322.0,
    ], 'high', 'BLS CPI-U annual average', [yrs(2025, 2025, 'medium')]),
    seasonality: null, noiseSd: 0,
    procedural: { reversion: 0, sd: 0.0015 },
  },
  constructionIndex: {
    id: 'constructionIndex', label: 'Construction cost index (ENR-style, 1913 = 100)', unit: 'index', group: 'macro', kind: 'index', decimals: 0,
    annual: annual(1970, [
      1381, 1581, 1753, 1895, 2020, 2212, 2401, 2576, 2776, 3003,
      3237, 3535, 3825, 4066, 4146, 4195, 4295, 4406, 4519, 4615,
      4732, 4835, 4985, 5210, 5408, 5471, 5620, 5826, 5920, 6059,
      6221, 6343, 6538, 6694, 7115, 7446, 7751, 7966, 8310, 8570,
      8802, 9070, 9308, 9547, 9806, 10035, 10338, 10737, 11062, 11281,
      11466, 12133, 12993, 13317, 13540, 13800,
    ], 'medium', 'ENR Construction Cost Index, annual average (from memory)'),
    seasonality: null, noiseSd: 0,
    procedural: { reversion: 0, sd: 0.002 },
  },
  landValue: {
    id: 'landValue', label: 'Cropland value (region)', unit: '$/acre', group: 'macro', kind: 'index', decimals: 0,
    annual: annual(1970, [
      490, 495, 525, 600, 830, 1000, 1250, 1530, 1690, 1950,
      2190, 2290, 2140, 1900, 1840, 1440, 1140, 1020, 1150, 1250,
      1300, 1330, 1360, 1400, 1480, 1550, 1700, 1850, 1930, 2000,
      2100, 2200, 2300, 2450, 2650, 3000, 3400, 3800, 4400, 4300,
      4800, 5800, 7000, 7900, 7900, 7600, 7300, 7300, 7300, 7300,
      7400, 8400, 9900, 10400, 10500, 10600,
    ], 'medium', 'USDA NASS Land Values / ISPFMRA, Illinois-like average (from memory)'),
    seasonality: null, noiseSd: 0,
    procedural: { reversion: 0.0, sd: 0.006 },
  },
  netFarmIncome: {
    id: 'netFarmIncome', label: 'U.S. net farm income', unit: '$B', group: 'macro', kind: 'index', decimals: 1,
    annual: annual(1970, [
      14.4, 15.0, 19.5, 34.4, 27.3, 25.5, 20.1, 19.9, 25.2, 27.4,
      16.1, 26.9, 23.8, 14.2, 26.0, 28.6, 31.0, 38.0, 34.7, 45.2,
      44.6, 37.8, 47.7, 43.1, 48.4, 36.8, 53.5, 47.6, 44.6, 47.7,
      48.3, 51.3, 36.6, 61.6, 85.2, 79.3, 59.6, 75.4, 77.8, 61.0,
      79.6, 113.0, 95.8, 123.1, 92.7, 81.0, 62.3, 75.1, 81.7, 79.0,
      95.7, 140.9, 182.0, 146.7, 139.0, 180.0,
    ], 'medium', 'USDA ERS Farm Income and Wealth Statistics (from memory)', [yrs(2024, 2025, 'low')]),
    seasonality: null, noiseSd: 0,
    procedural: { reversion: 0.02, sd: 0.03 },
  },
  yieldCorn: {
    id: 'yieldCorn', label: 'Regional corn yield', unit: 'bu/ac', group: 'yields', kind: 'yield', decimals: 0,
    annual: annual(1970, [
      75, 96, 102, 95, 79, 98, 104, 98, 112, 120,
      92, 115, 120, 73, 107, 130, 128, 125, 79, 126,
      128, 109, 147, 132, 154, 115, 134, 133, 145, 138,
      150, 151, 136, 164, 177, 147, 160, 168, 172, 172,
      162, 155, 105, 177, 194, 172, 190, 196, 200, 177,
      185, 200, 197, 203, 210, 210,
    ], 'medium', 'USDA NASS state yields, Illinois/Indiana blend (from memory)', [yrs(2024, 2025, 'low')]),
    seasonality: null, noiseSd: 0,
    procedural: { reversion: 0, sd: 0 },
  },
  yieldSoy: {
    id: 'yieldSoy', label: 'Regional soybean yield', unit: 'bu/ac', group: 'yields', kind: 'yield', decimals: 0,
    annual: annual(1970, [
      30, 34, 34, 33, 29, 33, 33, 37, 37, 39,
      35, 36, 39, 30, 33, 41, 39, 38, 31, 39,
      40, 41, 44, 41, 46, 40, 43, 45, 46, 44,
      45, 45, 44, 37, 49, 50, 49, 46, 46, 47,
      51, 49, 44, 50, 55, 53, 58, 57, 63, 54,
      59, 62, 62, 63, 63, 63,
    ], 'medium', 'USDA NASS state yields, Illinois/Indiana blend (from memory)', [yrs(2024, 2025, 'low')]),
    seasonality: null, noiseSd: 0,
    procedural: { reversion: 0, sd: 0 },
  },
  yieldWheat: {
    id: 'yieldWheat', label: 'Regional SRW wheat yield', unit: 'bu/ac', group: 'yields', kind: 'yield', decimals: 0,
    annual: annual(1970, [
      40, 45, 42, 38, 39, 42, 42, 40, 40, 49,
      49, 46, 50, 49, 49, 51, 50, 51, 52, 50,
      53, 46, 58, 58, 56, 55, 50, 60, 65, 63,
      64, 66, 53, 64, 64, 67, 66, 56, 66, 65,
      66, 68, 69, 69, 72, 66, 79, 76, 75, 67,
      78, 84, 80, 85, 82, 82,
    ], 'medium', 'USDA NASS state yields, Illinois/Indiana blend (from memory)', [yrs(2024, 2025, 'low')]),
    seasonality: null, noiseSd: 0,
    procedural: { reversion: 0, sd: 0 },
  },
};

export const SERIES_IDS = Object.keys(MARKET_SERIES) as SeriesId[];

/** Last year with historical data across the core series. */
export const DATA_END_YEAR = 2025;

/** Correlated factor shocks for procedural continuation (monthly sd of each factor). */
export const PROCEDURAL_FACTORS = {
  grain: { sd: 0.04 },
  energy: { sd: 0.05 },
  livestock: { sd: 0.03 },
  fertilizer: { sd: 0.03, energyLoading: 0.4, grainLoading: 0.3 },
} as const;

/** Regime switching for procedural years: monthly transition probabilities and drift. */
export const PROCEDURAL_REGIMES = {
  states: ['bust', 'normal', 'boom'] as const,
  // rows: from; cols: to (bust, normal, boom)
  transition: [
    [0.97, 0.03, 0.0],
    [0.008, 0.985, 0.007],
    [0.0, 0.04, 0.96],
  ],
  /** Monthly log drift added to grain/fertilizer by regime. */
  grainDrift: [-0.008, 0, 0.012],
  confidence: 'low' as Confidence,
};

/** Long-run inflation assumption once data ends (annual). */
export const PROCEDURAL_INFLATION = { mean: 0.025, sd: 0.01, confidence: 'low' as Confidence };
/** Long-run prime rate mean once data ends. */
export const PROCEDURAL_PRIME_MEAN = { value: 6.0, confidence: 'low' as Confidence };
