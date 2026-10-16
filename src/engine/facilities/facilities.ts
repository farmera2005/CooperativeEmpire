// Facilities: capacities, replacement cost, fixed-asset register, capital projects,
// depreciation, condition, and monthly operating costs (DESIGN §8).

import { techFactor } from '../world/tech';
import { COMPONENTS, KIND_BASE_FTE, KIND_DIVISION, LOADOUT_COMPONENTS, LOADOUT_RANK, STORAGE_COMPONENTS, midCost, type ComponentId, type FacilityKind, type LoadoutType } from '../../data/facilities';
import { CROSS_DIVISION, SEASONAL_OVERTIME, SITE_UTILITIES, SUPPLY_WAGES, type SupplyDivision } from '../../data/supply';
import { COMMODITIES, FACILITY_COSTS, STAFF } from '../../data/grain';
import { DIVISION_ROLE, effect, holder } from '../people/leaders';
import { vacancyShare, wageMarket } from '../people/staff';
import { monthOf, yearOf } from '../core/calendar';
import { valueAt } from '../../data/types';
import { allocateCents, roundCents, type Cents } from '../core/money';
import { post } from '../ledger/ledger';
import type { TickContext } from '../sim/context';
import type { CapitalProject, DivisionId, Facility, FixedAsset, GameState, JournalLine } from '../types';
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

/** Replacement cost in 2024 dollars (midpoint anchors). */
export function replacementCost2024(c: Components): number {
  let t = 0;
  for (const id of Object.keys(c) as ComponentId[]) t += midCost(id) * (c[id] ?? 0);
  return t;
}

/** Replacement cost in nominal cents for month mi. */
export function replacementCost(path: MarketPath, mi: number, c: Components): Cents {
  return roundCents(replacementCost2024(c) * constructionLevel(path, mi) * 100);
}

export function emptyGrainState(): Facility['grain'] {
  return { bu: { corn: 0, soybeans: 0, wheat: 0 }, waitMemory: 0, seasonMaxWait: 0, seasonTurnedAway: 0, seasonWaitBu: 0, seasonOfferedBu: 0, downWeeks: 0 };
}

export function newFacility(state: GameState, townId: number, name: string, components: Components, status: Facility['status'], builtYear: number, condition: number, kind: FacilityKind = 'elevator'): Facility {
  const f: Facility = {
    id: state.coop.nextId++, name, townId, division: KIND_DIVISION[kind], kind, ownership: 'owned', status,
    builtYear, acquiredMonth: state.clock.monthIndex, condition, components: { ...components },
    staffing: { level: 'standard', pay: 'at' }, grain: emptyGrainState(),
  };
  state.coop.facilities.push(f);
  return f;
}

/**
 * Capitalize components into the asset register and post the cost. The asset cost is split
 * across components in proportion to their replacement cost. Returns journal lines (debits)
 * for the caller to balance against cash or construction in progress.
 */
export function capitalize(state: GameState, facilityId: number, components: Components, total: Cents, label: string, remainingLifeShare = 1): JournalLine[] {
  const division = state.coop.facilities.find((f) => f.id === facilityId)?.division ?? 'GRAIN';
  const ids = (Object.keys(components) as ComponentId[]).filter((id) => (components[id] ?? 0) > 0).sort();
  const weights = ids.map((id) => midCost(id) * (components[id] ?? 0));
  const parts = allocateCents(total, weights);
  const lines: JournalLine[] = [];
  ids.forEach((id, i) => {
    const def = COMPONENTS[id];
    const asset: FixedAsset = {
      id: state.coop.nextId++, facilityId, label: `${label}: ${def.label}`, account: def.account, cost: parts[i], accumDep: 0,
      lifeMonths: def.lifeYears > 0 ? Math.max(12, Math.round(def.lifeYears * 12 * remainingLifeShare)) : 0, startMonth: state.clock.monthIndex,
    };
    state.coop.assets.push(asset);
    lines.push({ account: def.account, division, amount: parts[i] });
  });
  return lines;
}

/** Monthly straight-line depreciation for all assets. */
export function stepDepreciation(ctx: TickContext): void {
  const { state } = ctx;
  const byDiv = new Map<DivisionId, number>();
  const divOf = new Map(state.coop.facilities.map((f) => [f.id, f.division]));
  for (const a of state.coop.assets) {
    if (a.lifeMonths <= 0 || a.accumDep >= a.cost) continue;
    const dep = Math.min(a.cost - a.accumDep, Math.max(1, Math.round(a.cost / a.lifeMonths)));
    a.accumDep += dep;
    const d = divOf.get(a.facilityId) ?? (a.facilityId < 0 ? 'CORP' : 'GRAIN');
    byDiv.set(d, (byDiv.get(d) ?? 0) + dep);
  }
  const lines: JournalLine[] = [];
  for (const [d, v] of [...byDiv.entries()].sort()) lines.push({ account: '7100', division: d, amount: v }, { account: '1590', division: d, amount: -v });
  if (lines.length) post(state, { source: 'depreciation', memo: 'Monthly depreciation', lines });
}

export const netBookValue = (state: GameState, facilityId: number): Cents =>
  state.coop.assets.filter((a) => a.facilityId === facilityId).reduce((s, a) => s + a.cost - a.accumDep, 0);

