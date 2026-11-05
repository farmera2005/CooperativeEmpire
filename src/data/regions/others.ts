// Three more playable regions (D-140): the Red River Valley, the Western Corn Belt / Plains and
// the Great Lakes. Numbers from docs/research/regions.md: yields as ratios to the central Illinois
// series the market data carries, basis against central Illinois, weather, farm sizes, crops and
// livestock. Most are low confidence — the 1970 and 1990 crop mixes, livestock shares and weather
// odds are estimates to be checked against the Census of Agriculture and NASS series.

import { s, type AnnualPoint, type Confidence } from '../types';
import type { RegionDef } from './eccb';

const pts = (rows: [number, number][], confidence: Confidence = 'low', source?: string): AnnualPoint[] =>
  rows.map(([year, value], i) => ({ year, value, confidence, ...(i === 0 && source ? { source } : {}) }));

export const RRV: RegionDef = {
  id: 'rrv',
  name: 'Red River Valley',
  cropShares: {
    corn: pts([[1970, 0.05], [1990, 0.08], [2010, 0.22], [2020, 0.25]], 'low', 'NDSU/agweek: the valley turned from wheat toward corn and soybeans from the 1990s'),
    soybeans: pts([[1970, 0.05], [1990, 0.15], [2010, 0.33], [2020, 0.38]]),
    // Spring wheat and barley together: valley elevators handled both as small grains.
    wheat: pts([[1970, 0.68], [1990, 0.56], [2010, 0.32], [2020, 0.26]], 'low', 'Spring wheat plus malting and feed barley'),
    other: pts([[1970, 0.22], [1990, 0.21], [2010, 0.13], [2020, 0.11]], 'low', 'Sunflowers, dry beans and sugar beets'),
  },
  livestock: [
    { species: 'hogs', label: 'Hogs', farmShare: pts([[1970, 0.15], [1990, 0.06], [2010, 0.01], [2020, 0.01]]), headPerFarm: pts([[1970, 150], [1990, 500], [2020, 4000]]) },
    { species: 'dairy', label: 'Dairy cows', farmShare: pts([[1970, 0.1], [1990, 0.04], [2010, 0.01], [2020, 0.005]]), headPerFarm: pts([[1970, 25], [1990, 50], [2020, 200]]) },
    { species: 'beefCows', label: 'Beef cows', farmShare: pts([[1970, 0.3], [1990, 0.2], [2020, 0.12]]), headPerFarm: pts([[1970, 35], [2020, 70]]) },
    { species: 'cattleOnFeed', label: 'Cattle on feed', farmShare: pts([[1970, 0.08], [1990, 0.04], [2020, 0.02]]), headPerFarm: pts([[1970, 60], [2020, 300]]) },
    { species: 'poultry', label: 'Contract poultry (1,000 birds)', farmShare: pts([[1970, 0.01], [2020, 0.008]]), headPerFarm: pts([[1970, 20], [2020, 150]]) },
  ],
  meanFarmAcres: pts([[1970, 620], [1990, 900], [2010, 1500], [2020, 1800], [2030, 2000]], 'low', 'Census of Agriculture: ND average farm 1,492 acres (2017)'),
  farmSizeSigma: s(0.8, 'low'),
  sizeClasses: { mid: 400, large: 1200, mega: 4000 },
  croplandShareOfArea: s(0.85, 'low'),
  operatorAgeMean: pts([[1970, 49], [2020, 56]], 'medium', 'Census of Agriculture: ND operators 48.9 (1969), 56.0 (2017)'),
  operatorAgeSd: s(12, 'low'),
  weatherRisk: { wetSpringProb: s(0.25, 'low', 'Flat, slow-draining clay; spring floods (1997)'), wetFallProb: s(0.13, 'low'), droughtProb: s(0.12, 'low'), derechoProb: s(0.01, 'low') },
  hddNormals: s([1850, 1550, 1250, 700, 330, 100, 30, 60, 270, 650, 1150, 1650], 'low', 'Fargo ~9,250 HDD a year (older normal)'),
  fieldDaysPerWeek: s([0, 0, 0.3, 2.0, 4.5, 5.0, 5.5, 5.5, 5.0, 4.5, 1.5, 0], 'low'),
  towns: { min: 12, max: 34 },
  counties: { min: 2, max: 5 },
  countyMiles: s(34, 'low', 'Valley counties run 30–42 miles across'),
  riverTerminalProb: s(0.1, 'low', 'Grain moves by rail to Duluth and the Pacific Northwest, not barge'),
  farmlandLossPerYear: s(0.0005, 'low'),
  yieldFactor: {
    corn: pts([[1975, 0.65], [2015, 0.77]], 'medium', 'ND corn 154 bu vs IL 197 (2016) ≈ 0.78'),
    soybeans: pts([[1975, 0.7], [2015, 0.62]]),
    wheat: pts([[1975, 0.7], [2015, 0.68]], 'low', 'Hard red spring wheat against soft red winter'),
  },
  basisOffset: s({ corn: -0.5, soybeans: -0.55, wheat: -0.3 }, 'low', 'DTN Feb 2026: an ND processor ~$0.80 under Decatur'),
  beetYieldFactor: s(1, 'medium', 'American Crystal ~29 t/acre long-run, 31.9 record (2023)'),
  // Spring wheat in August; corn and soybeans a little later than in Illinois.
  harvestCalendar: { wheat: [0, 0, 0, 0, 0, 0, 0.1, 0.7, 0.2, 0, 0, 0], soybeans: [0, 0, 0, 0, 0, 0, 0, 0, 0.4, 0.55, 0.05, 0], corn: [0, 0, 0, 0, 0, 0, 0, 0, 0.05, 0.45, 0.45, 0.05] },
};

