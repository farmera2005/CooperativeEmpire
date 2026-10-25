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
import { usedValueOfUnits } from './valuation';
import { planLines, quoteProject, rebuildCost, startProject } from './projects';
import { PROJECTS } from '../../data/equipment';

type Result = CommandMessage[];
const err = (text: string): Result => [{ level: 'error', text }];
const info = (text: string): Result => [{ level: 'info', text }];

export interface ProjectEstimate {
  cost: Cents;
  months: number;
  problems: string[];
}

/**
 * Price component totals at a town as the units a careful engineer would order (D-129). Kept
 * for the policy bots, board proposals and older commands; players build from the catalog.
 */
export function estimateProject(state: GameState, townId: number, components: Components, existing?: Facility, kind: FacilityKind = existing?.kind ?? 'elevator'): ProjectEstimate {
  const q = quoteProject(state, { townId, kind, ...(existing ? { facilityId: existing.id } : {}), lines: planLines(state, components, existing) });
  return { cost: q.total, months: q.months, problems: q.problems };
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

/** Why a purchase can't be paid for (term loan for `financePct`, the rest from cash and the line), or null. */
export function purchaseFinancingProblem(state: GameState, cost: Cents, financePct: number): string | null {
  const loan = roundCents(cost * Math.max(0, Math.min(LENDING.maxFinancePct.value, financePct)));
  const refused = lenderReview(state, cost, loan);
  if (refused) return refused;
  const cashNeeded = cost - loan;
  if (cashNeeded > liquidity(state)) return `Not enough cash and line of credit: need ${formatCents(cashNeeded)} beyond the ${formatCents(loan)} term loan, have ${formatCents(liquidity(state))} available.`;
  return null;
}

/** Arrange a purchase's financing (creates the term loan); returns an error result if it can't be paid for. */
export function financePurchase(state: GameState, cost: Cents, financePct: number, purpose: string): Result | null {
  const problem = purchaseFinancingProblem(state, cost, financePct);
  if (problem) return err(problem);
  const loan = roundCents(cost * Math.max(0, Math.min(LENDING.maxFinancePct.value, financePct)));
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
  const fail = financePurchase(state, o.price, financePct, `Purchase of ${facilityName(town.name, o.kind)}`);
  if (fail) return fail;
  const f = newFacility(state, o.townId, facilityName(town.name, o.kind), o.components, 'operating', o.builtYear, o.condition, o.kind, `offer|${o.id}`);
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

/** Build a new supply site from component totals, as catalog units (older command; D-129). */
export function buildFacility(state: GameState, kind: Exclude<FacilityKind, 'elevator'>, townId: number, components: Components, financePct: number): Result {
  if (!state.world.towns[townId]) return err('Unknown town.');
  const clean: Components = { site: components.site ?? TYPICAL_SITE[kind].site ?? 1 };
  for (const id of Object.keys(components) as ComponentId[]) if ((components[id] ?? 0) > 0) clean[id] = components[id];
  const wrong = (Object.keys(clean) as ComponentId[]).filter((id) => id !== 'site' && COMPONENTS[id].division !== KIND_DIVISION[kind]);
  if (wrong.length) return err(`${wrong.map((id) => COMPONENTS[id].label).join(', ')} does not belong at a ${KIND_LABEL[kind].toLowerCase()}.`);
  return startProject(state, { townId, kind, lines: planLines(state, clean) }, financePct);
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
  if (spec.storageBu < 10_000 || spec.receiveBuHr < 500) return err('An elevator needs at least 10,000 bu of storage and a 500 bu/hr leg.');
  return startProject(state, { townId, kind: 'elevator', lines: planLines(state, specComponents(spec)) }, financePct);
}

/** Add capacity to a site from component totals, as catalog units (older command; D-129). */
export function upgradeFacility(state: GameState, facilityId: number, components: Components, financePct: number): Result {
  const f = state.coop.facilities.find((x) => x.id === facilityId);
  if (!f || f.status === 'closed') return err('Unknown facility.');
  const clean: Components = {};
  for (const id of Object.keys(components) as ComponentId[]) if ((components[id] ?? 0) > 0) clean[id] = components[id];
  const wrong = (Object.keys(clean) as ComponentId[]).filter((id) => id !== 'site' && COMPONENTS[id].division !== f.division);
  if (wrong.length) return err(`${wrong.map((id) => COMPONENTS[id].label).join(', ')} does not belong at ${f.name}.`);
  return startProject(state, { facilityId: f.id, townId: f.townId, kind: f.kind, lines: planLines(state, clean, f) }, financePct);
}

/** Worn units a renovation rebuilds: those below the threshold that can still be rebuilt. */
export function renovationUnits(state: GameState, f: Facility): number[] {
  const busy = new Set(state.coop.projects.flatMap((p) => (p.lines ?? []).filter((l) => !l.done && l.unitId !== undefined).map((l) => l.unitId!)));
  return f.units.filter((u) => u.component !== 'site' && u.condition < FACILITY_COSTS.renovateBelow.value && (u.rebuilds ?? 0) < PROJECTS.maxRebuilds && !busy.has(u.id)).map((u) => u.id);
}

export function renovationCost(state: GameState, f: Facility): Cents {
  return renovationUnits(state, f).reduce((a, id) => a + rebuildCost(state, f.units.find((u) => u.id === id)!), 0);
}

/** Rebuild every worn unit at a site in one project. */
export function renovateFacility(state: GameState, facilityId: number, financePct: number): Result {
  const f = state.coop.facilities.find((x) => x.id === facilityId);
  if (!f || f.status === 'closed') return err('Unknown facility.');
  const ids = renovationUnits(state, f);
  if (!ids.length) return err(`Nothing at ${f.name} is worn enough to rebuild.`);
  return startProject(state, { facilityId: f.id, townId: f.townId, kind: f.kind, lines: ids.map((rebuildUnitId) => ({ rebuildUnitId })) }, financePct);
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
  const proceeds = roundCents(usedValueOfUnits(pathFor(state), mi, f.units) * FACILITY_COSTS.salvageShare.value);
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
