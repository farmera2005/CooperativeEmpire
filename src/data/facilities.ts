// Facility components. A facility (e.g. a country elevator) is a site in a town made of
// components (storage, receiving leg, dryer, rail loadout...). Cost anchors are order-of-
// magnitude 2024 dollars, scaled by the construction-cost index for the year. All anchors
// are low confidence until reviewed (docs/DATA_REVIEW.md).

import { s, type Sourced } from './types';

export type FacilityDivision = 'GRAIN' | 'AGRONOMY' | 'FEED' | 'ENERGY' | 'RETAIL' | 'CORP';

export type ComponentId =
  | 'site'
  | 'storage-wood' | 'storage-concrete' | 'storage-steel' | 'storage-flat' | 'ground-pile'
  | 'receiving' | 'dryer' | 'truck-scale'
  | 'loadout-single' | 'loadout-unit25' | 'loadout-unit50' | 'loadout-unit75' | 'loadout-shuttle';

export type LoadoutType = 'truck' | 'single' | 'unit25' | 'unit50' | 'unit75' | 'shuttle';

export interface ComponentDef {
  id: ComponentId;
  label: string;
  division: FacilityDivision;
  /** Capacity unit the cost is quoted in. */
  unit: 'bu' | 'buPerHr' | 'each' | 'acres';
  /** 2024 $ per unit, low/high. */
  cost2024: Sourced<[number, number]>;
  /** Fixed-asset account: 1500 land, 1510 buildings/structures, 1520 machinery/equipment. */
  account: '1500' | '1510' | '1520';
  lifeYears: number;
  /** Months to build after permits. */
  buildMonths: number;
  permitMonths: number;
  availableFrom: number;
  /** Last year it can be newly built (it can still be acquired). */
  buildableTo?: number;
  /** Condition points lost per year in normal use. */
  decayPerYear: number;
  /** Annual repairs as share of replacement cost at condition 100. */
  repairRate: number;
  loadout?: LoadoutType;
  requires?: 'rail' | 'mainline';
}

const c = (x: ComponentDef): ComponentDef => x;

