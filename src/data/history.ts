// Historical events. Dates and descriptions are from memory and flagged with confidence.
// Market effects come in two kinds:
//  - marketWindow: this event "owns" the deviation of the listed series from trend over the
//    window. In drift mode the deviation moves and scales with the event (D-009).
//  - marketSpike: an intra-year shape (log-%) layered on the monthly path, mean-zero within
//    the calendar year so annual averages still match the anchors.
// Legal and entity facts (laws, bankruptcies, mergers, formations) are never drifted.

import type { SeriesId } from './markets';
import type { Confidence } from './types';

export type YM = [year: number, month: number];

export type HistoryEffect =
  | { kind: 'marketWindow'; series: SeriesId[]; from: YM; to: YM }
  | { kind: 'marketSpike'; series: SeriesId; at: YM; pct: number; rampMonths: number; decayMonths: number }
  | { kind: 'rule'; ruleId: string; on: boolean }
  | { kind: 'entity'; brandId: string; op: 'fail' | 'rename' | 'merge' | 'form' | 'ipo' };

export type HistoryCategory = 'markets' | 'weather' | 'policy' | 'law' | 'industry' | 'macro' | 'energy' | 'livestock';

export interface HistoricalEvent {
  id: string;
  date: YM;
  category: HistoryCategory;
  driftable: boolean;
  /** Events that must not precede this one after drift. */
  after?: string[];
  headline: string;
  body: string;
  confidence: Confidence;
  source?: string;
  effects: HistoryEffect[];
}

const win = (series: SeriesId[], from: YM, to: YM): HistoryEffect => ({ kind: 'marketWindow', series, from, to });
const spike = (series: SeriesId, at: YM, pct: number, rampMonths = 1, decayMonths = 3): HistoryEffect => ({
  kind: 'marketSpike', series, at, pct, rampMonths, decayMonths,
});
const GRAINS: SeriesId[] = ['corn', 'soybeans', 'wheat', 'soymeal'];
const ENERGY: SeriesId[] = ['crude', 'diesel', 'gasoline', 'propane'];
const FERT: SeriesId[] = ['anhydrous', 'urea', 'uan28', 'dap', 'potash'];