export const WCB: RegionDef = {
  id: 'wcb',
  name: 'Western Corn Belt & Plains',
  cropShares: {
    corn: pts([[1970, 0.38], [1990, 0.42], [2010, 0.48], [2020, 0.5]], 'low', 'Nebraska/Kansas/western Iowa; irrigated corn expanded from the 1970s'),
    soybeans: pts([[1970, 0.12], [1990, 0.2], [2010, 0.3], [2020, 0.32]]),
    wheat: pts([[1970, 0.25], [1990, 0.2], [2010, 0.12], [2020, 0.1]], 'low', 'Hard red winter wheat'),
    other: pts([[1970, 0.25], [1990, 0.18], [2010, 0.1], [2020, 0.08]], 'low', 'Sorghum and alfalfa'),
  },
  livestock: [
    { species: 'hogs', label: 'Hogs', farmShare: pts([[1970, 0.35], [1990, 0.2], [2010, 0.04], [2020, 0.03]]), headPerFarm: pts([[1970, 250], [1990, 600], [2020, 5000]]) },
    { species: 'dairy', label: 'Dairy cows', farmShare: pts([[1970, 0.06], [1990, 0.02], [2020, 0.005]]), headPerFarm: pts([[1970, 30], [2020, 400]]) },
    { species: 'beefCows', label: 'Beef cows', farmShare: pts([[1970, 0.4], [1990, 0.3], [2020, 0.2]]), headPerFarm: pts([[1970, 40], [2020, 90]]) },
    { species: 'cattleOnFeed', label: 'Cattle on feed', farmShare: pts([[1970, 0.25], [1990, 0.12], [2020, 0.06]], 'medium', 'Nebraska leads the nation in cattle on feed (2.6M head, 2025)'), headPerFarm: pts([[1970, 150], [1990, 400], [2020, 1500]]) },
    { species: 'poultry', label: 'Contract poultry (1,000 birds)', farmShare: pts([[1970, 0.01], [2020, 0.008]]), headPerFarm: pts([[1970, 20], [2020, 180]]) },
  ],
  meanFarmAcres: pts([[1970, 420], [1990, 600], [2010, 850], [2020, 1000], [2030, 1100]], 'low', 'Census of Agriculture: Nebraska average farm 971 acres (2017)'),
  farmSizeSigma: s(0.8, 'low'),
  sizeClasses: { mid: 250, large: 900, mega: 3000 },
  croplandShareOfArea: s(0.8, 'low'),
  operatorAgeMean: pts([[1970, 50], [2020, 56]], 'medium', 'Nebraska operators 56.4 (2017)'),
  operatorAgeSd: s(12, 'low'),
  weatherRisk: { wetSpringProb: s(0.1, 'low'), wetFallProb: s(0.08, 'low'), droughtProb: s(0.2, 'low', 'Semi-arid west; irrigation limits the damage'), derechoProb: s(0.02, 'low') },
  hddNormals: s([1214, 987, 760, 430, 170, 30, 5, 10, 110, 420, 800, 1119], 'medium', 'Grand Island 1991–2020: Jan 1,214, Feb 987, Dec 1,119 (5,923 a year)'),
  fieldDaysPerWeek: s([0.5, 0.6, 2.0, 3.8, 4.6, 5.2, 5.8, 5.8, 5.8, 5.4, 4.2, 1.5], 'low'),
  towns: { min: 14, max: 36 },
  counties: { min: 3, max: 6 },
  countyMiles: s(25, 'low', 'Nebraska counties are mostly 24–27 miles across'),
  riverTerminalProb: s(0.35, 'low', 'Missouri River terminals; most grain goes by shuttle train'),
  farmlandLossPerYear: s(0.0008, 'low'),
  yieldFactor: {
    corn: pts([[1975, 0.93], [2015, 0.88]], 'medium', 'Nebraska corn ≈ 0.90 of Illinois (2016); much of it irrigated'),
    soybeans: pts([[1975, 0.9], [2015, 0.9]]),
    wheat: pts([[1975, 0.75], [2015, 0.6]], 'low', 'Hard red winter wheat against soft red winter'),
  },
  basisOffset: s({ corn: -0.1, soybeans: -0.3, wheat: -0.15 }, 'low', 'Feedlots and ethanol support corn basis; soybeans travel farther'),
  beetYieldFactor: s(0.95, 'low', 'Western Nebraska beets (Western Sugar)'),
  // Hard red winter wheat from late June.
  harvestCalendar: { wheat: [0, 0, 0, 0, 0, 0.55, 0.45, 0, 0, 0, 0, 0] },
};

