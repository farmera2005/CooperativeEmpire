// Player actions on facilities: due diligence, purchase, build, upgrade, renovate,
// mothball, reopen, close. Each mutates a working copy and returns messages.

import { COMPONENTS, KIND_DIVISION, KIND_LABEL, LOADOUT_COMPONENTS, LOADOUT_RANK, TYPICAL_SITE, type ComponentId, type FacilityKind, type LoadoutType } from '../../data/facilities';
import { FACILITY_COSTS, MARKETPLACE } from '../../data/grain';
import { LENDING } from '../../data/tuning';
import { yearOf } from '../core/calendar';
import { formatCents } from '../core/format';
import { roundCents, type Cents } from '../core/money';
import { stream } from '../core/rng';
import { post } from '../ledger/ledger';
import { brandLabel, createTermLoan, liquidity, renewalCommitment } from '../finance/lender';
import { capexRestricted, covenantSet } from '../finance/covenants';
import { balanceSheet } from '../ledger/statements';
import type { CommandMessage } from '../sim/commands';
import type { Facility, GameState, StaffLevel, PayPosition } from '../types';
import { nominalCents, pathFor } from '../world/macro';
import { capitalize, facilityBu, grainCapacity, netBookValue, newFacility, replacementCost, type Components } from './facilities';
import { usedValue } from '../competitors/competitors';

type Result = CommandMessage[];
const err = (text: string): Result => [{ level: 'error', text }];
const info = (text: string): Result => [{ level: 'info', text }];

export interface ProjectEstimate {
  cost: Cents;
  months: number;
  problems: string[];
}

/** Validate and price a set of components to add at a town (new site or upgrade). */
export function estimateProject(state: GameState, townId: number, components: Components, existing?: Facility): ProjectEstimate {
  const mi = state.clock.monthIndex;
  const year = yearOf(mi);
  const problems: string[] = [];
  const town = state.world.towns[townId];
  const lines = town.railLineIds.map((id) => state.world.rail[id]).filter((r) => r.status === 'active');
  let months = 0;
  let permit = 0;
  for (const id of Object.keys(components) as ComponentId[]) {
    const q = components[id] ?? 0;
    if (q <= 0) continue;
    const def = COMPONENTS[id];
    if (def.availableFrom > year) problems.push(`${def.label} is not available until ${def.availableFrom}.`);
    if (def.buildableTo !== undefined && year > def.buildableTo) problems.push(`${def.label} is no longer built.`);
    if (def.requires === 'rail' && !lines.length) problems.push(`${def.label} needs a rail line through ${town.name}.`);
    if (def.requires === 'mainline' && !lines.some((r) => r.kind === 'mainline')) problems.push(`${def.label} needs a Class I main line through ${town.name}.`);
    if (def.loadout && existing) {
      const cur = grainCapacity(existing.components).loadout;
      if (LOADOUT_RANK[def.loadout] <= LOADOUT_RANK[cur]) problems.push(`${existing.name} already has an equal or better load-out.`);
    }
    months = Math.max(months, def.buildMonths);
    permit = Math.max(permit, def.permitMonths);
  }
  const cost = replacementCost(pathFor(state), mi, components);
  if (cost <= 0) problems.push('Nothing to build.');
  return { cost, months: Math.max(1, months + permit), problems };
}

