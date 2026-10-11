// Facility catalog. Cost anchors are order-of-magnitude 2024 dollars, scaled by the
// construction-cost index for the year. All anchors are low confidence until reviewed.
// Detailed capacity mechanics arrive with each division's milestone.

import { s, type Sourced } from './types';

export type FacilityDivision = 'GRAIN' | 'AGRONOMY' | 'FEED' | 'ENERGY' | 'RETAIL' | 'CORP';

export interface FacilityTypeDef {
  id: string;
  label: string;
  division: FacilityDivision;
  availableFrom: number;
  availableTo?: number;
  /** Unit in which the cost anchor is quoted. */
  capacityUnit: 'bu' | 'buPerHr' | 'tons' | 'tonsPerYr' | 'gal' | 'unit' | 'sqft' | 'cars';
  /** Cost per capacity unit (2024 $), low/high. */
  costPerUnit2024: Sourced<[number, number]>;
  /** Typical capacity for a new build. */
  typicalCapacity: number;
  buildMonths: number;
  permitMonths: number;
  depreciationYears: number;
  /** Condition points lost per year under normal use. */
  conditionDecayPerYear: number;
  /** Annual repair cost as share of replacement cost at condition 100 (rises as condition falls). */
  repairRate: Sourced<number>;
  /** Standard staffing (FTE) at typical capacity. */
  staffFte: number;
}

