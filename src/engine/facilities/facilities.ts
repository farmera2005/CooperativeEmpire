// Facilities: capacities, replacement cost, fixed-asset register, capital projects,
// depreciation, condition, and monthly operating costs (DESIGN §8).

import { techFactor } from '../world/tech';
import { COMPONENTS, KIND_BASE_FTE, KIND_DIVISION, LOADOUT_COMPONENTS, LOADOUT_RANK, STORAGE_COMPONENTS, midCost, type ComponentId, type FacilityKind, type LoadoutType } from '../../data/facilities';
import { CROSS_DIVISION, SEASONAL_OVERTIME, SITE_UTILITIES, SUPPLY_WAGES, type SupplyDivision } from '../../data/supply';
import { COMMODITIES, FACILITY_COSTS, MAINTENANCE, STAFF } from '../../data/grain';
import { DIVISION_ROLE, effect, holder } from '../people/leaders';
import { vacancyShare, wageMarket } from '../people/staff';
import { monthOf, yearOf } from '../core/calendar';
import { valueAt } from '../../data/types';
import { roundCents, type Cents } from '../core/money';
import { AGING } from '../../data/equipment';
import { capitalizeUnits } from './projects';
import { decompose, makerOf, syncFacility, unitsReplacementCost, unitValue2024 } from './units';
import { post } from '../ledger/ledger';
import type { TickContext } from '../sim/context';
import type { DivisionId, Facility, FixedAsset, GameState, InstalledUnit, JournalLine, MaintenanceLevel } from '../types';
import { constructionLevel, nominalCents } from '../world/macro';
import type { MarketPath } from '../world/marketPath';

export type Components = Partial<Record<ComponentId, number>>;

export interface GrainCapacity {
  storageBu: number;
  pileBu: number;
  receiveBuHr: number;
  dryBuHr: number;
  loadout: LoadoutType;
  scales: number;
}

export function grainCapacity(c: Components): GrainCapacity {
  let storageBu = 0;
  for (const id of STORAGE_COMPONENTS) storageBu += c[id] ?? 0;
  let loadout: LoadoutType = 'truck';
  for (const id of LOADOUT_COMPONENTS) if ((c[id] ?? 0) > 0 && LOADOUT_RANK[COMPONENTS[id].loadout!] > LOADOUT_RANK[loadout]) loadout = COMPONENTS[id].loadout!;
  return { storageBu, pileBu: c['ground-pile'] ?? 0, receiveBuHr: c.receiving ?? 0, dryBuHr: c.dryer ?? 0, loadout, scales: c['truck-scale'] ?? 0 };
}

export const totalCapacityBu = (f: Facility): number => {
  const cap = grainCapacity(f.components);
  return cap.storageBu + cap.pileBu;
};
export const facilityBu = (f: Facility): number => COMMODITIES.reduce((s, c) => s + f.grain.bu[c], 0);

/** Replacement cost in 2024 dollars (midpoint anchors) of equipment as built in `year`. */
export function replacementCost2024(c: Components, year?: number): number {
  let t = 0;
  for (const id of Object.keys(c) as ComponentId[]) t += midCost(id, year) * (c[id] ?? 0);
  return t;
}

/** Replacement cost in nominal cents for month mi. */
export function replacementCost(path: MarketPath, mi: number, c: Components): Cents {
  return roundCents(replacementCost2024(c, yearOf(mi)) * constructionLevel(path, mi) * 100);
}

export function emptyGrainState(): Facility['grain'] {
  return { bu: { corn: 0, soybeans: 0, wheat: 0 }, waitMemory: 0, seasonMaxWait: 0, seasonTurnedAway: 0, seasonWaitBu: 0, seasonOfferedBu: 0, downWeeks: 0 };
}

/**
 * A new site. Component totals (a site bought, merged or offered) are split into units built
 * over the site's life (D-129); `unitsKey` makes the split repeatable, so what was shown for
 * an offer is what arrives.
 */