/** The lender's credit review: no new capital under special credit; term loans only if the pro-forma balance sheet meets covenants. */
export function lenderReview(state: GameState, cost: Cents, loan: Cents): string | null {
  if (capexRestricted(state)) return `${brandLabel(state.coop.lenderId)} has frozen capital spending while our loans are in special credit.`;
  if (loan <= 0) return null;
  const bs = balanceSheet(state.ledger, state.clock.monthIndex);
  const c = covenantSet(state);
  const eqRatio = bs.totalEquity / Math.max(1, bs.totalAssets + cost);
  if (eqRatio < c.minEquityRatio) return `${brandLabel(state.coop.lenderId)} declined the term loan: owner equity would be ${(eqRatio * 100).toFixed(0)}% of assets, below the ${(c.minEquityRatio * 100).toFixed(0)}% covenant. Pay cash or build equity first.`;
  const fixed = bs.fixedAssets.reduce((s, x) => s + x.amount, 0) + state.coop.projects.reduce((s, p) => s + Math.max(0, p.budget - p.spent), 0);
  const term = state.coop.finance.termLoans.reduce((s, l) => s + l.balance, 0);
  const ratio = (term + loan) / Math.max(1, fixed + cost);
  if (ratio > c.maxTermDebtToFixed) return `${brandLabel(state.coop.lenderId)} declined the term loan: term debt would be ${(ratio * 100).toFixed(0)}% of fixed assets, above the ${(c.maxTermDebtToFixed * 100).toFixed(0)}% covenant. Finance less of the project.`;
  return null;
}

function finance(state: GameState, cost: Cents, financePct: number, purpose: string): Result | null {
  const pct = Math.max(0, Math.min(LENDING.maxFinancePct.value, financePct));
  const loan = roundCents(cost * pct);
  const refused = lenderReview(state, cost, loan);
  if (refused) return err(refused);
  const cashNeeded = cost - loan;
  if (cashNeeded > liquidity(state)) {
    return err(`Not enough cash and line of credit: need ${formatCents(cashNeeded)} beyond the ${formatCents(loan)} term loan, have ${formatCents(liquidity(state))} available.`);
  }
  if (loan > 0) createTermLoan(state, loan, purpose);
  return null;
}

export function dueDiligence(state: GameState, offerId: number): Result {
  const o = state.coop.offers.find((x) => x.id === offerId);
  if (!o) return err('That offer is no longer available.');
  if (o.diligenceDone) return info('Due diligence already done.');
  const mi = state.clock.monthIndex;
  const fee = nominalCents(pathFor(state), mi, MARKETPLACE.dueDiligenceCost.value);
  post(state, { source: 'due-diligence', memo: `Due diligence: ${o.sellerName}`, lines: [{ account: '7670', division: 'GRAIN', amount: fee }, { account: '1000', division: 'GRAIN', amount: -fee }] });
  o.diligenceDone = true;
  o.conditionEstimate = [o.condition, o.condition];
  const rng = stream(state.setup.gameSeed, mi, 'facilities.diligence', o.id);
  const msgs: Result = [{ level: 'info', text: `Engineers rate the facility's condition at ${Math.round(o.condition)}/100.` }];
  if (o.envLiability > 0 && rng.chance(MARKETPLACE.diligenceFindProb.value)) {
    o.envFound = true;
    const cut = roundCents(o.envLiability * MARKETPLACE.sellerCleanupShare.value);
    o.price = Math.max(roundCents(o.price * MARKETPLACE.minPriceAfterCleanup.value), o.price - cut);
    o.envLiability = 0;
    msgs.push({ level: 'warning', text: `Phase I/II environmental review found contamination. The seller agreed to cut the price by ${formatCents(cut)} and clean it up before closing.` });
  } else msgs.push({ level: 'info', text: 'No environmental problems were found.' });
  return msgs;
}

