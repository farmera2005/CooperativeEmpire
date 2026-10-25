// Equipment catalog (D-129): the individual things a co-op builds — a 48-ft bin, a 1,500 bu/hr
// tower dryer, a 70-ft truck scale — each in the sizes its era offered, from the makers who
// sold it then. A facility is the sum of its installed units; there is no building "3 million
// bushels of storage" except as bins, silos or buildings.
//
// Prices hang off the component cost anchors in facilities.ts (2024 $ per unit of capacity,
// scaled by the construction-cost index and each component's real-cost path) times a size
// factor (bigger units cost less per bushel) and the maker's price position. Maker traits are
// game abstractions of a product line's general reputation (price, service network, lead
// time), not product reviews; with `fictionalizeBrands` the names are fictional.

import { s, type Confidence, type Sourced } from './types';
import type { ComponentId } from './facilities';

/** One size/type of unit that can be built. */
export interface EquipmentModel {
  id: string;
  component: ComponentId;
  label: string;
  /** Capacity in the component's unit (bu, bu/hr, tons, gal, sq ft, tons/yr; 1 for "each"). */
  size: number;
  /** Short spec shown in the catalog, e.g. "48 ft dia × 9 rings". */
  spec?: string;
  availableFrom: number;
  /** Exclusive: no longer offered new from this year. */
  availableTo?: number;
  /** Real cost per unit of capacity against the component anchor: size economies (default 1). */
  costFactor?: number;
  /** Ground the unit takes, acres (drives, setbacks included). */
  footprintAcres: number;
  /** Units that do not need a maker (land, ground piles, rail track). */
  generic?: boolean;
  /** Dryers: fuel per point of moisture removed against the 2024 typical (older designs burn more). */
  fuelUse?: number;
  confidence: Confidence;
  source?: string;
}

/** A maker's line of one or more components, with the traits that set it apart. */
export interface MakerLine {
  /** Brand id in brands.ts (name goes through brandName). */
  brandId: string;
  components: ComponentId[];
  /** Only these models (default: every model of the components). */
  models?: string[];
  /** Years this maker sold this line in the US (defaults to the brand's years). */
  from?: number;
  /** Exclusive end year. */
  to?: number;
  /** Price against the typical maker (1 = typical). */
  price: number;
  /** Wear rate against typical (below 1 lasts longer). */
  durability: number;
  /** Repair spending against typical (below 1 cheaper to keep up). */
  upkeep: number;
  /** Extra months from order to delivery (backlog, distance from the plant). */
  leadMonths: number;
  /** Rated output against typical, for dryers, legs and application rigs (default 1). */
  capacity?: number;
  /** Dryers: fuel use against typical (default 1). */
  fuelUse?: number;
  /** Neutral, factual note on the maker. */
  note: string;
  confidence: Confidence;
  source?: string;
}

/** Consultants and project managers (D-129). Fictional firms; skill is hidden from the player. */
export interface ConsultingParams {
  /** Firms active in the region at any time. */
  rosterSize: number;
  /** Design study fee, 2024 $ (low/high), by facility kind scale. */
  designFee: Sourced<[number, number]>;
  /** Project management fee as a share of construction cost (low/high). */
  pmFeePct: Sourced<[number, number]>;
  /** Spread of true skill (beta-like: mean, sd) and how noisy the visible reputation is. */
  skillMean: number;
  skillSd: number;
  reputationNoise: number;
  /** Cost overrun share and schedule slip (months) for a project with no PM, and their spread. */
  overrunNoPm: Sourced<[mean: number, sd: number]>;
  slipNoPm: Sourced<[mean: number, sd: number]>;
  /** How much a skill-1 PM shrinks the mean and spread of overruns; a skill-0 PM adds this much. */
  pmEffect: number;
  /** A poor designer's sizing error (sd of log ratio at skill 0) and at skill 1. */
  designErrorSd: [atZero: number, atOne: number];
  /** How far a self-serving designer oversizes (share) and how often they pad with premium brands. */
  goldPlating: number;
  /** Years a firm stays in business (low/high). */
  firmYears: [number, number];
  /** What a typical supply site serves, for sizing designs: crop acres (agronomy, energy), head (feed), residents (retail). */
  siteServes: Sourced<{ agronomy: number; energy: number; feedmill: number; station: number; farmstore: number }>;
  /** Share of the grain within reach a new house can expect, and receipts per bushel of space (turns). */
  grainShareNew: number;
  turns: number;
}

const m = (id: string, component: ComponentId, label: string, size: number, availableFrom: number, availableTo: number | undefined, footprintAcres: number, costFactor: number, confidence: Confidence, extra: Partial<EquipmentModel> = {}): EquipmentModel =>
  ({ id, component, label, size, availableFrom, ...(availableTo !== undefined ? { availableTo } : {}), footprintAcres, costFactor, confidence, ...extra });

const RES = 'docs/research/equipment.md (D-129): manufacturer histories, extension and trade press';