/** Advance capital projects: spend evenly, complete into the asset register. */
export function stepProjects(ctx: TickContext): void {
  const { state, mi } = ctx;
  const done: CapitalProject[] = [];
  for (const p of state.coop.projects) {
    const monthsLeft = Math.max(1, p.completeMonth - mi + 1);
    const spend = Math.round((p.budget - p.spent) / monthsLeft);
    const division = state.coop.facilities.find((f) => f.id === p.facilityId)?.division ?? 'GRAIN';
    if (spend > 0) {
      post(state, {
        source: 'capex', memo: `Construction: ${p.label}`,
        lines: [{ account: '1540', division, amount: spend }, { account: '1000', division, amount: -spend }],
      });
      p.spent += spend;
    }
    if (mi >= p.completeMonth) done.push(p);
  }
  for (const p of done) completeProject(ctx, p);
  if (done.length) state.coop.projects = state.coop.projects.filter((p) => !done.includes(p));
}

function completeProject(ctx: TickContext, p: CapitalProject): void {
  const { state } = ctx;
  const f = state.coop.facilities.find((x) => x.id === p.facilityId);
  if (!f) return;
  let lines: JournalLine[];
  if (p.renovation) {
    const asset: FixedAsset = { id: state.coop.nextId++, facilityId: f.id, label: `${f.name}: renovation`, account: '1510', cost: p.spent, accumDep: 0, lifeMonths: FACILITY_COSTS.renovationLifeYears * 12, startMonth: ctx.mi };
    state.coop.assets.push(asset);
    lines = [{ account: '1510', division: f.division, amount: p.spent }];
    f.condition = Math.min(100, f.condition + FACILITY_COSTS.renovateConditionGain.value);
  } else {
    lines = capitalize(state, f.id, p.components, p.spent, f.name);
    for (const id of Object.keys(p.components) as ComponentId[]) f.components[id] = (f.components[id] ?? 0) + (p.components[id] ?? 0);
  }
  post(state, { source: 'capex-complete', memo: `Placed in service: ${p.label}`, lines: [...lines, { account: '1540', division: f.division, amount: -p.spent }] });
  if (f.status === 'underConstruction') f.status = 'operating';
  ctx.inbox({ kind: 'memo', title: `Completed: ${p.label}`, body: `${p.label} is finished and in service.` });
}

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
  const add = (account: string, amount: Cents) => {
    if (amount <= 0) return;
    lines.push({ account, division, amount });
    cash += amount;
  };
  const coo = 1 + effect(state, 'coo.opex');
  const decayFactor = 1 + effect(state, 'coo.decay');
  const opexFactor = (d: DivisionId) => {
    const r = DIVISION_ROLE[d];
    return coo * (r && holder(state, r)?.traits.includes('tightWithADollar') ? 0.97 : 1);
  };
  for (const f of state.coop.facilities) {
    if (f.status === 'closed' || f.status === 'underConstruction') continue;
    division = f.division;
    const repl = replacementCost(path, mi, f.components);
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
    // Repairs rise as condition falls.
    let repairRate = 0;
    let weight = 0;
    for (const id of Object.keys(f.components) as ComponentId[]) {
      const w = midCost(id) * (f.components[id] ?? 0);
      repairRate += COMPONENTS[id].repairRate * w;
      weight += w;
    }
    repairRate = weight ? repairRate / weight : 0;
    const repairs = roundCents(((repl * repairRate) / 12) * (1 + (100 - f.condition) / 100) * (mothballed ? FACILITY_COSTS.mothballRepairShare.value : 1) * opexFactor(f.division));
    add('7200', repairs);
    add('7300', roundCents(((repl * FACILITY_COSTS.insuranceRate.value) / 12) * (1 + effect(state, 'safety.insurance'))));
    add('7640', roundCents((netBookValue(state, f.id) * FACILITY_COSTS.propertyTaxRate.value) / 12));
    // Condition decay.
    let decay = 0;
    for (const id of Object.keys(f.components) as ComponentId[]) decay += COMPONENTS[id].decayPerYear * midCost(id) * (f.components[id] ?? 0);
    f.condition = Math.max(0, f.condition - (weight ? decay / weight : 0) / 12 * (mothballed ? FACILITY_COSTS.mothballDecayShare.value : 1) * decayFactor);
    // Hidden environmental problems surface eventually.
    if (f.envLiability && !f.envLiability.discovered && ctx.rng('facilities.env', f.id).chance(FACILITY_COSTS.envDiscoveryMonthly.value)) {
      f.envLiability.discovered = true;
      post(state, {
        source: 'env-cleanup', memo: `Environmental cleanup at ${f.name}`,
        lines: [{ account: '7660', division: f.division, amount: f.envLiability.cost }, { account: '1000', division: f.division, amount: -f.envLiability.cost }],
      });
      ctx.inbox({ kind: 'alert', title: `Contamination found at ${f.name}`, body: `Soil testing during routine work at ${f.name} found old fuel and pesticide contamination from the previous owner. Cleanup will cost about $${Math.round(f.envLiability.cost / 100).toLocaleString('en-US')}. Better due diligence might have caught it before the purchase.` });
    }
  }
  if (lines.length) post(state, { source: 'facility-costs', memo: 'Facility payroll, repairs, insurance, property tax', lines: [...lines, { account: '1000', division: 'CORP', amount: -cash }] });
}

export const yearBuiltLabel = (f: Facility): string => `${f.builtYear}`;
export const isHarvestMonth = (mi: number): boolean => HARVEST_MONTHS.includes(monthOf(mi));
export const ageYears = (f: Facility, mi: number): number => yearOf(mi) - f.builtYear;