export function buyOffer(state: GameState, offerId: number, financePct: number): Result {
  const o = state.coop.offers.find((x) => x.id === offerId);
  if (!o) return err('That offer is no longer available.');
  const mi = state.clock.monthIndex;
  const town = state.world.towns[o.townId];
  const fail = finance(state, o.price, financePct, `Purchase of ${facilityName(town.name, o.kind)}`);
  if (fail) return fail;
  const f = newFacility(state, o.townId, facilityName(town.name, o.kind), o.components, 'operating', o.builtYear, o.condition, o.kind);
  if (o.envLiability > 0) f.envLiability = { cost: o.envLiability, discovered: false };
  // Remaining life reflects the age of what was bought.
  const remaining = Math.max(0.3, 1 - (yearOf(mi) - o.builtYear) / 50);
  const lines = capitalize(state, f.id, o.components, o.price, f.name, remaining);
  post(state, { source: 'acquisition', memo: `Purchase ${f.name} from ${o.sellerName}`, lines: [...lines, { account: '1000', division: 'GRAIN', amount: -o.price }] });
  // The seller leaves the market.
  const comp = state.competitors.find((c) => c.id === o.competitorId);
  if (comp) {
    comp.sites = comp.sites.filter((s) => s.townId !== o.townId);
    if (!comp.sites.length) comp.status = 'sold';
  }
  state.coop.offers = state.coop.offers.filter((x) => x.id !== o.id);
  const renewed = renewalCommitment(state);
  const msg = `Bought the ${facilityName(town.name, o.kind)} for ${formatCents(o.price)}.`;
  if (renewed > state.coop.finance.lineCommitment) {
    state.coop.finance.lineCommitment = renewed;
    return info(`${msg} The lender raised the seasonal line to ${formatCents(renewed)} to carry grain inventory.`);
  }
  return info(msg);
}

export const facilityName = (town: string, kind: FacilityKind): string =>
  kind === 'elevator' ? `${town} elevator` : `${town} ${KIND_LABEL[kind].toLowerCase()}`;

/** Build a new supply site (agronomy center, feed mill, fuel plant, station, store) from components. */
export function buildFacility(state: GameState, kind: Exclude<FacilityKind, 'elevator'>, townId: number, components: Components, financePct: number): Result {
  const town = state.world.towns[townId];
  if (!town) return err('Unknown town.');
  if (state.coop.facilities.some((f) => f.townId === townId && f.kind === kind && f.status !== 'closed')) return err(`We already have a ${KIND_LABEL[kind].toLowerCase()} in ${town.name}; upgrade it instead.`);
  const clean: Components = { site: components.site ?? TYPICAL_SITE[kind].site ?? 1 };
  for (const id of Object.keys(components) as ComponentId[]) if ((components[id] ?? 0) > 0) clean[id] = components[id];
  const wrong = (Object.keys(clean) as ComponentId[]).filter((id) => id !== 'site' && COMPONENTS[id].division !== KIND_DIVISION[kind]);
  if (wrong.length) return err(`${wrong.map((id) => COMPONENTS[id].label).join(', ')} does not belong at a ${KIND_LABEL[kind].toLowerCase()}.`);
  const est = estimateProject(state, townId, clean);
  if (est.problems.length) return err(est.problems.join(' '));
  const label = `New ${KIND_LABEL[kind].toLowerCase()} at ${town.name}`;
  const loanFail = financeProject(state, est.cost, financePct, label);
  if (loanFail) return loanFail;
  const f = newFacility(state, townId, facilityName(town.name, kind), {}, 'underConstruction', yearOf(state.clock.monthIndex), 100, kind);
  state.coop.projects.push({ id: state.coop.nextId++, facilityId: f.id, label, components: clean, budget: est.cost, spent: 0, startMonth: state.clock.monthIndex, completeMonth: state.clock.monthIndex + est.months });
  return info(`Construction approved: ${formatCents(est.cost)}, about ${est.months} months.`);
}

export interface BuildSpec {
  storageType: 'storage-steel' | 'storage-concrete' | 'storage-flat';
  storageBu: number;
  receiveBuHr: number;
  dryBuHr: number;
  loadout: LoadoutType;
}

export function specComponents(spec: BuildSpec): Components {
  const c: Components = {
    site: Math.round(5 + spec.storageBu / 100_000),
    [spec.storageType]: spec.storageBu,
    receiving: spec.receiveBuHr,
    'truck-scale': 1,
  };
  if (spec.dryBuHr > 0) c.dryer = spec.dryBuHr;
  const lo = LOADOUT_COMPONENTS.find((id) => COMPONENTS[id].loadout === spec.loadout);
  if (lo) c[lo] = 1;
  return c;
}