export function newFacility(state: GameState, townId: number, name: string, components: Components, status: Facility['status'], builtYear: number, condition: number, kind: FacilityKind = 'elevator', unitsKey?: string, presetUnits?: InstalledUnit[]): Facility {
  const id = state.coop.nextId++;
  // A competitor's site arrives with its own units, as worn as they are (D-131).
  const units = presetUnits
    ? presetUnits.map((u) => { const { assetId: _a, ...rest } = u; void _a; return { ...rest, id: state.coop.nextId++ }; })
    : decompose(components, {
      builtYear, nowYear: yearOf(state.clock.monthIndex), condition, key: `${state.setup.gameSeed}|${unitsKey ?? `facility|${id}`}`, nextId: () => state.coop.nextId++,
    });
  const f: Facility = {
    id, name, townId, division: KIND_DIVISION[kind], kind, ownership: 'owned', status,
    builtYear, acquiredMonth: state.clock.monthIndex, condition, components: {}, units,
    staffing: { level: 'standard', pay: 'at' }, grain: emptyGrainState(),
  };
  syncFacility(f);
  state.coop.facilities.push(f);
  return f;
}

/**
 * Replace a site's equipment with units for the given totals, built this year (no asset
 * entries). For tests and debug tools that set a site up directly.
 */
export function setSiteEquipment(state: GameState, f: Facility, components: Components, condition = 100): void {
  const year = yearOf(state.clock.monthIndex);
  f.units = decompose(components, { builtYear: year, nowYear: year, condition, key: `${state.setup.gameSeed}|set|${f.id}|${state.coop.nextId}`, nextId: () => state.coop.nextId++ });
  syncFacility(f);
}

/** Set every unit at a site to a condition (tests and debug tools). */
export function setSiteCondition(f: Facility, condition: number): void {
  for (const u of f.units) if (u.component !== 'site') u.condition = condition;
  syncFacility(f);
}

/**
 * Put a site's units that are not yet on the books onto the asset register, splitting the
 * total by replacement value (D-129). Returns journal debits for the caller to balance.
 */
export function capitalize(state: GameState, facilityId: number, _components: Components, total: Cents, _label: string, remainingLifeShare = 1): JournalLine[] {
  const f = state.coop.facilities.find((x) => x.id === facilityId);
  if (!f) return [];
  return capitalizeUnits(state, f, f.units.filter((u) => u.assetId === undefined), total, remainingLifeShare);
}

/** Monthly straight-line depreciation for all assets. */
export function stepDepreciation(ctx: TickContext): void {
  const { state } = ctx;
  // Totals by site so location analysis sees each site's depreciation (D-121).
  const bySite = new Map<number, number>();
  const divOf = new Map(state.coop.facilities.map((f) => [f.id, f.division]));
  for (const a of state.coop.assets) {
    if (a.lifeMonths <= 0 || a.accumDep >= a.cost) continue;
    const dep = Math.min(a.cost - a.accumDep, Math.max(1, Math.round(a.cost / a.lifeMonths)));
    a.accumDep += dep;
    bySite.set(a.facilityId, (bySite.get(a.facilityId) ?? 0) + dep);
  }
  const lines: JournalLine[] = [];
  for (const [fid, v] of [...bySite.entries()].sort((a, b) => a[0] - b[0])) {
    const d: DivisionId = divOf.get(fid) ?? (fid < 0 ? 'CORP' : 'GRAIN');
    const tag = divOf.has(fid) ? { facilityId: fid } : {};
    lines.push({ account: '7100', division: d, amount: v, ...tag }, { account: '1590', division: d, amount: -v, ...tag });
  }
  if (lines.length) post(state, { source: 'depreciation', memo: 'Monthly depreciation', lines });
}

export const netBookValue = (state: GameState, facilityId: number): Cents =>
  state.coop.assets.filter((a) => a.facilityId === facilityId).reduce((s, a) => s + a.cost - a.accumDep, 0);

export { stepProjects } from './projects';

/** FTE at standard staffing (2024 productivity) for any site. Elevators use their own formula. */
export function facilityFte(f: Facility): number {
  if (f.kind === 'elevator') return elevatorFte(f);
  let fte = KIND_BASE_FTE[f.kind];
  for (const id of Object.keys(f.components) as ComponentId[]) fte += (COMPONENTS[id].ftePerUnit ?? 0) * (f.components[id] ?? 0);
  return fte;
}

/** How busy a farm-supply division's equipment was this month (0..1): its busiest capacity line. */
function divisionUtilization(state: GameState, division: DivisionId): number {
  const report = division === 'GRAIN' || division === 'CORP' ? null : state.coop.supply[division as SupplyDivision]?.report;
  if (!report || report.monthIndex !== state.clock.monthIndex) return 0;
  return report.capacity.reduce((a, c) => Math.max(a, c.available > 0 ? Math.min(1, c.used / c.available) : 0), 0);
}