export const COMPONENTS: Record<ComponentId, ComponentDef> = {
  site: c({ id: 'site', label: 'Site & land', division: 'GRAIN', unit: 'acres', cost2024: s([20_000, 35_000], 'low', 'Commercial ground at a town site, incl. drives and utilities'), account: '1500', lifeYears: 0, buildMonths: 0, permitMonths: 0, availableFrom: 1900, decayPerYear: 0, repairRate: 0 }),
  'storage-wood': c({ id: 'storage-wood', label: 'Wood crib storage', division: 'GRAIN', unit: 'bu', cost2024: s([3, 5], 'low', 'Replacement value of a wood crib house; acquirable only'), account: '1510', lifeYears: 40, buildMonths: 8, permitMonths: 2, availableFrom: 1900, buildableTo: 1960, decayPerYear: 1.6, repairRate: 0.02 }),
  'storage-concrete': c({ id: 'storage-concrete', label: 'Concrete silos', division: 'GRAIN', unit: 'bu', cost2024: s([6, 10], 'low', 'Prompt anchor ~$6–10/bu'), account: '1510', lifeYears: 40, buildMonths: 10, permitMonths: 3, availableFrom: 1920, decayPerYear: 0.8, repairRate: 0.006 }),
  'storage-steel': c({ id: 'storage-steel', label: 'Steel bins', division: 'GRAIN', unit: 'bu', cost2024: s([2.5, 4], 'low', 'Prompt anchor ~$2.50–4/bu installed'), account: '1510', lifeYears: 25, buildMonths: 4, permitMonths: 1, availableFrom: 1950, decayPerYear: 1.2, repairRate: 0.01 }),
  'storage-flat': c({ id: 'storage-flat', label: 'Flat storage building', division: 'GRAIN', unit: 'bu', cost2024: s([1.5, 2.5], 'low'), account: '1510', lifeYears: 25, buildMonths: 5, permitMonths: 2, availableFrom: 1950, decayPerYear: 1.2, repairRate: 0.012 }),
  'ground-pile': c({ id: 'ground-pile', label: 'Ground pile / bunker', division: 'GRAIN', unit: 'bu', cost2024: s([0.3, 0.6], 'low', 'Pad, walls, tarps, aeration; higher shrink and quality risk'), account: '1520', lifeYears: 10, buildMonths: 1, permitMonths: 0, availableFrom: 1970, decayPerYear: 5, repairRate: 0.05 }),
  receiving: c({ id: 'receiving', label: 'Receiving pit & leg', division: 'GRAIN', unit: 'buPerHr', cost2024: s([90, 150], 'low', 'Pit, leg, distributor, conveyors per bu/hr of capacity'), account: '1520', lifeYears: 25, buildMonths: 4, permitMonths: 1, availableFrom: 1900, decayPerYear: 2, repairRate: 0.02 }),
  dryer: c({ id: 'dryer', label: 'Grain dryer', division: 'GRAIN', unit: 'buPerHr', cost2024: s([350, 600], 'low', 'Tower dryer installed, per bu/hr of rated capacity'), account: '1520', lifeYears: 15, buildMonths: 3, permitMonths: 1, availableFrom: 1950, decayPerYear: 3, repairRate: 0.025 }),
  'truck-scale': c({ id: 'truck-scale', label: 'Truck scale & probe', division: 'GRAIN', unit: 'each', cost2024: s([120_000, 200_000], 'low'), account: '1520', lifeYears: 20, buildMonths: 2, permitMonths: 0, availableFrom: 1900, decayPerYear: 2, repairRate: 0.02 }),
  'loadout-single': c({ id: 'loadout-single', label: 'Rail spur & single-car loadout', division: 'GRAIN', unit: 'each', cost2024: s([400_000, 700_000], 'low'), account: '1520', lifeYears: 30, buildMonths: 4, permitMonths: 2, availableFrom: 1900, decayPerYear: 1, repairRate: 0.015, loadout: 'single', requires: 'rail' }),
  'loadout-unit25': c({ id: 'loadout-unit25', label: '25-car unit train loadout', division: 'GRAIN', unit: 'each', cost2024: s([2_000_000, 3_000_000], 'low'), account: '1520', lifeYears: 30, buildMonths: 6, permitMonths: 3, availableFrom: 1965, decayPerYear: 1, repairRate: 0.015, loadout: 'unit25', requires: 'rail' }),
  'loadout-unit50': c({ id: 'loadout-unit50', label: '50-car unit train loadout', division: 'GRAIN', unit: 'each', cost2024: s([3_000_000, 4_500_000], 'low'), account: '1520', lifeYears: 30, buildMonths: 8, permitMonths: 3, availableFrom: 1970, decayPerYear: 1, repairRate: 0.015, loadout: 'unit50', requires: 'rail' }),
  'loadout-unit75': c({ id: 'loadout-unit75', label: '75-car unit train loadout', division: 'GRAIN', unit: 'each', cost2024: s([4_000_000, 6_000_000], 'low'), account: '1520', lifeYears: 30, buildMonths: 9, permitMonths: 4, availableFrom: 1980, decayPerYear: 1, repairRate: 0.015, loadout: 'unit75', requires: 'mainline' }),
  'loadout-shuttle': c({ id: 'loadout-shuttle', label: '110-car shuttle loader & loop track', division: 'GRAIN', unit: 'each', cost2024: s([10_000_000, 16_000_000], 'low', 'Loop/7,000+ ft track and high-speed loadout added to an existing site; a greenfield shuttle facility with storage and receiving is $25–40M'), account: '1520', lifeYears: 30, buildMonths: 12, permitMonths: 6, availableFrom: 1990, decayPerYear: 0.8, repairRate: 0.012, loadout: 'shuttle', requires: 'mainline' }),
};

export const STORAGE_COMPONENTS: ComponentId[] = ['storage-wood', 'storage-concrete', 'storage-steel', 'storage-flat'];
export const LOADOUT_COMPONENTS: ComponentId[] = ['loadout-single', 'loadout-unit25', 'loadout-unit50', 'loadout-unit75', 'loadout-shuttle'];
export const LOADOUT_RANK: Record<LoadoutType, number> = { truck: 0, single: 1, unit25: 2, unit50: 3, unit75: 4, shuttle: 5 };

export const midCost = (id: ComponentId): number => {
  const [lo, hi] = COMPONENTS[id].cost2024.value;
  return (lo + hi) / 2;
};