export const GLK: RegionDef = {
  id: 'glk',
  name: 'Great Lakes',
  cropShares: {
    corn: pts([[1970, 0.35], [1990, 0.38], [2010, 0.4], [2020, 0.4]], 'low', 'Michigan Thumb and Saginaw Valley, northwest Ohio'),
    soybeans: pts([[1970, 0.15], [1990, 0.25], [2010, 0.35], [2020, 0.38]]),
    wheat: pts([[1970, 0.15], [1990, 0.15], [2010, 0.12], [2020, 0.1]], 'low', 'Soft wheat'),
    other: pts([[1970, 0.35], [1990, 0.22], [2010, 0.13], [2020, 0.12]], 'low', 'Dry beans, sugar beets and hay'),
  },
  livestock: [
    { species: 'hogs', label: 'Hogs', farmShare: pts([[1970, 0.3], [1990, 0.15], [2010, 0.03], [2020, 0.02]]), headPerFarm: pts([[1970, 150], [1990, 400], [2020, 4000]]) },
    { species: 'dairy', label: 'Dairy cows', farmShare: pts([[1970, 0.25], [1990, 0.12], [2010, 0.05], [2020, 0.04]], 'medium', 'Michigan: 2,158 dairy farms, 442,000 cows (2017)'), headPerFarm: pts([[1970, 30], [1990, 70], [2010, 150], [2020, 220]]) },
    { species: 'beefCows', label: 'Beef cows', farmShare: pts([[1970, 0.15], [1990, 0.1], [2020, 0.06]]), headPerFarm: pts([[1970, 25], [2020, 40]]) },
    { species: 'cattleOnFeed', label: 'Cattle on feed', farmShare: pts([[1970, 0.08], [1990, 0.04], [2020, 0.02]]), headPerFarm: pts([[1970, 60], [2020, 350]]) },
    { species: 'poultry', label: 'Contract poultry (1,000 birds)', farmShare: pts([[1970, 0.015], [2020, 0.01]]), headPerFarm: pts([[1970, 20], [2020, 180]]) },
  ],
  meanFarmAcres: pts([[1970, 180], [1990, 260], [2010, 380], [2020, 450], [2030, 500]], 'low', 'Census of Agriculture: Michigan average farm 205 acres (2017); grain farms larger'),
  farmSizeSigma: s(0.85, 'low'),
  sizeClasses: { mid: 150, large: 500, mega: 1800 },
  croplandShareOfArea: s(0.7, 'low'),
  operatorAgeMean: pts([[1970, 51], [2020, 57]]),
  operatorAgeSd: s(12, 'low'),
  weatherRisk: { wetSpringProb: s(0.25, 'low', 'Lake-plain clays plant late in wet springs'), wetFallProb: s(0.15, 'low'), droughtProb: s(0.08, 'low'), derechoProb: s(0.01, 'low') },
  hddNormals: s([1350, 1150, 980, 580, 280, 60, 10, 30, 170, 500, 830, 1180], 'low', 'Saginaw ~7,000 HDD a year'),
  fieldDaysPerWeek: s([0.2, 0.3, 1.0, 2.6, 4.0, 4.8, 5.4, 5.4, 5.0, 4.4, 3.0, 0.8], 'low'),
  towns: { min: 15, max: 40 },
  counties: { min: 3, max: 6 },
  countyMiles: s(24, 'low', 'Michigan counties 21–31 miles across'),
  riverTerminalProb: s(0.3, 'low', 'Lake ports at Saginaw and Toledo'),
  farmlandLossPerYear: s(0.0015, 'low', 'Suburban pressure near Detroit, Saginaw and Toledo'),
  yieldFactor: {
    corn: pts([[1975, 0.84], [2015, 0.83]], 'medium', 'Ohio corn ≈ 0.81 of Illinois (2016)'),
    soybeans: pts([[1975, 0.82], [2015, 0.83]]),
    wheat: pts([[1975, 1.0], [2015, 1.1]], 'low', 'Soft wheat does well on lake soils'),
  },
  basisOffset: s({ corn: -0.05, soybeans: -0.05, wheat: 0.05 }, 'low', 'Close to eastern feed and export markets'),
  beetYieldFactor: s(0.95, 'medium', 'Michigan Sugar: 20.1 t/acre (2001), 28.5 (2020), record ~36 (2021)'),
  // Soft wheat in July; corn later on cool lake soils.
  harvestCalendar: { wheat: [0, 0, 0, 0, 0, 0, 0.8, 0.2, 0, 0, 0, 0], corn: [0, 0, 0, 0, 0, 0, 0, 0, 0.05, 0.45, 0.42, 0.08] },
};