/** FTE paid this month: the year-round crew plus the seasonal crew in proportion to the work (D-103). */
function paidFte(state: GameState, f: Facility): number {
  if (f.kind === 'elevator') return elevatorFte(f);
  const util = divisionUtilization(state, f.division);
  let fte = KIND_BASE_FTE[f.kind];
  for (const id of Object.keys(f.components) as ComponentId[]) {
    const crew = (COMPONENTS[id].ftePerUnit ?? 0) * (f.components[id] ?? 0);
    const v = COMPONENTS[id].variableFteShare ?? 0;
    fte += crew * (1 - v + v * util);
  }
  return fte;
}

export const maintenanceOf = (f: Facility): MaintenanceLevel => f.maintenance ?? 'routine';

/** Chance multiplier for a breakdown: worn equipment fails more, and upkeep changes the odds. */
export const breakdownRisk = (f: Facility): number => (1 + (100 - f.condition) / 25) * MAINTENANCE.breakdownFactor.value[maintenanceOf(f)];

/** Post the emergency repair bill for a breakdown at a site. */
export function postBreakdownRepair(ctx: TickContext, f: Facility): Cents {
  const cost = roundCents(replacementCost(ctx.path, ctx.mi, f.components) * MAINTENANCE.emergencyRepairShare.value);
  if (cost > 0) post(ctx.state, { source: 'breakdown', memo: `Emergency repair at ${f.name}`, lines: [{ account: '7200', division: f.division, amount: cost, facilityId: f.id }, { account: '1000', division: f.division, amount: -cost }] });
  return cost;
}

/** True if another of our operating sites in the same town (lower id) already carries the shared base costs. */
function sharesSite(state: GameState, f: Facility): boolean {
  return state.coop.facilities.some((o) => o.id < f.id && o.townId === f.townId && o.status === 'operating');
}

/** FTE at standard staffing for an elevator. */
export function elevatorFte(f: Facility): number {
  const cap = grainCapacity(f.components);
  return STAFF.fteBase.value + (STAFF.ftePerMillionBu.value * (cap.storageBu + cap.pileBu)) / 1e6 + (STAFF.ftePerTenThousandBuHr.value * cap.receiveBuHr) / 1e4;
}

const HARVEST_MONTHS = [6, 7, 9, 10, 11];