export const HISTORY: HistoricalEvent[] = [
  {
    id: 'blight-1970', date: [1970, 8], category: 'weather', driftable: true,
    headline: 'Leaf Blight Sweeps Corn Belt; Yields Slashed',
    body: 'Southern corn leaf blight races through fields planted to T-cytoplasm hybrids. Seed companies scramble for normal-cytoplasm seed for next year.',
    confidence: 'high', effects: [win(['yieldCorn'], [1970, 1], [1970, 12]), spike('corn', [1970, 9], 0.12, 2, 4)],
  },
  {
    id: 'soviet-grain-1972', date: [1972, 7], category: 'markets', driftable: true,
    headline: 'Soviets Buy Record U.S. Grain; Prices Climb',
    body: 'Quiet purchases of wheat and corn by the Soviet Union drain U.S. stocks. Washington urges fencerow-to-fencerow planting.',
    confidence: 'high', effects: [win(['wheat', 'corn', 'soybeans', 'soymeal'], [1972, 7], [1975, 6])],
  },
  {
    id: 'soy-embargo-1973', date: [1973, 6], category: 'policy', driftable: true, after: ['soviet-grain-1972'],
    headline: 'Nixon Halts Soybean Exports as Prices Top $12',
    body: 'The administration embargoes soybean and meal exports to hold down domestic feed prices. Japanese buyers vow to find other suppliers.',
    confidence: 'high', effects: [spike('soybeans', [1973, 6], 0.55, 2, 3), spike('soymeal', [1973, 6], 0.8, 2, 3)],
  },
  {
    id: 'oil-embargo-1973', date: [1973, 10], category: 'energy', driftable: true,
    headline: 'Arab Oil Embargo: Fuel Allocation Ordered',
    body: 'OPEC producers cut off shipments to the U.S. Federal allocation rules ration diesel and propane; farm co-ops scramble for supply.',
    confidence: 'high', effects: [win(ENERGY, [1973, 10], [1974, 12])],
  },
  {
    id: 'fert-shortage-1974', date: [1974, 1], category: 'markets', driftable: true, after: ['oil-embargo-1973'],
    headline: 'Fertilizer Shortage: Dealers Ration Nitrogen',
    body: 'Price controls end and nitrogen prices more than double. Some dealers are allocating supplies to regular customers only.',
    confidence: 'high', effects: [win(FERT, [1974, 1], [1975, 12]), spike('anhydrous', [1974, 4], 0.15, 2, 3)],
  },
  {
    id: 'drought-1974', date: [1974, 8], category: 'weather', driftable: true,
    headline: 'Late Planting, Dry August and Early Frost Cut Crop',
    body: 'A wet spring, summer drought and an early September frost combine to shrink the 1974 corn and soybean crops.',
    confidence: 'medium', effects: [win(['yieldCorn', 'yieldSoy'], [1974, 1], [1974, 12])],
  },
  {
    id: 'land-boom-1976', date: [1976, 3], category: 'macro', driftable: false,
    headline: 'Land Prices Soar as Farmers Bid for Every Acre',
    body: 'Farmland values are rising 20% a year. Lenders are eager to finance expansion on the strength of rising collateral.',
    confidence: 'high', effects: [],
  },
  {
    id: 'oil-shock-1979', date: [1979, 2], category: 'energy', driftable: true, after: ['oil-embargo-1973'],
    headline: 'Iran Turmoil Sends Oil Soaring; Diesel Lines Return',
    body: 'Revolution in Iran disrupts world oil supplies. Spring planting diesel supplies are tight across the Midwest.',
    confidence: 'high', effects: [win([...ENERGY, 'natgas'], [1979, 2], [1981, 12])],
  },
  {
    id: 'volcker-1979', date: [1979, 10], category: 'macro', driftable: true,
    headline: 'Fed Clamps Down on Inflation; Prime Rate Jumps',
    body: 'The Federal Reserve shifts to targeting the money supply. Operating loans that cost 9% last year now cost far more.',
    confidence: 'high',
    effects: [
      win(['prime', 'tbill'], [1979, 10], [1982, 9]),
      spike('prime', [1980, 4], 0.22, 2, 2), spike('prime', [1980, 12], 0.28, 2, 3),
      spike('tbill', [1980, 4], 0.2, 2, 2), spike('tbill', [1981, 1], 0.15, 2, 3),
    ],
  },
  {
    id: 'soviet-embargo-1980', date: [1980, 1], category: 'policy', driftable: true, after: ['soviet-grain-1972'],
    headline: 'Carter Embargoes Grain to Soviets Over Afghanistan',
    body: '17 million tons of contracted grain will not ship. Futures trading is suspended for two days; prices fall the limit when it reopens.',
    confidence: 'high', effects: [spike('corn', [1980, 1], -0.09, 1, 3), spike('wheat', [1980, 1], -0.09, 1, 3), spike('soybeans', [1980, 1], -0.07, 1, 3)],
  },
  {
    id: 'drought-1980', date: [1980, 7], category: 'weather', driftable: true,
    headline: 'Heat Wave Bakes Corn Belt; Crop Prospects Wither',
    body: 'Weeks above 100 degrees cut corn and soybean yields across the southern Corn Belt.',
    confidence: 'high', effects: [win(['yieldCorn', 'yieldSoy'], [1980, 1], [1980, 12]), spike('corn', [1980, 8], 0.08, 2, 4)],
  },
  {
    id: 'staggers-1980', date: [1980, 10], category: 'law', driftable: false,
    headline: 'Staggers Act Deregulates Railroads',
    body: 'Railroads gain freedom to set rates, sign contracts and abandon unprofitable branch lines. Country elevators on light-density lines worry.',
    confidence: 'high', effects: [{ kind: 'rule', ruleId: 'staggers', on: true }],
  },
  {
    id: 'rock-island-1980', date: [1980, 3], category: 'industry', driftable: false,
    headline: 'Rock Island Railroad Ordered Liquidated',
    body: 'A federal court orders the bankrupt Rock Island Lines liquidated. Elevators on its lines face an uncertain future.',
    confidence: 'high', effects: [{ kind: 'entity', brandId: 'rr-rock-island', op: 'fail' }],
  },
  {
    id: 'pik-1983', date: [1983, 1], category: 'policy', driftable: false,
    headline: 'Payment-in-Kind Program Will Idle Millions of Acres',
    body: 'Farmers will be paid in surplus grain to leave land idle. Input dealers brace for the slowest spring in memory.',
    confidence: 'high', effects: [{ kind: 'rule', ruleId: 'pik-1983', on: true }],
  },
  {
    id: 'drought-1983', date: [1983, 7], category: 'weather', driftable: true, after: ['drought-1980'],
    headline: 'Drought on Top of PIK: Corn Crop Smallest in Years',
    body: 'Hot, dry weather in July and August turns a short crop shorter.',
    confidence: 'high', effects: [win(['yieldCorn', 'yieldSoy'], [1983, 1], [1983, 12]), spike('corn', [1983, 8], 0.1, 2, 3), spike('soybeans', [1983, 8], 0.12, 2, 3)],
  },
  {
    id: 'farm-crisis-1984', date: [1984, 6], category: 'macro', driftable: true, after: ['volcker-1979'],
    headline: 'Farm Debt Crisis Deepens as Land Values Tumble',
    body: 'Falling land values, high interest rates and weak exports push thousands of farmers and rural banks toward failure.',
    confidence: 'high', effects: [win(['landValue', 'netFarmIncome'], [1982, 1], [1988, 12])],
  },
  {
    id: 'farm-bill-1985', date: [1985, 12], category: 'law', driftable: false,
    headline: 'Food Security Act Creates Conservation Reserve',
    body: 'The 1985 farm bill lowers loan rates and pays farmers to retire erodible land for ten years under the CRP.',
    confidence: 'high', effects: [{ kind: 'rule', ruleId: 'crp', on: true }],
  },
  {
    id: 'oil-collapse-1986', date: [1986, 2], category: 'energy', driftable: true, after: ['oil-shock-1979'],
    headline: 'Oil Collapses Below $15 as Saudis Open the Taps',
    body: 'Crude prices halve in a matter of weeks. Fuel margins widen briefly for dealers with low-cost inventory sold—and narrow for those who bought high.',
    confidence: 'high', effects: [win(ENERGY, [1985, 12], [1986, 12])],
  },
  {
    id: 'ag-credit-act-1987', date: [1987, 1], category: 'law', driftable: false,
    headline: 'Agricultural Credit Act Rescues Farm Credit System',
    body: 'Congress provides up to $4 billion to shore up the Farm Credit System and authorizes consolidation of the Banks for Cooperatives.',
    confidence: 'high', effects: [{ kind: 'rule', ruleId: 'ag-credit-act', on: true }],
  },
  {
    id: 'drought-1988', date: [1988, 6], category: 'weather', driftable: true, after: ['drought-1983'],
    headline: 'Drought of \'88: Corn Belt Crop Burns Up',
    body: 'The worst drought since the Dust Bowl slashes corn yields by a third. Barges sit stranded on a low Mississippi.',
    confidence: 'high', effects: [win(['yieldCorn', 'yieldSoy'], [1988, 1], [1988, 12]), spike('corn', [1988, 6], 0.22, 2, 4), spike('soybeans', [1988, 6], 0.2, 2, 4), spike('soymeal', [1988, 6], 0.2, 2, 4)],
  },
  {
    id: 'ust-rules-1988', date: [1988, 9], category: 'law', driftable: false,
    headline: 'EPA Issues Underground Storage Tank Rules',
    body: 'Owners of underground fuel tanks have ten years to add leak detection, spill and corrosion protection—or close the tanks.',
    confidence: 'high', effects: [{ kind: 'rule', ruleId: 'ust-1988', on: true }],
  },
  {
    id: 'cobank-1989', date: [1989, 1], category: 'industry', driftable: false,
    headline: 'Banks for Cooperatives Merge to Form CoBank',
    body: 'Eleven district Banks for Cooperatives and the Central Bank consolidate into the National Bank for Cooperatives, known as CoBank.',
    confidence: 'high', effects: [{ kind: 'entity', brandId: 'cobank', op: 'form' }],
  },
  {
    id: 'gulf-war-1990', date: [1990, 8], category: 'energy', driftable: true,
    headline: 'Iraq Invades Kuwait; Diesel Prices Spike Before Harvest',
    body: 'Crude doubles in two months. Grain dryers and harvest trucks will run on the most expensive fuel in years.',
    confidence: 'high', effects: [spike('crude', [1990, 10], 0.45, 2, 3), spike('diesel', [1990, 10], 0.4, 2, 3), spike('gasoline', [1990, 10], 0.3, 2, 3), spike('propane', [1990, 10], 0.3, 2, 3)],
  },
  {
    id: 'flood-1993', date: [1993, 7], category: 'weather', driftable: true,
    headline: 'Great Flood Closes Mississippi to Barges',
    body: 'Record flooding along the upper Mississippi and Missouri shuts river traffic for weeks and drowns bottomland crops.',
    confidence: 'high', effects: [spike('corn', [1993, 7], 0.08, 1, 3), spike('soybeans', [1993, 7], 0.1, 1, 3)],
  },
  {
    id: 'price-spike-1995', date: [1995, 7], category: 'markets', driftable: true, after: ['drought-1988'],
    headline: 'Corn Tops $5 as Stocks Hit Record Lows',
    body: 'A short 1995 crop and strong exports drive corn to record highs by spring 1996. Elevators with hedge-to-arrive contracts face angry farmers.',
    confidence: 'high', effects: [win(['corn', 'wheat', 'soybeans', 'soymeal'], [1995, 7], [1997, 6]), spike('corn', [1996, 7], 0.22, 4, 3), spike('wheat', [1996, 5], 0.2, 3, 3)],
  },
  {
    id: 'hta-blowup-1996', date: [1996, 5], category: 'industry', driftable: true, after: ['price-spike-1995'],
    headline: 'Hedge-to-Arrive Contracts Blow Up; Lawsuits Fly',
    body: 'Farmers who rolled HTA contracts forward face huge losses as old-crop prices soar. Some elevators face default and litigation.',
    confidence: 'high', effects: [],
  },
  {
    id: 'fair-act-1996', date: [1996, 4], category: 'law', driftable: false,
    headline: 'Freedom to Farm Act Ends Acreage Set-Asides',
    body: 'The FAIR Act replaces deficiency payments with fixed transition payments and lets farmers plant what they want.',
    confidence: 'high', effects: [{ kind: 'rule', ruleId: 'freedom-to-farm', on: true }],
  },
  {
    id: 'biotech-1996', date: [1996, 3], category: 'industry', driftable: false,
    headline: 'Roundup Ready Soybeans Hit the Market',
    body: 'Herbicide-tolerant soybeans and Bt corn are commercialized this season. Seed and chemical programs will never be the same.',
    confidence: 'high', effects: [{ kind: 'rule', ruleId: 'biotech-seed', on: true }],
  },
  {
    id: 'asia-crisis-1997', date: [1997, 10], category: 'markets', driftable: true, after: ['price-spike-1995'],
    headline: 'Asian Financial Crisis Cuts Grain Exports',
    body: 'Currency collapses across Asia cut demand for U.S. grain and meat. Prices slide into the 1998 harvest.',
    confidence: 'high', effects: [win(['corn', 'soybeans', 'wheat', 'soymeal'], [1997, 10], [2000, 12])],
  },
  {
    id: 'hog-collapse-1998', date: [1998, 12], category: 'livestock', driftable: true,
    headline: 'Hog Prices Crash to Depression-Era Lows',
    body: 'Packing capacity can\'t keep up with record hog numbers. Live hogs sell for as little as $8 per hundredweight; small producers exit en masse.',
    confidence: 'high', effects: [win(['hogs'], [1998, 6], [1999, 9]), spike('hogs', [1998, 12], -0.6, 3, 2)],
  },
  {
    id: 'natgas-spike-2000', date: [2000, 12], category: 'energy', driftable: true,
    headline: 'Natural Gas Spike Shuts Nitrogen Plants',
    body: 'Natural gas over $9 idles ammonia plants across the country. Spring nitrogen will be expensive and scarce.',
    confidence: 'high', effects: [win(['natgas', 'anhydrous', 'urea', 'uan28'], [2000, 6], [2001, 9]), spike('natgas', [2000, 12], 0.6, 3, 3), spike('anhydrous', [2001, 3], 0.2, 3, 3)],
  },
  {
    id: 'farmland-bankruptcy-2002', date: [2002, 5], category: 'industry', driftable: false,
    headline: 'Farmland Industries Files for Bankruptcy',
    body: 'The nation\'s largest farm cooperative seeks Chapter 11 protection. Member co-ops\' equity in Farmland is at risk.',
    confidence: 'high', effects: [{ kind: 'entity', brandId: 'farmland', op: 'fail' }],
  },
  {
    id: 'agway-bankruptcy-2002', date: [2002, 10], category: 'industry', driftable: false,
    headline: 'Agway Files Chapter 11',
    body: 'The Northeast supply cooperative files for bankruptcy and plans to sell its businesses.',
    confidence: 'high', effects: [{ kind: 'entity', brandId: 'agway', op: 'fail' }],
  },
  {
    id: 'rfs-2005', date: [2005, 8], category: 'law', driftable: false,
    headline: 'Energy Bill Mandates Renewable Fuels',
    body: 'The Energy Policy Act sets a renewable fuel standard. Ethanol plants are being planned across the Corn Belt.',
    confidence: 'high', effects: [{ kind: 'rule', ruleId: 'rfs-2005', on: true }],
  },
  {
    id: 'katrina-2005', date: [2005, 8], category: 'energy', driftable: true,
    headline: 'Katrina Shuts Gulf Ports and Refineries',
    body: 'Export elevators at New Orleans are closed and barge traffic stalls just ahead of harvest. Diesel jumps.',
    confidence: 'high', effects: [spike('diesel', [2005, 9], 0.3, 1, 3), spike('gasoline', [2005, 9], 0.35, 1, 2), spike('natgas', [2005, 10], 0.4, 2, 3), spike('corn', [2005, 9], -0.06, 1, 2)],
  },
  {
    id: 'ulsd-2006', date: [2006, 6], category: 'law', driftable: false,
    headline: 'Ultra-Low-Sulfur Diesel Required on Highways',
    body: 'Refiners and terminals switch to 15 ppm diesel for on-road use. Off-road follows by 2010.',
    confidence: 'high', effects: [{ kind: 'rule', ruleId: 'ulsd', on: true }],
  },
  {
    id: 'ethanol-boom-2006', date: [2006, 10], category: 'markets', driftable: true,
    headline: 'Ethanol Plants Bid Corn Higher',
    body: 'New ethanol plants are consuming a growing share of the corn crop. Local basis strengthens near the plants.',
    confidence: 'high', effects: [win(['corn'], [2006, 9], [2007, 6])],
  },
  {
    id: 'eisa-2007', date: [2007, 12], category: 'law', driftable: false,
    headline: 'Energy Independence Act Expands Renewable Fuel Mandate',
    body: 'The renewable fuel standard rises toward 36 billion gallons, with 15 billion from corn ethanol.',
    confidence: 'high', effects: [{ kind: 'rule', ruleId: 'rfs-2007', on: true }],
  },
  {
    id: 'commodity-boom-2008', date: [2008, 3], category: 'markets', driftable: true, after: ['ethanol-boom-2006'],
    headline: 'Commodity Boom: Corn Hits $7, Margin Calls Squeeze Elevators',
    body: 'Record prices bring record margin calls. Some elevators stop offering forward contracts because lenders can\'t keep up.',
    confidence: 'high',
    effects: [
      win([...GRAINS], [2007, 7], [2009, 6]), spike('corn', [2008, 6], 0.25, 3, 3), spike('soybeans', [2008, 7], 0.2, 3, 3), spike('wheat', [2008, 3], 0.35, 3, 3),
      win(['crude', 'diesel', 'gasoline'], [2007, 6], [2009, 6]), spike('crude', [2008, 7], 0.35, 4, 4), spike('diesel', [2008, 7], 0.3, 4, 4),
    ],
  },
  {
    id: 'fert-peak-2008', date: [2008, 9], category: 'markets', driftable: true, after: ['commodity-boom-2008'],
    headline: 'Fertilizer Prices Peak, Then Collapse',
    body: 'Potash and phosphate set records just as the financial crisis hits. Dealers holding high-priced inventory face painful write-downs.',
    confidence: 'high', effects: [win(FERT, [2007, 10], [2010, 6]), spike('anhydrous', [2008, 10], 0.35, 4, 6), spike('dap', [2008, 9], 0.35, 4, 6), spike('potash', [2009, 2], 0.25, 4, 6)],
  },
  {
    id: 'financial-crisis-2008', date: [2008, 9], category: 'macro', driftable: false,
    headline: 'Lehman Fails; Credit Markets Freeze',
    body: 'The financial crisis deepens. Commodity prices fall sharply and the Fed cuts rates toward zero.',
    confidence: 'high', effects: [],
  },
  {
    id: 'boom-2010', date: [2010, 7], category: 'markets', driftable: true, after: ['commodity-boom-2008'],
    headline: 'Grain Rally Resumes on Strong Chinese Demand',
    body: 'Russia\'s drought and Chinese soybean buying send prices back toward records.',
    confidence: 'high', effects: [win([...GRAINS], [2010, 7], [2014, 6])],
  },
  {
    id: 'drought-2012', date: [2012, 7], category: 'weather', driftable: true, after: ['drought-1988'],
    headline: 'Drought of 2012: Worst in Half a Century',
    body: 'Corn yields collapse across Illinois and Indiana. Corn tops $8; elevators wonder whether they\'ll have anything to dry.',
    confidence: 'high',
    effects: [win(['yieldCorn', 'yieldSoy'], [2012, 1], [2012, 12]), spike('corn', [2012, 8], 0.2, 2, 4), spike('soybeans', [2012, 8], 0.18, 2, 4), spike('soymeal', [2012, 8], 0.2, 2, 4)],
  },
  {
    id: 'west-texas-2013', date: [2013, 4], category: 'industry', driftable: false,
    headline: 'Fertilizer Plant Explosion Levels Texas Town',
    body: 'An ammonium nitrate explosion at a retail fertilizer facility in West, Texas kills 15. Regulators promise new scrutiny of ag retailers.',
    confidence: 'high', effects: [{ kind: 'rule', ruleId: 'post-west-scrutiny', on: true }],
  },
  {
    id: 'propane-2014', date: [2013, 12], category: 'energy', driftable: true,
    headline: 'Propane Shortage: Prices Triple in Frigid Winter',
    body: 'A wet corn harvest drained inventories and a polar vortex finishes the job. Suppliers are allocating; some customers can\'t get deliveries.',
    confidence: 'high', effects: [spike('propane', [2014, 1], 0.9, 2, 2)],
  },
  {
    id: 'rail-crisis-2014', date: [2014, 1], category: 'industry', driftable: true,
    headline: 'Rail Service Crisis Strands Grain',
    body: 'Oil trains and a hard winter clog the northern rail network. Shuttle orders are weeks late and basis falls.',
    confidence: 'medium', effects: [],
  },
  {
    id: 'lake-erie-2014', date: [2014, 8], category: 'law', driftable: false,
    headline: 'Algae Bloom Shuts Toledo Water Supply',
    body: 'A toxic algae bloom in Lake Erie leaves 400,000 people without tap water. Nutrient rules for farms in the basin are coming.',
    confidence: 'high', effects: [{ kind: 'rule', ruleId: 'nutrient-rules', on: true }],
  },
  {
    id: 'downturn-2014', date: [2014, 9], category: 'markets', driftable: true, after: ['boom-2010'],
    headline: 'Record Crops Push Grain Prices Lower',
    body: 'Back-to-back record harvests and a strong dollar end the boom. Farm income is falling.',
    confidence: 'high', effects: [win(['crude', 'diesel', 'gasoline', 'propane'], [2014, 10], [2016, 6])],
  },
  {
    id: 'mega-mergers-2017', date: [2017, 8], category: 'industry', driftable: false,
    headline: 'Dow and DuPont Complete Merger; More Deals Pending',
    body: 'Dow-DuPont closes, ChemChina buys Syngenta, and Bayer bids for Monsanto. Agrium and PotashCorp combine as Nutrien.',
    confidence: 'high', effects: [],
  },
  {
    id: 'eld-2017', date: [2017, 12], category: 'law', driftable: false,
    headline: 'Electronic Logging Devices Now Required',
    body: 'Most commercial truck drivers must record hours of service electronically. Ag haulers win temporary waivers.',
    confidence: 'high', effects: [{ kind: 'rule', ruleId: 'eld', on: true }],
  },
  {
    id: 'tax-reform-2018', date: [2018, 1], category: 'law', driftable: false,
    headline: 'Tax Law Cuts Corporate Rate to 21%; Co-op "Grain Glitch" Fixed in March',
    body: 'A new Section 199A deduction briefly favored selling to co-ops; Congress rewrote it in March as Section 199A(g).',
    confidence: 'high', effects: [{ kind: 'rule', ruleId: 'tcja', on: true }],
  },
  {
    id: 'trade-war-2018', date: [2018, 6], category: 'policy', driftable: true,
    headline: 'China Tariffs U.S. Soybeans; Basis Collapses',
    body: 'Retaliatory tariffs shut the largest soybean buyer out. USDA announces Market Facilitation Program payments.',
    confidence: 'high', effects: [win(['soybeans', 'soymeal'], [2018, 5], [2019, 12]), spike('soybeans', [2018, 7], -0.1, 2, 4)],
  },
  {
    id: 'prevent-plant-2019', date: [2019, 6], category: 'weather', driftable: true,
    headline: 'Record Prevented Planting as Rains Won\'t Stop',
    body: 'Millions of acres go unplanted in the wettest spring on record. Fertilizer and seed returns pile up.',
    confidence: 'high', effects: [win(['yieldCorn', 'yieldSoy'], [2019, 1], [2019, 12]), spike('corn', [2019, 6], 0.1, 2, 3)],
  },
  {
    id: 'pandemic-2020', date: [2020, 3], category: 'macro', driftable: false,
    headline: 'Pandemic Shuts Economy; Ethanol Plants Idle',
    body: 'Fuel demand collapses, ethanol plants shut down, and packing plants close as workers fall ill. Crude briefly trades below zero.',
    confidence: 'high',
    effects: [spike('crude', [2020, 4], -0.5, 1, 3), spike('gasoline', [2020, 4], -0.4, 1, 3), spike('corn', [2020, 4], -0.08, 1, 4), spike('hogs', [2020, 4], -0.35, 1, 2)],
  },
  {
    id: 'derecho-2020', date: [2020, 8], category: 'weather', driftable: true,
    headline: 'Derecho Flattens Crops and Grain Bins',
    body: 'A 140-mph inland hurricane crosses the Corn Belt, destroying bins and flattening fields just weeks before harvest.',
    confidence: 'high', effects: [],
  },
  {
    id: 'supply-shock-2021', date: [2021, 3], category: 'markets', driftable: true, after: ['trade-war-2018'],
    headline: 'Commodities Surge as Supply Chains Snarl',
    body: 'Chinese buying, low stocks and tangled supply chains drive grain and input prices sharply higher.',
    confidence: 'high', effects: [win([...GRAINS], [2020, 9], [2023, 6]), win(FERT, [2021, 6], [2023, 6])],
  },
  {
    id: 'ukraine-2022', date: [2022, 2], category: 'markets', driftable: true, after: ['supply-shock-2021'],
    headline: 'Russia Invades Ukraine; Wheat and Fertilizer Soar',
    body: 'Black Sea shipping halts. Wheat jumps the limit, diesel hits records, and nitrogen tops $1,500 a ton.',
    confidence: 'high',
    effects: [spike('wheat', [2022, 3], 0.3, 1, 3), spike('anhydrous', [2022, 4], 0.2, 2, 4), spike('diesel', [2022, 6], 0.25, 3, 4), win(['diesel', 'crude', 'gasoline'], [2022, 2], [2022, 12])],
  },
  {
    id: 'rate-hikes-2022', date: [2022, 3], category: 'macro', driftable: false,
    headline: 'Fed Begins Steepest Rate Hikes in Decades',
    body: 'Inflation forces the Federal Reserve to raise rates rapidly. Operating lines are getting expensive again.',
    confidence: 'high', effects: [],
  },
  {
    id: 'low-river-2022', date: [2022, 10], category: 'weather', driftable: true,
    headline: 'Low Mississippi Strands Barges at Harvest',
    body: 'Drought drops the river to record lows. Barge freight soars and interior basis plunges.',
    confidence: 'high', effects: [],
  },
  {
    id: 'renewable-diesel-2023', date: [2023, 3], category: 'industry', driftable: false,
    headline: 'Crush Plants Expand for Renewable Diesel',
    body: 'New soybean crush capacity is being built to feed renewable diesel demand, firming soybean basis.',
    confidence: 'medium', effects: [],
  },
  {
    id: 'tight-margins-2024', date: [2024, 6], category: 'markets', driftable: true,
    headline: 'Lower Prices and High Costs Squeeze Farm Margins',
    body: 'Large crops have pushed grain prices down while input and interest costs remain high.',
    confidence: 'medium', effects: [],
  },
];