/**
 * Catalog models. Size factors are set so the era's typical unit costs what the component
 * anchor says (1.0), with smaller units dearer per unit of capacity and bigger ones cheaper.
 * Years are when a size became common for commercial co-op sites.
 */
export const MODELS: EquipmentModel[] = [
  m('land', 'site', 'Land (acre)', 1, 1900, undefined, 0, 1, 'low', { generic: true }),
  // ---- Grain storage: corrugated steel bins and tanks ----
  m('bin-hopper-24', 'storage-steel', '24 ft hopper tank (wet holding / surge)', 8_000, 1960, undefined, 0.03, 1.6, 'low', { spec: '24 ft dia, 45° hopper', source: RES }),
  m('bin-30', 'storage-steel', '30 ft steel bin', 18_000, 1955, 2000, 0.05, 1.35, 'low', { spec: '30 ft dia × 8 rings' }),
  m('bin-36', 'storage-steel', '36 ft steel bin', 30_000, 1960, undefined, 0.07, 1.2, 'medium', { spec: '36 ft dia × 10 rings', source: 'Steel annexes of ~30,000 bu became common in the 1970s' }),
  m('bin-48', 'storage-steel', '48 ft steel bin', 60_000, 1965, undefined, 0.1, 1.08, 'low', { spec: '48 ft dia × 11 rings' }),
  m('bin-60', 'storage-steel', '60 ft commercial tank', 110_000, 1970, undefined, 0.15, 1.0, 'low', { spec: '60 ft dia, stiffened' }),
  m('bin-72', 'storage-steel', '72 ft commercial tank', 180_000, 1978, undefined, 0.2, 0.95, 'low', { spec: '72 ft dia' }),
  m('bin-90', 'storage-steel', '90 ft commercial tank', 330_000, 1985, undefined, 0.3, 0.88, 'low', { spec: '90 ft dia' }),
  m('bin-105', 'storage-steel', '105 ft commercial tank', 550_000, 1995, undefined, 0.4, 0.82, 'medium', { spec: '105 ft dia', source: '105 ft was the standard large co-op tank before about 2015' }),
  m('bin-135', 'storage-steel', '135 ft commercial tank', 1_300_000, 2013, undefined, 0.6, 0.74, 'medium', { spec: '135 ft dia', source: '1.3M-bu 135 ft tanks common at co-ops since about 2019' }),
  m('bin-156', 'storage-steel', '156 ft commercial tank', 1_800_000, 2019, undefined, 0.75, 0.72, 'high', { spec: '156 ft dia', source: 'GSI tank for Red Wing Grain, Aug 2019; Brock 156 ft' }),
  // ---- Concrete ----
  m('silo-single', 'storage-concrete', 'Slipform concrete silo', 70_000, 1930, 1990, 0.06, 1.15, 'low', { spec: '30 ft dia × 120 ft' }),
  m('silo-group', 'storage-concrete', 'Slipform silo group (4 tanks + interstices)', 350_000, 1930, 1990, 0.25, 1.0, 'low', { spec: '4 × 30 ft dia × 130 ft' }),
  m('jumpform-tank', 'storage-concrete', 'Large-diameter jumpform concrete tank', 400_000, 1990, undefined, 0.3, 0.55, 'medium', { spec: '~80 ft dia × 130 ft', source: '2021: 385,000 bu jumpform tank for $1.6M (~$4.16/bu)' }),
  // ---- Flat storage and piles ----
  m('flat-250', 'storage-flat', 'Flat storage building, 250,000 bu', 250_000, 1955, undefined, 1.0, 1.0, 'low'),
  m('flat-500', 'storage-flat', 'Flat storage building, 500,000 bu', 500_000, 1970, undefined, 1.8, 0.9, 'low'),
  m('flat-1m', 'storage-flat', 'Flat storage building, 1,000,000 bu', 1_000_000, 1985, undefined, 3.2, 0.82, 'low', { source: 'Up to 2M-bu buildings in the 2010s' }),
  m('pile-tarp', 'ground-pile', 'Ground pile on asphalt pad with tarp', 500_000, 1970, undefined, 2.5, 0.7, 'low', { generic: true }),
  m('bunker-500', 'ground-pile', 'Bunker with walls, aeration and cover', 500_000, 1990, undefined, 2.2, 1.0, 'medium', { source: 'GSI louvered bunker ~$0.15–0.40/bu (2020)' }),
  m('bunker-1m', 'ground-pile', 'Bunker with walls, aeration and cover', 1_000_000, 2000, undefined, 4.0, 0.9, 'low'),
  // ---- Receiving and handling ----
  m('leg-3k', 'receiving', 'Receiving pit & 3,000 bu/hr leg', 3_000, 1950, 2000, 0.05, 1.3, 'low', { source: 'Country legs 2,000–5,000 bu/hr in 1970' }),
  m('leg-6k', 'receiving', 'Receiving pit & 6,000 bu/hr leg', 6_000, 1960, undefined, 0.05, 1.1, 'low'),
  m('leg-10k', 'receiving', 'Receiving pit & 10,000 bu/hr leg', 10_000, 1975, undefined, 0.06, 1.0, 'low'),
  m('leg-20k', 'receiving', 'Twin pits & 20,000 bu/hr leg', 20_000, 1990, undefined, 0.08, 0.85, 'low'),
  m('leg-40k', 'receiving', 'Multi-pit 40,000 bu/hr leg with tower', 40_000, 2000, undefined, 0.12, 0.75, 'low'),
  m('leg-60k', 'receiving', 'Shuttle-class 60,000 bu/hr leg', 60_000, 2008, undefined, 0.15, 0.7, 'medium', { source: 'Legs up to 60,000, later 80,000 bu/hr' }),
  m('dryer-col-500', 'dryer', 'Column dryer, 500 bu/hr', 500, 1960, 1995, 0.04, 1.25, 'low', { fuelUse: 1.35 }),
  m('dryer-col-1000', 'dryer', 'Column dryer, 1,000 bu/hr', 1_000, 1966, 2005, 0.05, 1.1, 'medium', { fuelUse: 1.3, source: 'Commercial dryers ≥1,000 bu/hr in 1968–69 purchases' }),
  m('dryer-col-2000', 'dryer', 'Column dryer, 2,000 bu/hr', 2_000, 1975, undefined, 0.06, 1.0, 'low', { fuelUse: 1.15 }),
  m('dryer-tower-1500', 'dryer', 'Tower dryer, 1,500 bu/hr', 1_500, 1975, undefined, 0.05, 1.05, 'low', { fuelUse: 1.1 }),
  m('dryer-tower-3000', 'dryer', 'Tower dryer, 3,000 bu/hr', 3_000, 1985, undefined, 0.06, 0.9, 'low', { fuelUse: 1.0 }),
  m('dryer-tower-5000', 'dryer', 'Tower dryer, 5,000 bu/hr', 5_000, 1998, undefined, 0.07, 0.85, 'low', { fuelUse: 0.95 }),
  m('dryer-tower-7000', 'dryer', 'Tower dryer with heat recovery, 7,000 bu/hr', 7_000, 2012, undefined, 0.08, 0.82, 'medium', { fuelUse: 0.85, source: 'Current towers reach about 7,000 bu/hr' }),
  m('scale-mech-50', 'truck-scale', '50 ft mechanical truck scale & probe', 1, 1950, 1986, 0.06, 0.8, 'low', { source: 'Lever scales, 34–50 ft decks' }),
  m('scale-elec-70', 'truck-scale', '70 ft electronic truck scale & probe', 1, 1982, undefined, 0.08, 1.0, 'medium', { source: '70 ft standard after the 1982 truck-size law; $100–150k installed (2020s)' }),
  m('scale-elec-120', 'truck-scale', '120 ft electronic scale, probe & kiosk', 1, 1998, undefined, 0.12, 1.5, 'low'),
  // ---- Rail ----
  m('lo-single', 'loadout-single', 'Rail spur & single-car loadout', 1, 1900, undefined, 1.0, 1.0, 'low'),
  m('lo-26', 'loadout-unit25', '26-car unit train track & loadout', 1, 1972, undefined, 4.0, 1.0, 'medium', { source: 'Multiple-car grain rates first offered 1972' }),
  m('lo-54', 'loadout-unit50', '54-car unit train track & loadout', 1, 1978, undefined, 8.0, 1.0, 'medium', { source: 'Unit trains spread with the Staggers Act (1980)' }),
  m('lo-75', 'loadout-unit75', '75-car track & loadout', 1, 1982, undefined, 12.0, 1.0, 'low'),
  m('lo-110', 'loadout-shuttle', '110-car shuttle loop & high-speed loadout', 1, 1996, undefined, 60.0, 1.0, 'high', { source: 'BNSF shuttle network from 1996; 110 cars in 15 hours' }),
  // ---- Agronomy ----
  m('fert-shed-1500', 'dry-fert-plant', 'Bulk fertilizer shed, 1,500 t, batch blender', 1_500, 1960, 2000, 0.6, 1.15, 'low'),
  m('fert-shed-4000', 'dry-fert-plant', 'Fertilizer plant, 4,000 t, rotary blender', 4_000, 1970, undefined, 1.0, 1.0, 'low', { source: 'Rotary drum blender from 1961' }),
  m('fert-tower-10000', 'dry-fert-plant', 'Fertilizer plant, 10,000 t, blend tower', 10_000, 1995, undefined, 1.8, 0.88, 'low'),
  m('fert-tower-20000', 'dry-fert-plant', 'Fertilizer plant, 20,000 t, blend tower', 20_000, 2008, undefined, 3.0, 0.8, 'low', { source: '10–40k t buildings in the 2020s' }),
  m('nh3-18k', 'nh3-storage', 'Anhydrous tank, 18,000 gal (~40 t)', 40, 1960, undefined, 0.15, 1.1, 'medium'),
  m('nh3-30k', 'nh3-storage', 'Anhydrous tank, 30,000 gal (~65 t)', 65, 1965, undefined, 0.2, 1.0, 'medium', { source: '12k, 18k, 30k gal common; 45k and 90k offered' }),
  m('nh3-90k', 'nh3-storage', 'Anhydrous tank, 90,000 gal (~195 t)', 195, 1990, undefined, 0.4, 0.85, 'medium'),
  m('liq-poly-100', 'liquid-fert-tanks', 'Poly tank battery (~100 t)', 100, 1980, undefined, 0.05, 1.2, 'low'),
  m('liq-steel-500', 'liquid-fert-tanks', 'Vertical steel tank (~500 t)', 500, 1970, undefined, 0.15, 1.0, 'low'),
  m('liq-steel-1500', 'liquid-fert-tanks', 'Vertical steel tank (~1,500 t)', 1_500, 1985, undefined, 0.3, 0.9, 'low'),
  m('chem-wh-basic', 'chem-warehouse', 'Crop protection warehouse', 1, 1960, 1988, 0.4, 0.7, 'low'),
  m('chem-wh-contain', 'chem-warehouse', 'Crop protection warehouse, containment & load pad', 1, 1988, undefined, 0.6, 1.0, 'high', { source: 'State containment rules from the late 1980s; EPA rule 2006, required 2009–11' }),
  m('seed-wh-bag', 'seed-warehouse', 'Bagged seed warehouse', 1, 1950, undefined, 0.4, 0.6, 'low'),
  m('seed-bulk-treat', 'seed-warehouse', 'Bulk seed warehouse with treater', 1, 1998, undefined, 0.5, 1.0, 'low'),
  m('app-pull', 'applicator', 'Pull-type sprayer & NH3 toolbar rig', 1, 1955, 2000, 0.02, 0.3, 'low'),
  m('app-floater', 'applicator', 'Flotation applicator (floater)', 1, 1972, undefined, 0.02, 0.9, 'medium', { source: 'TerraGator floater early 1970s' }),
  m('app-sprayer', 'applicator', 'Self-propelled sprayer', 1, 1975, undefined, 0.02, 0.8, 'low'),
  m('app-sprayer-120', 'applicator', 'Self-propelled sprayer, 120 ft boom', 1, 2008, undefined, 0.02, 1.15, 'low', { source: '1,200–1,600 gal, 120–135 ft booms (2024)' }),
  // ---- Feed ----
  m('mill-15k', 'feed-mill', 'Country feed mill, 15,000 t/yr', 15_000, 1950, 2000, 1.2, 1.25, 'low', { source: 'Country co-op mills 5–25k t/yr in 1970' }),
  m('mill-40k', 'feed-mill', 'Feed mill, 40,000 t/yr', 40_000, 1975, undefined, 2.0, 1.0, 'low'),
  m('mill-100k', 'feed-mill', 'Automated feed mill, 100,000 t/yr', 100_000, 1995, undefined, 3.5, 0.85, 'low', { source: 'About $112 per ton of annual capacity for a 250k t/yr mill' }),
  m('pellet-mill', 'pellet-mill', 'Pellet mill line', 1, 1950, undefined, 0.05, 1.0, 'low'),
  m('feed-truck-12', 'bulk-feed-truck', 'Bulk feed truck, 12 t single axle', 1, 1950, 1995, 0.01, 0.8, 'low'),
  m('feed-truck-24', 'bulk-feed-truck', 'Bulk feed truck, 24 t tandem', 1, 1985, undefined, 0.01, 1.15, 'low'),
  // ---- Energy ----
  m('fuel-tank-12k', 'bulk-fuel-plant', 'Fuel tank, 12,000 gal, with containment', 12_000, 1950, undefined, 0.06, 1.15, 'low', { generic: true }),
  m('fuel-tank-20k', 'bulk-fuel-plant', 'Fuel tank, 20,000 gal, with containment', 20_000, 1960, undefined, 0.08, 1.0, 'low', { generic: true }),
  m('fuel-tank-30k', 'bulk-fuel-plant', 'Fuel tank, 30,000 gal, with containment', 30_000, 1985, undefined, 0.1, 0.9, 'low', { generic: true }),
  m('lp-18k', 'propane-storage', 'Propane tank, 18,000 gal', 18_000, 1950, undefined, 0.15, 1.1, 'medium'),
  m('lp-30k', 'propane-storage', 'Propane tank, 30,000 gal', 30_000, 1955, undefined, 0.2, 1.0, 'medium', { source: '30k gal the most common bulk-plant size' }),
  m('lp-90k', 'propane-storage', 'Propane tank, 90,000 gal', 90_000, 1985, undefined, 0.35, 0.85, 'medium'),
  m('tankwagon', 'fuel-truck', 'Tankwagon / bobtail, 2,500 gal', 1, 1950, 2000, 0.01, 0.85, 'low'),
  m('tankwagon-big', 'fuel-truck', 'Tankwagon / bobtail, 3,500–4,000 gal', 1, 1985, undefined, 0.01, 1.0, 'low', { source: 'Bobtails 2,600–5,000 gal' }),
  m('cardlock', 'cardtrol', 'Unattended card-lock fueling site', 1, 1975, undefined, 0.3, 1.0, 'low', { source: 'Card and key systems from the 1970s, widespread at co-ops in the 1980s' }),
  // ---- Retail ----
  m('station-kiosk', 'c-store', 'Service station with service bays', 1_000, 1950, 1990, 0.6, 0.9, 'low'),
  m('cstore-2400', 'c-store', 'Convenience store & canopy, 2,400 sq ft', 2_400, 1980, undefined, 0.8, 1.0, 'low'),
  m('cstore-4500', 'c-store', 'Convenience store with food service, 4,500 sq ft', 4_500, 2005, undefined, 1.2, 1.1, 'low', { source: '4,000–6,000 sq ft stores with food service, 2015–25' }),
  m('store-5k', 'farm-store', 'Farm & home store, 5,000 sq ft', 5_000, 1950, undefined, 0.8, 1.05, 'low'),
  m('store-10k', 'farm-store', 'Farm & home store, 10,000 sq ft', 10_000, 1970, undefined, 1.3, 1.0, 'low'),
  m('store-20k', 'farm-store', 'Farm & home store, 20,000 sq ft', 20_000, 1990, undefined, 2.2, 0.92, 'low'),
];