/** Monthly fixed operating costs and condition decay for every facility. */
export function stepFacilityCosts(ctx: TickContext): void {
  const { state, path, mi } = ctx;
  const lines: JournalLine[] = [];
  let cash = 0;
  let division: DivisionId = 'GRAIN';
  let facilityId = 0;
  const add = (account: string, amount: Cents) => {
    if (amount <= 0) return;
    lines.push({ account, division, amount, facilityId });
    cash += amount;
  };
  const coo = 1 + effect(state, 'coo.opex');
  const decayFactor = 1 + effect(state, 'coo.decay');
  const opexFactor = (d: DivisionId) => {
    const r = DIVISION_ROLE[d];
    return coo * (1 + effect(state, 'division.opex', d)) * (r && holder(state, r)?.traits.includes('tightWithADollar') ? 0.97 : 1);
  };
  for (const f of state.coop.facilities) {
    if (f.status === 'closed' || f.status === 'underConstruction') continue;
    division = f.division;
    facilityId = f.id;
    const repl = unitsReplacementCost(path, mi, f.units.filter((u) => u.component !== 'site'));
    const mothballed = f.status === 'mothballed';
    const shared = sharesSite(state, f);
    if (!mothballed) {
      let fte = paidFte(state, f);
      if (shared) fte -= (f.kind === 'elevator' ? STAFF.fteBase.value : KIND_BASE_FTE[f.kind]) * CROSS_DIVISION.sharedSiteSaving.value;
      fte *= STAFF.levelFactor.value[f.staffing.level] * valueAt(STAFF.laborIntensity, yearOf(mi));
      const wage = f.division === 'GRAIN' ? STAFF.annualWage.value : SUPPLY_WAGES.value[f.division as SupplyDivision];
      // Labor market, unfilled positions, the COO's efficiency and a tight-fisted manager.
      let wages = nominalCents(path, mi, (fte * wage * STAFF.payFactor.value[f.staffing.pay] * wageMarket(state) * (1 - vacancyShare(state, f)) * opexFactor(f.division)) / 12);
      if (f.division === 'GRAIN') {
        if (HARVEST_MONTHS.includes(monthOf(mi))) wages += roundCents(wages * STAFF.harvestOvertime.value);
      } else {
        const ot = SEASONAL_OVERTIME.value[f.division as SupplyDivision];
        if (ot.months.includes(monthOf(mi))) wages += roundCents(wages * ot.share);
        const util = SITE_UTILITIES.value[f.kind] ?? 0;
        add('7400', nominalCents(path, mi, (util * (shared ? 1 - CROSS_DIVISION.sharedSiteSaving.value : 1)) / 12));
      }
      if (f.kind === 'elevator') wages = roundCents(wages * techFactor(state, 'grainLabor'));
      add('7000', wages);
      add('7010', roundCents(wages * STAFF.benefitsRate.value));
    }
    // Repairs, unit by unit (D-129): they rise as a unit wears, past its design life, and with
    // its maker's upkeep.
    const year = yearOf(mi);
    let repairBase = 0;
    let weight = 0;
    for (const u of f.units) {
      if (u.component === 'site') continue;
      const def = COMPONENTS[u.component];
      const w = unitValue2024(u, year);
      const old = def.lifeYears > 0 && year - u.builtYear > def.lifeYears ? AGING.overLifeRepair.value : 1;
      repairBase += w * def.repairRate * makerOf(u.brandId, u.component).upkeep * (1 + (100 - u.condition) / 100) * old;
      weight += w;
    }
    const toNominal = weight > 0 ? repl / weight : 0;
    const repairs = roundCents(((repairBase * toNominal) / 12) * (mothballed ? FACILITY_COSTS.mothballRepairShare.value : MAINTENANCE.repairFactor.value[maintenanceOf(f)]) * opexFactor(f.division));
    add('7200', repairs);
    add('7300', roundCents(((repl * FACILITY_COSTS.insuranceRate.value) / 12) * (1 + effect(state, 'safety.insurance'))));
    add('7640', roundCents((netBookValue(state, f.id) * FACILITY_COSTS.propertyTaxRate.value) / 12));
    // Wear, unit by unit: faster past design life, slower for durable makers.
    const wearFactor = ((mothballed ? FACILITY_COSTS.mothballDecayShare.value : MAINTENANCE.decayFactor.value[maintenanceOf(f)]) * decayFactor) / 12;
    for (const u of f.units) {
      if (u.component === 'site') continue;
      const def = COMPONENTS[u.component];
      const over = def.lifeYears > 0 && year - u.builtYear > def.lifeYears ? AGING.overLifeWear.value : 1;
      u.condition = Math.max(0, u.condition - def.decayPerYear * makerOf(u.brandId, u.component).durability * over * wearFactor);
    }
    syncFacility(f);
    // Hidden environmental problems surface eventually.
    if (f.envLiability && !f.envLiability.discovered && ctx.rng('facilities.env', f.id).chance(FACILITY_COSTS.envDiscoveryMonthly.value)) {
      f.envLiability.discovered = true;
      post(state, {
        source: 'env-cleanup', memo: `Environmental cleanup at ${f.name}`,
        lines: [{ account: '7660', division: f.division, amount: f.envLiability.cost, facilityId: f.id }, { account: '1000', division: f.division, amount: -f.envLiability.cost }],
      });
      ctx.inbox({ kind: 'alert', title: `Contamination found at ${f.name}`, body: `Soil testing during routine work at ${f.name} found old fuel and pesticide contamination from the previous owner. Cleanup will cost about $${Math.round(f.envLiability.cost / 100).toLocaleString('en-US')}. Better due diligence might have caught it before the purchase.` });
    }
  }
  if (lines.length) post(state, { source: 'facility-costs', memo: 'Facility payroll, repairs, insurance, property tax', lines: [...lines, { account: '1000', division: 'CORP', amount: -cash }] });
}

export const yearBuiltLabel = (f: Facility): string => `${f.builtYear}`;
export const isHarvestMonth = (mi: number): boolean => HARVEST_MONTHS.includes(monthOf(mi));
export const ageYears = (f: Facility, mi: number): number => yearOf(mi) - f.builtYear;
