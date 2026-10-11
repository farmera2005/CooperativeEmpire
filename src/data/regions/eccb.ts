// Eastern/Central Corn Belt region (Indiana/Illinois/western Ohio-like).

import { annual, s, type AnnualPoint, type Sourced } from '../types';

export type CropId = 'corn' | 'soybeans' | 'wheat' | 'other';
export type SpeciesId = 'hogs' | 'dairy' | 'beefCows' | 'cattleOnFeed' | 'poultry';
export const CROPS: CropId[] = ['corn', 'soybeans', 'wheat', 'other'];
export const SPECIES: SpeciesId[] = ['hogs', 'dairy', 'beefCows', 'cattleOnFeed', 'poultry'];

export interface LivestockDef {
  species: SpeciesId;
  label: string;
  /** Share of farms with this enterprise, by year. */
  farmShare: AnnualPoint[];
  /** Average head (or bird capacity / 1000 for poultry) per farm that has the enterprise. */
  headPerFarm: AnnualPoint[];
}

export interface RegionDef {
  id: string;
  name: string;
  /** Share of cropland by crop (decadal anchors; interpolated). */
  cropShares: Record<CropId, AnnualPoint[]>;
  livestock: LivestockDef[];
  /** Mean cropland acres per commercial farm (member-weighted). */
  meanFarmAcres: AnnualPoint[];
  /** Log-normal spread of farm sizes. */
  farmSizeSigma: Sourced<number>;
  /** Size class thresholds in acres. */
  sizeClasses: { mid: number; large: number; mega: number };
  /** Cropland acres per farm-record assumed when generating the territory (sets area). */
  croplandShareOfArea: Sourced<number>;
  /** Operator age distribution at start (mean, sd) by year. */
  operatorAgeMean: AnnualPoint[];
  operatorAgeSd: Sourced<number>;
  weatherRisk: {
    wetSpringProb: Sourced<number>;
    wetFallProb: Sourced<number>;
    droughtProb: Sourced<number>;
    derechoProb: Sourced<number>;
  };
  /** Monthly heating degree-day normals Jan..Dec. */
  hddNormals: Sourced<number[]>;
  /** Workable field days per week normals Jan..Dec. */
  fieldDaysPerWeek: Sourced<number[]>;
  towns: { min: number; max: number };
  counties: { min: number; max: number };
  countyMiles: Sourced<number>;
  riverTerminalProb: Sourced<number>;
  /** Annual urban creep: share of farmland lost per year. */
  farmlandLossPerYear: Sourced<number>;
}