export function buildElevator(state: GameState, townId: number, spec: BuildSpec, financePct: number): Result {
  const town = state.world.towns[townId];
  if (!town) return err('Unknown town.');
  if (state.coop.facilities.some((f) => f.townId === townId && f.status !== 'closed')) return err(`We already have an elevator in ${town.name}; upgrade it instead.`);
  if (spec.storageBu < 10_000 || spec.receiveBuHr < 500) return err('An elevator needs at least 10,000 bu of storage and a 500 bu/hr leg.');
  const comps = specComponents(spec);
  const est = estimateProject(state, townId, comps);
  if (est.problems.length) return err(est.problems.join(' '));
  const loanFail = financeProject(state, est.cost, financePct, `New elevator at ${town.name}`);
  if (loanFail) return loanFail;
  const f = newFacility(state, townId, `${town.name} elevator`, {}, 'underConstruction', yearOf(state.clock.monthIndex), 100);
  state.coop.projects.push({ id: state.coop.nextId++, facilityId: f.id, label: `New elevator at ${town.name}`, components: comps, budget: est.cost, spent: 0, startMonth: state.clock.monthIndex, completeMonth: state.clock.monthIndex + est.months });
  return info(`Construction approved: ${formatCents(est.cost)}, about ${est.months} months.`);
}

/** Projects are paid as built; check the co-op can carry the unfinanced part. */
function financeProject(state: GameState, cost: Cents, financePct: number, purpose: string): Result | null {
  const pct = Math.max(0, Math.min(LENDING.maxFinancePct.value, financePct));
  const loan = roundCents(cost * pct);
  const refused = lenderReview(state, cost, loan);
  if (refused) return err(refused);
  if (cost - loan > liquidity(state)) return err(`Not enough cash and line of credit to fund ${formatCents(cost - loan)} of construction.`);
  if (loan > 0) createTermLoan(state, loan, purpose);
  return null;
}

export function upgradeFacility(state: GameState, facilityId: number, components: Components, financePct: number): Result {
  const f = state.coop.facilities.find((x) => x.id === facilityId);
  if (!f || f.status === 'closed') return err('Unknown facility.');
  if (state.coop.projects.some((p) => p.facilityId === f.id)) return err(`${f.name} already has a project under way.`);
  const clean: Components = {};
  for (const id of Object.keys(components) as ComponentId[]) if ((components[id] ?? 0) > 0) clean[id] = components[id];
  const wrong = (Object.keys(clean) as ComponentId[]).filter((id) => id !== 'site' && COMPONENTS[id].division !== f.division);
  if (wrong.length) return err(`${wrong.map((id) => COMPONENTS[id].label).join(', ')} does not belong at ${f.name}.`);
  const est = estimateProject(state, f.townId, clean, f);
  if (est.problems.length) return err(est.problems.join(' '));
  const fail = financeProject(state, est.cost, financePct, `Upgrade of ${f.name}`);
  if (fail) return fail;
  const label = (Object.keys(clean) as ComponentId[]).map((id) => COMPONENTS[id].label).join(', ');
  state.coop.projects.push({ id: state.coop.nextId++, facilityId: f.id, label: `${f.name}: ${label}`, components: clean, budget: est.cost, spent: 0, startMonth: state.clock.monthIndex, completeMonth: state.clock.monthIndex + est.months });
  return info(`Upgrade approved: ${formatCents(est.cost)}, about ${est.months} months.`);
}

export function renovationCost(state: GameState, f: Facility): Cents {
  return roundCents(replacementCost(pathFor(state), state.clock.monthIndex, f.components) * FACILITY_COSTS.renovateCostShare.value);
}