const line = (brandId: string, components: ComponentId[], price: number, durability: number, upkeep: number, leadMonths: number, note: string, confidence: Confidence, extra: Partial<MakerLine> = {}): MakerLine =>
  ({ brandId, components, price, durability, upkeep, leadMonths, note, confidence, ...extra });

const STEEL_STORAGE: ComponentId[] = ['storage-steel'];
const BUILDINGS: ComponentId[] = ['storage-flat', 'chem-warehouse', 'seed-warehouse', 'farm-store'];
const TRUCKS: ComponentId[] = ['bulk-feed-truck', 'fuel-truck'];

/**
 * Who sold what, when. Traits are modest game abstractions (±5–15%), balanced so no maker is
 * best at everything: a lower price comes with more upkeep or a longer wait, and so on.
 */
export const MAKER_LINES: MakerLine[] = [
  // Bins
  line('butler', STEEL_STORAGE, 1.04, 0.95, 0.97, 1, 'Early steel-bin pioneer (Kansas City); bin division sold to CTB in 1997.', 'high', { to: 1997 }),
  line('behlen', [...STEEL_STORAGE, 'storage-flat', 'ground-pile'], 1.0, 0.97, 1.0, 1, 'Columbus, Nebraska maker of bins, hopper tanks, flat storage and S-Span buildings.', 'high'),
  line('chief', STEEL_STORAGE, 0.97, 1.0, 1.0, 1, 'Family-owned Nebraska maker of farm and commercial bins (bins from 1959).', 'high'),
  line('brock', STEEL_STORAGE, 1.03, 0.93, 0.98, 2, 'Indiana maker known for large commercial bins; part of CTB from 1976.', 'high'),
  line('gsi', [...STEEL_STORAGE, 'ground-pile'], 1.0, 0.98, 1.0, 2, 'Assumption, Illinois; among the largest bin makers by 1988; tanks to 156 ft.', 'high'),
  line('sukup', STEEL_STORAGE, 0.96, 1.0, 1.02, 1, 'Family-owned Iowa maker; holds the 165 ft largest-bin record (2021).', 'medium', { from: 1983 }),
  line('sioux-steel', [...STEEL_STORAGE, 'storage-flat'], 0.98, 0.97, 1.0, 2, 'Family-owned South Dakota maker; commercial bins to 132 ft.', 'high'),
  line('westeel', STEEL_STORAGE, 0.93, 1.06, 1.04, 3, 'Canadian maker of farm and commercial bins, long sold in the Plains.', 'medium'),
  line('stormor', STEEL_STORAGE, 0.94, 1.04, 1.03, 1, 'Long-running farm and commercial bin brand.', 'low'),
  line('cst', ['storage-steel', 'liquid-fert-tanks'], 1.1, 0.88, 0.95, 3, 'Bolted steel tanks (Columbian, 1916 on); smooth-wall, used for grain and fertilizer.', 'medium', { models: ['bin-36', 'bin-48', 'bin-60', 'bin-72', 'liq-steel-500', 'liq-steel-1500'] }),
  // Concrete and design-build contractors (silos, rail, mills)
  line('todd-sargent', ['storage-concrete', 'loadout-single', 'loadout-unit25', 'loadout-unit50', 'loadout-unit75', 'loadout-shuttle', 'feed-mill'], 1.06, 0.95, 0.97, 2, 'Ames, Iowa design-builder of grain and feed facilities since 1933.', 'high'),
  line('younglove', ['storage-concrete', 'loadout-single', 'loadout-unit25', 'loadout-unit50', 'loadout-unit75', 'loadout-shuttle', 'feed-mill'], 1.02, 0.97, 1.0, 2, 'Sioux City, Iowa design-builder of grain and feed-mill facilities.', 'medium'),
  line('hogenson', ['storage-concrete', 'loadout-single', 'loadout-unit25', 'loadout-unit50', 'loadout-unit75', 'loadout-shuttle'], 0.98, 1.0, 1.0, 3, 'West Fargo, North Dakota builder of slipform silos and steel bins since 1925.', 'medium'),
  line('chalmers-borton', ['storage-concrete', 'loadout-single', 'loadout-unit25', 'loadout-unit50'], 0.95, 1.0, 1.02, 1, 'Hutchinson, Kansas builder of slipform elevators across the Plains.', 'low'),
  // Legs and conveying
  line('universal-industries', ['receiving'], 1.03, 0.95, 0.98, 1, 'Cedar Falls, Iowa maker of bucket elevators and conveyors since 1906.', 'high'),
  line('schlagel', ['receiving'], 1.0, 0.97, 1.0, 1, 'Cambridge, Minnesota maker of legs, distributors and conveyors since 1957.', 'high'),
  line('intersystems', ['receiving', 'truck-scale'], 1.02, 0.98, 1.0, 2, 'Omaha maker of legs, conveyors, probes and samplers.', 'high', { models: ['leg-3k', 'leg-6k', 'leg-10k', 'leg-20k', 'leg-40k', 'leg-60k', 'scale-mech-50', 'scale-elec-70', 'scale-elec-120'] }),
  line('sweet', ['receiving'], 0.97, 1.0, 1.02, 1, 'Springfield, Ohio maker of galvanized legs and conveyors since 1955.', 'high'),
  line('gsi', ['receiving'], 0.98, 1.0, 1.0, 2, 'Full-line handling; added InterSystems and Johnson Systems in 2013–14.', 'medium', { from: 1985 }),
  // Dryers
  line('mc-dryers', ['dryer'], 1.02, 0.94, 0.97, 1, 'Crystal Lake, Illinois; continuous-flow dryers since 1957, still independent.', 'high'),
  line('delux', ['dryer'], 1.0, 0.98, 1.0, 1, 'Kearney, Nebraska; credited with the first vacuum-cooled dryer.', 'medium', { fuelUse: 0.95 }),
  line('zimmerman', ['dryer'], 1.04, 0.95, 0.98, 2, 'Litchfield, Illinois tower dryers with stainless sidewalls.', 'high', { fuelUse: 0.97 }),
  line('farm-fans', ['dryer'], 0.94, 1.05, 1.04, 1, 'Column and batch dryers; joined GSI in 2001.', 'medium'),
  line('meyer', ['dryer'], 0.96, 1.02, 1.02, 1, 'Frankfort, Indiana "Energy Miser" continuous-flow dryers; to Brock in 2002.', 'high', { fuelUse: 0.96 }),
  line('aeroglide', ['dryer'], 1.12, 0.9, 0.95, 4, 'Raleigh, North Carolina maker of industrial and large grain dryers.', 'high', { capacity: 1.05, models: ['dryer-col-2000', 'dryer-tower-3000', 'dryer-tower-5000', 'dryer-tower-7000'] }),
  line('gsi', ['dryer'], 1.0, 0.99, 1.0, 2, 'Tower dryers from the Zimmerman and Farm Fans lines (from 2001).', 'medium', { from: 2001 }),
  line('brock', ['dryer'], 0.99, 1.0, 1.0, 2, 'Meyer dryers under the Brock name (from 2002).', 'medium', { from: 2002 }),
  line('sukup', ['dryer'], 0.97, 1.0, 1.0, 1, 'Tower and portable dryers from the Iowa bin maker.', 'low', { from: 2006 }),
  line('shivvers', ['dryer'], 0.95, 1.0, 1.0, 1, 'Corydon, Iowa; computerized drying control (COMPU-DRY) from 1984.', 'medium', { models: ['dryer-col-500', 'dryer-col-1000', 'dryer-col-2000'], fuelUse: 0.94 }),
  // Scales
  line('fairbanks', ['truck-scale'], 1.02, 0.95, 1.0, 1, 'Platform and truck scales since 1830.', 'medium'),
  line('toledo-scale', ['truck-scale'], 1.04, 0.95, 0.98, 1, 'Industrial and vehicle scales; Mettler bought it in 1989.', 'medium'),
  line('mettler-toledo', ['truck-scale'], 1.06, 0.93, 0.97, 2, 'Vehicle scales and weighing systems.', 'medium'),
  line('cardinal-scale', ['truck-scale'], 0.97, 1.0, 1.0, 1, 'Large independently owned scale maker (Webb City, Missouri, 1950).', 'high'),
  line('rice-lake', ['truck-scale'], 0.96, 1.0, 1.02, 1, 'Wisconsin maker of truck scales and indicators.', 'high'),
  // Fertilizer
  line('doyle', ['dry-fert-plant'], 1.02, 0.96, 0.98, 2, 'Rotary drum blenders since 1961.', 'medium'),
  line('yargus', ['dry-fert-plant'], 0.98, 1.0, 1.0, 2, 'Marshall, Illinois blending and handling equipment since 1968.', 'medium'),
  line('behlen', ['dry-fert-plant'], 0.95, 1.04, 1.02, 1, 'Steel fertilizer buildings.', 'low', { models: ['fert-shed-1500', 'fert-shed-4000'] }),
  line('trinity', ['nh3-storage', 'propane-storage'], 1.0, 0.97, 1.0, 2, 'Pressure tanks for anhydrous and propane.', 'medium'),
  line('awt', ['nh3-storage', 'propane-storage'], 0.96, 1.0, 1.02, 1, 'Pressure tanks for anhydrous and propane.', 'low'),
  line('westmor', ['nh3-storage', 'propane-storage', 'fuel-truck'], 1.04, 0.95, 0.98, 2, 'Morris, Minnesota: skid tanks, propane bobtails and tankwagons.', 'medium', { models: ['nh3-18k', 'nh3-30k', 'nh3-90k', 'lp-18k', 'lp-30k', 'lp-90k', 'tankwagon-big'] }),
  line('snyder', ['liquid-fert-tanks'], 0.95, 1.05, 1.0, 1, 'Rotomolded poly tanks.', 'low', { models: ['liq-poly-100'] }),
  line('chief', ['liquid-fert-tanks'], 1.0, 1.0, 1.0, 2, 'Welded steel tanks.', 'low', { models: ['liq-steel-500', 'liq-steel-1500'] }),
  // Application
  line('terra-gator', ['applicator'], 1.08, 0.94, 0.97, 2, 'Ag-Chem (Jackson, Minnesota) flotation applicators, from the early 1970s.', 'high', { models: ['app-floater'] }),
  line('willmar', ['applicator'], 0.96, 1.03, 1.02, 1, 'Willmar, Minnesota spreaders and sprayers.', 'low', { models: ['app-floater', 'app-sprayer'] }),
  line('hagie', ['applicator'], 1.04, 0.95, 0.98, 2, 'Clarion, Iowa high-clearance self-propelled sprayers since 1947.', 'high', { models: ['app-sprayer', 'app-sprayer-120'] }),
  line('rogator', ['applicator'], 1.02, 0.98, 1.0, 2, 'Ag-Chem row-crop self-propelled sprayers.', 'medium', { models: ['app-sprayer', 'app-sprayer-120'] }),
  line('john-deere', ['applicator'], 1.05, 0.96, 0.96, 1, 'Self-propelled sprayers from the 4700 (1998 model year) on.', 'medium', { from: 1998, models: ['app-sprayer', 'app-sprayer-120'], capacity: 1.03 }),
  line('case-ih', ['applicator'], 1.03, 0.97, 0.98, 1, 'Patriot self-propelled sprayers.', 'low', { from: 2000, models: ['app-sprayer', 'app-sprayer-120'] }),
  line('new-leader', ['applicator'], 0.9, 1.05, 1.03, 1, 'Spreader bodies and pull-type rigs.', 'low', { models: ['app-pull', 'app-floater'] }),
  // Feed
  line('cpm', ['pellet-mill', 'feed-mill'], 1.04, 0.94, 0.97, 2, 'Pellet mills since 1931; added Roskamp (1987) and Champion hammermills (1989).', 'high'),
  line('sprout-waldron', ['pellet-mill', 'feed-mill'], 0.98, 1.0, 1.0, 2, 'Muncy, Pennsylvania pellet mills and hammermills.', 'low'),
  line('buhler', ['pellet-mill', 'feed-mill'], 1.12, 0.9, 0.95, 4, 'Swiss full-line milling maker.', 'medium', { from: 1990 }),
  // Trucks (chassis)
  line('international-trucks', TRUCKS, 1.0, 1.0, 1.0, 1, 'International Harvester trucks; Navistar from 1986.', 'high'),
  line('ford-trucks', TRUCKS, 0.95, 1.03, 1.02, 1, 'Ford heavy trucks to 1997.', 'high'),
  line('gmc-trucks', TRUCKS, 0.96, 1.03, 1.02, 1, 'GMC heavy trucks to 1988.', 'high'),
  line('sterling', TRUCKS, 0.97, 1.02, 1.0, 1, 'Ford\'s former heavy line under Freightliner, 1998–2009.', 'high'),
  line('mack', TRUCKS, 1.06, 0.92, 0.98, 2, 'Heavy trucks.', 'high'),
  line('freightliner', TRUCKS, 0.98, 1.0, 1.0, 1, 'Heavy trucks.', 'high'),
  line('kenworth', TRUCKS, 1.1, 0.9, 0.96, 3, 'Heavy trucks.', 'high'),
  line('peterbilt', TRUCKS, 1.1, 0.9, 0.96, 3, 'Heavy trucks.', 'high'),
  line('volvo-trucks', TRUCKS, 1.04, 0.94, 0.98, 2, 'Heavy trucks (WhiteGMC to 1995).', 'high'),
  // Fuel equipment
  line('gasboy', ['cardtrol'], 1.0, 0.97, 1.0, 1, 'Fleet dispensers and card-lock controllers.', 'low'),
  line('gilbarco', ['cardtrol', 'c-store'], 1.04, 0.95, 0.98, 1, 'Retail dispensers and point of sale.', 'high'),
  line('tokheim', ['cardtrol', 'c-store'], 0.95, 1.03, 1.02, 1, 'Fort Wayne, Indiana dispensers.', 'high'),
  line('wayne', ['cardtrol', 'c-store'], 1.0, 0.98, 1.0, 1, 'Fort Wayne, Indiana dispensers (Dresser Wayne).', 'medium'),
  // Buildings
  line('butler', BUILDINGS, 1.05, 0.93, 0.97, 2, 'Pre-engineered metal buildings since 1901.', 'medium'),
  line('morton-buildings', BUILDINGS, 1.03, 0.95, 0.98, 2, 'Employee-owned post-frame builder (Morton, Illinois).', 'medium', { models: ['flat-250', 'flat-500', 'chem-wh-basic', 'chem-wh-contain', 'seed-wh-bag', 'seed-bulk-treat', 'store-5k', 'store-10k', 'store-20k'] }),
  line('cleary', BUILDINGS, 0.97, 1.0, 1.0, 1, 'Wisconsin post-frame builder since 1978.', 'medium', { models: ['chem-wh-basic', 'chem-wh-contain', 'seed-wh-bag', 'seed-bulk-treat', 'store-5k', 'store-10k', 'store-20k'] }),
  line('varco-pruden', BUILDINGS, 0.98, 0.98, 1.0, 2, 'Pre-engineered metal buildings.', 'low'),
  line('behlen', ['chem-warehouse', 'seed-warehouse'], 0.96, 1.0, 1.0, 1, 'S-Span self-framing buildings.', 'low'),
];