export const ECCB: RegionDef = {
  id: 'eccb',
  name: 'Eastern/Central Corn Belt',
  cropShares: {
    corn: annual(1970, [0.5], 'medium', 'USDA NASS acreage, IL/IN', []).concat(annual(1980, [0.52], 'medium'), annual(1990, [0.5], 'medium'), annual(2000, [0.49], 'medium'), annual(2010, [0.52], 'medium'), annual(2020, [0.5], 'medium')),
    soybeans: annual(1970, [0.3], 'medium').concat(annual(1980, [0.38], 'medium'), annual(1990, [0.41], 'medium'), annual(2000, [0.44], 'medium'), annual(2010, [0.42], 'medium'), annual(2020, [0.44], 'medium')),
    wheat: annual(1970, [0.08], 'medium').concat(annual(1980, [0.07], 'medium'), annual(1990, [0.06], 'medium'), annual(2000, [0.04], 'medium'), annual(2010, [0.04], 'medium'), annual(2020, [0.03], 'medium')),
    other: annual(1970, [0.12], 'low').concat(annual(1980, [0.03], 'low'), annual(1990, [0.03], 'low'), annual(2000, [0.03], 'low'), annual(2010, [0.02], 'low'), annual(2020, [0.03], 'low')),
  },
  livestock: [
    {
      species: 'hogs', label: 'Hogs',
      farmShare: [{ year: 1970, value: 0.5, confidence: 'medium' }, { year: 1980, value: 0.38, confidence: 'medium' }, { year: 1990, value: 0.25, confidence: 'medium' }, { year: 2000, value: 0.08, confidence: 'medium' }, { year: 2010, value: 0.04, confidence: 'low' }, { year: 2020, value: 0.03, confidence: 'low' }],
      headPerFarm: [{ year: 1970, value: 300, confidence: 'low' }, { year: 1980, value: 500, confidence: 'low' }, { year: 1990, value: 900, confidence: 'low' }, { year: 2000, value: 3000, confidence: 'low' }, { year: 2010, value: 5000, confidence: 'low' }, { year: 2020, value: 6500, confidence: 'low' }],
    },
    {
      species: 'dairy', label: 'Dairy cows',
      farmShare: [{ year: 1970, value: 0.1, confidence: 'low' }, { year: 1990, value: 0.05, confidence: 'low' }, { year: 2010, value: 0.02, confidence: 'low' }, { year: 2020, value: 0.012, confidence: 'low' }],
      headPerFarm: [{ year: 1970, value: 35, confidence: 'low' }, { year: 1990, value: 70, confidence: 'low' }, { year: 2010, value: 200, confidence: 'low' }, { year: 2020, value: 400, confidence: 'low' }],
    },
    {
      species: 'beefCows', label: 'Beef cows',
      farmShare: [{ year: 1970, value: 0.25, confidence: 'low' }, { year: 1990, value: 0.18, confidence: 'low' }, { year: 2010, value: 0.12, confidence: 'low' }, { year: 2020, value: 0.1, confidence: 'low' }],
      headPerFarm: [{ year: 1970, value: 30, confidence: 'low' }, { year: 2020, value: 45, confidence: 'low' }],
    },
    {
      species: 'cattleOnFeed', label: 'Cattle on feed',
      farmShare: [{ year: 1970, value: 0.15, confidence: 'low' }, { year: 1990, value: 0.06, confidence: 'low' }, { year: 2020, value: 0.02, confidence: 'low' }],
      headPerFarm: [{ year: 1970, value: 80, confidence: 'low' }, { year: 1990, value: 150, confidence: 'low' }, { year: 2020, value: 400, confidence: 'low' }],
    },
    {
      species: 'poultry', label: 'Contract poultry (1,000 birds)',
      farmShare: [{ year: 1970, value: 0.02, confidence: 'low' }, { year: 2000, value: 0.015, confidence: 'low' }, { year: 2020, value: 0.012, confidence: 'low' }],
      headPerFarm: [{ year: 1970, value: 20, confidence: 'low' }, { year: 2000, value: 120, confidence: 'low' }, { year: 2020, value: 200, confidence: 'low' }],
    },
  ],
  meanFarmAcres: [
    { year: 1970, value: 260, confidence: 'medium', source: 'Census of Agriculture, IL/IN commercial farms (approx.)' },
    { year: 1980, value: 320, confidence: 'medium' },
    { year: 1990, value: 390, confidence: 'medium' },
    { year: 2000, value: 460, confidence: 'medium' },
    { year: 2010, value: 520, confidence: 'low' },
    { year: 2020, value: 580, confidence: 'low' },
    { year: 2030, value: 640, confidence: 'low' },
  ],
  farmSizeSigma: s(0.75, 'low', 'Log-normal sigma of cropland acres per farm'),
  sizeClasses: { mid: 180, large: 600, mega: 2000 },
  croplandShareOfArea: s(0.85, 'medium', 'Cropland share of land area in central Illinois counties'),
  operatorAgeMean: [{ year: 1970, value: 51, confidence: 'medium', source: 'Census of Agriculture' }, { year: 1990, value: 52, confidence: 'medium' }, { year: 2010, value: 57, confidence: 'medium' }, { year: 2020, value: 58, confidence: 'medium' }],
  operatorAgeSd: s(12, 'low'),
  weatherRisk: {
    wetSpringProb: s(0.18, 'low'),
    wetFallProb: s(0.2, 'low'),
    droughtProb: s(0.07, 'low', 'Used only for procedural years; history supplies actual droughts'),
    derechoProb: s(0.02, 'low'),
  },
  hddNormals: s([1150, 950, 750, 400, 150, 20, 0, 5, 70, 330, 700, 1050], 'medium', 'Central Illinois NOAA normals (approx.)'),
  fieldDaysPerWeek: s([0.3, 0.4, 1.5, 3.2, 4.2, 4.8, 5.5, 5.5, 5.5, 5.2, 4.0, 1.2], 'medium', 'USDA Crop Progress days suitable, Illinois (approx.)'),
  towns: { min: 15, max: 40 },
  counties: { min: 3, max: 6 },
  countyMiles: s(24, 'medium', 'Typical Corn Belt county is ~24 x 24 miles'),
  riverTerminalProb: s(0.6, 'low'),
  farmlandLossPerYear: s(0.001, 'low'),
};

export const REGIONS: Record<string, RegionDef> = { eccb: ECCB };