export function renovateFacility(state: GameState, facilityId: number, financePct: number): Result {
  const f = state.coop.facilities.find((x) => x.id === facilityId);
  if (!f || f.status === 'closed') return err('Unknown facility.');
  if (state.coop.projects.some((p) => p.facilityId === f.id)) return err(`${f.name} already has a project under way.`);
  const cost = renovationCost(state, f);
  const fail = financeProject(state, cost, financePct, `Renovation of ${f.name}`);
  if (fail) return fail;
  state.coop.projects.push({ id: state.coop.nextId++, facilityId: f.id, label: `${f.name}: renovation`, components: {}, budget: cost, spent: 0, startMonth: state.clock.monthIndex, completeMonth: state.clock.monthIndex + FACILITY_COSTS.renovationMonths, renovation: true });
  return info(`Renovation approved: ${formatCents(cost)}, about ${FACILITY_COSTS.renovationMonths} months.`);
}

export function setFacilityStatus(state: GameState, facilityId: number, status: 'mothballed' | 'operating'): Result {
  const f = state.coop.facilities.find((x) => x.id === facilityId);
  if (!f || f.status === 'closed' || f.status === 'underConstruction') return err('That facility cannot be changed now.');
  if (status === 'mothballed' && facilityBu(f) > 1000) return err(`Ship out the grain at ${f.name} before mothballing it.`);
  f.status = status;
  return info(status === 'mothballed' ? `${f.name} is mothballed. Farmers in ${state.world.towns[f.townId].name} will haul elsewhere.` : `${f.name} is open again.`);
}

/** Close and sell a site for salvage; the gain or loss goes to other income. */
export function closeFacility(state: GameState, facilityId: number): Result {
  const f = state.coop.facilities.find((x) => x.id === facilityId);
  if (!f || f.status === 'closed') return err('Unknown facility.');
  if (facilityBu(f) > 1000) return err(`Ship out the grain at ${f.name} before closing it.`);
  if (state.coop.projects.some((p) => p.facilityId === f.id)) return err('Finish or cancel the project first.');
  const mi = state.clock.monthIndex;
  const proceeds = roundCents(usedValue(pathFor(state), mi, f.components, yearOf(mi) - f.builtYear, f.condition) * FACILITY_COSTS.salvageShare.value);
  const assets = state.coop.assets.filter((a) => a.facilityId === f.id);
  const nbv = netBookValue(state, f.id);
  const lines = [{ account: '1000', division: 'GRAIN' as const, amount: proceeds }];
  const byAcct: Record<string, number> = {};
  let accum = 0;
  for (const a of assets) {
    byAcct[a.account] = (byAcct[a.account] ?? 0) + a.cost;
    accum += a.accumDep;
  }
  for (const [acct, cost] of Object.entries(byAcct)) lines.push({ account: acct, division: 'GRAIN', amount: -cost });
  if (accum) lines.push({ account: '1590', division: 'GRAIN', amount: accum });
  const gain = proceeds - nbv;
  if (gain !== 0) lines.push({ account: '8200', division: 'GRAIN', amount: -gain });
  post(state, { source: 'disposal', memo: `Close and sell ${f.name}`, lines });
  state.coop.assets = state.coop.assets.filter((a) => a.facilityId !== f.id);
  f.status = 'closed';
  for (const m of state.members.list) if (m.townId === f.townId && m.status === 'active') m.satisfaction = Math.max(0, m.satisfaction - 10);
  return info(`${f.name} closed and sold for ${formatCents(proceeds)} (${gain >= 0 ? 'gain' : 'loss'} of ${formatCents(Math.abs(gain))} vs book). Members in ${state.world.towns[f.townId].name} are not happy.`);
}

export function setStaffing(state: GameState, facilityId: number, level: StaffLevel, pay: PayPosition): Result {
  const f = state.coop.facilities.find((x) => x.id === facilityId);
  if (!f) return err('Unknown facility.');
  f.staffing = { level, pay };
  return [];
}