/** Traits of a unit with no maker (land, piles, local tank fabricators). */
export const TYPICAL_MAKER: MakerLine = { brandId: '', components: [], price: 1, durability: 1, upkeep: 1, leadMonths: 0, note: '', confidence: 'low' };

/** Rebuilds, demolition and permits (D-129). */
export const PROJECTS = {
  /** Rebuilding a worn unit costs this share of a new one and restores condition, up to a cap. */
  rebuildCostShare: s(0.4, 'low', 'Re-sheeting, new bearings, motors and controls: well under the cost of new'),
  rebuildConditionGain: s(55, 'low'),
  rebuildConditionCap: s(92, 'low'),
  /** A rebuild is depreciated over this share of the unit's life. */
  rebuildLifeShare: s(0.5, 'low'),
  rebuildMonths: 2,
  maxRebuilds: 2,
  /** Tearing a unit down costs this share of a new one (before salvage). */
  demolitionCostShare: s(0.05, 'low'),
  /** Zoning and site-plan review for a new site, months. */
  newSitePermitMonths: 2,
};

/** Equipment past its design life wears faster and costs more to keep running (D-129). */
export const AGING = {
  overLifeWear: s(1.5, 'low'),
  overLifeRepair: s(1.3, 'low'),
};

export const CONSULTING: ConsultingParams = {
  rosterSize: 6,
  designFee: s([18_000, 60_000], 'low', 'Feasibility and preliminary design study; larger for bigger sites'),
  pmFeePct: s([0.025, 0.06], 'low', 'Owner\'s representative / construction management, share of construction'),
  skillMean: 0.55,
  skillSd: 0.22,
  reputationNoise: 0.25,
  overrunNoPm: s([0.1, 0.12], 'low', 'Owner-managed rural construction: typical overruns 5–20%'),
  slipNoPm: s([1.5, 1.5], 'low'),
  pmEffect: 0.8,
  designErrorSd: [0.45, 0.06],
  goldPlating: 0.35,
  firmYears: [12, 45],
  siteServes: s({ agronomy: 25_000, energy: 30_000, feedmill: 8_000, station: 2_500, farmstore: 6_000 }, 'low', 'Rough scale of a typical site of the kind in the catalog'),
  grainShareNew: 0.3,
  turns: 2.2,
};

export type { Confidence };
export { s };