export const FACILITY_TYPES: FacilityTypeDef[] = [
  { id: 'office', label: 'Main office', division: 'CORP', availableFrom: 1900, capacityUnit: 'sqft', costPerUnit2024: s([180, 260], 'low'), typicalCapacity: 3000, buildMonths: 6, permitMonths: 2, depreciationYears: 39, conditionDecayPerYear: 1, repairRate: s(0.015, 'low'), staffFte: 0 },
  { id: 'elevator-wood', label: 'Country elevator (wood crib)', division: 'GRAIN', availableFrom: 1900, availableTo: 1960, capacityUnit: 'bu', costPerUnit2024: s([3, 5], 'low', 'Replacement cost for a wood crib house; only acquirable, not built, after 1960'), typicalCapacity: 150_000, buildMonths: 8, permitMonths: 2, depreciationYears: 40, conditionDecayPerYear: 1.6, repairRate: s(0.03, 'low'), staffFte: 2 },
  { id: 'elevator-concrete', label: 'Concrete elevator', division: 'GRAIN', availableFrom: 1920, capacityUnit: 'bu', costPerUnit2024: s([6, 10], 'low', 'Prompt anchor: concrete silos ~$6–10/bu'), typicalCapacity: 500_000, buildMonths: 12, permitMonths: 4, depreciationYears: 40, conditionDecayPerYear: 0.8, repairRate: s(0.015, 'low'), staffFte: 3 },
  { id: 'steel-bins', label: 'Steel bins', division: 'GRAIN', availableFrom: 1950, capacityUnit: 'bu', costPerUnit2024: s([2.5, 4], 'low', 'Prompt anchor: added steel bins ~$2.50–4/bu installed'), typicalCapacity: 250_000, buildMonths: 4, permitMonths: 1, depreciationYears: 25, conditionDecayPerYear: 1.2, repairRate: s(0.02, 'low'), staffFte: 0.5 },
  { id: 'flat-storage', label: 'Flat storage building', division: 'GRAIN', availableFrom: 1950, capacityUnit: 'bu', costPerUnit2024: s([1.5, 2.5], 'low'), typicalCapacity: 500_000, buildMonths: 5, permitMonths: 2, depreciationYears: 25, conditionDecayPerYear: 1.2, repairRate: s(0.02, 'low'), staffFte: 0.5 },
  { id: 'ground-pile', label: 'Temporary ground pile / bunker', division: 'GRAIN', availableFrom: 1970, capacityUnit: 'bu', costPerUnit2024: s([0.3, 0.6], 'low'), typicalCapacity: 1_000_000, buildMonths: 1, permitMonths: 0, depreciationYears: 10, conditionDecayPerYear: 5, repairRate: s(0.05, 'low'), staffFte: 0.5 },
  { id: 'dryer', label: 'Grain dryer', division: 'GRAIN', availableFrom: 1950, capacityUnit: 'buPerHr', costPerUnit2024: s([700, 1200], 'low'), typicalCapacity: 1500, buildMonths: 3, permitMonths: 1, depreciationYears: 15, conditionDecayPerYear: 3, repairRate: s(0.04, 'low'), staffFte: 0.5 },
  { id: 'shuttle-loader', label: 'Shuttle loader (110-car)', division: 'GRAIN', availableFrom: 1990, capacityUnit: 'unit', costPerUnit2024: s([25_000_000, 40_000_000], 'low', 'Prompt anchor: greenfield shuttle $25–40M'), typicalCapacity: 1, buildMonths: 18, permitMonths: 6, depreciationYears: 30, conditionDecayPerYear: 0.8, repairRate: s(0.012, 'low'), staffFte: 10 },
  { id: 'dry-fert-plant', label: 'Dry fertilizer plant', division: 'AGRONOMY', availableFrom: 1950, capacityUnit: 'tons', costPerUnit2024: s([250, 450], 'low'), typicalCapacity: 8000, buildMonths: 8, permitMonths: 4, depreciationYears: 30, conditionDecayPerYear: 1.5, repairRate: s(0.025, 'low'), staffFte: 3 },
  { id: 'nh3-storage', label: 'Anhydrous ammonia storage', division: 'AGRONOMY', availableFrom: 1955, capacityUnit: 'tons', costPerUnit2024: s([600, 1000], 'low'), typicalCapacity: 600, buildMonths: 5, permitMonths: 4, depreciationYears: 25, conditionDecayPerYear: 1.5, repairRate: s(0.03, 'low'), staffFte: 1 },
  { id: 'feed-mill', label: 'Feed mill', division: 'FEED', availableFrom: 1920, capacityUnit: 'tonsPerYr', costPerUnit2024: s([60, 110], 'low'), typicalCapacity: 40_000, buildMonths: 14, permitMonths: 4, depreciationYears: 30, conditionDecayPerYear: 1.2, repairRate: s(0.025, 'low'), staffFte: 8 },
  { id: 'bulk-fuel-plant', label: 'Bulk fuel plant', division: 'ENERGY', availableFrom: 1920, capacityUnit: 'gal', costPerUnit2024: s([3, 6], 'low'), typicalCapacity: 120_000, buildMonths: 6, permitMonths: 4, depreciationYears: 25, conditionDecayPerYear: 1.5, repairRate: s(0.025, 'low'), staffFte: 2 },
  { id: 'propane-storage', label: 'Propane bulk storage (30,000 gal tanks)', division: 'ENERGY', availableFrom: 1940, capacityUnit: 'gal', costPerUnit2024: s([3, 5], 'low'), typicalCapacity: 90_000, buildMonths: 4, permitMonths: 3, depreciationYears: 30, conditionDecayPerYear: 1, repairRate: s(0.015, 'low'), staffFte: 1 },
  { id: 'c-store', label: 'Fuel station with convenience store', division: 'RETAIL', availableFrom: 1960, capacityUnit: 'sqft', costPerUnit2024: s([350, 600], 'low'), typicalCapacity: 3000, buildMonths: 8, permitMonths: 4, depreciationYears: 30, conditionDecayPerYear: 1.5, repairRate: s(0.02, 'low'), staffFte: 6 },
  { id: 'farm-store', label: 'Farm & home store', division: 'RETAIL', availableFrom: 1900, capacityUnit: 'sqft', costPerUnit2024: s([150, 250], 'low'), typicalCapacity: 10_000, buildMonths: 8, permitMonths: 3, depreciationYears: 39, conditionDecayPerYear: 1, repairRate: s(0.015, 'low'), staffFte: 5 },
];

export function facilityType(id: string): FacilityTypeDef {
  const f = FACILITY_TYPES.find((t) => t.id === id);
  if (!f) throw new Error(`Unknown facility type ${id}`);
  return f;
}
