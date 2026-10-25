// Capital projects made of line items (D-129): build so many of a catalog model from a chosen
// maker, buy land, or rebuild a worn unit. Lines are permitted together and built in parallel;
// each comes into service when finished, so the first bins can fill while the dryer goes up.
// The cost overrun and delay are drawn when the project is approved — a good project manager
// narrows them, a poor one widens them — and become known about halfway through.

import { COMPONENTS, KIND_DIVISION, KIND_LABEL, LOADOUT_RANK, midCost, type ComponentId, type FacilityKind } from '../../data/facilities';
import { CONSULTING, PROJECTS } from '../../data/equipment';
import { FACILITY_COSTS } from '../../data/grain';
import { LENDING } from '../../data/tuning';
import { yearOf } from '../core/calendar';
import { formatCents } from '../core/format';
import { allocateCents, roundCents, type Cents } from '../core/money';
import { stream } from '../core/rng';
import { post } from '../ledger/ledger';
import { createTermLoan, liquidity } from '../finance/lender';
import type { CommandMessage } from '../sim/commands';
import type { TickContext } from '../sim/context';
import type { CapitalProject, Facility, FixedAsset, GameState, InstalledUnit, JournalLine, ProjectLine } from '../types';
import { constructionLevel, pathFor } from '../world/macro';
import { consultantById } from './consultants';
import { facilityBu, grainCapacity, newFacility } from './facilities';
import {
  footprintAcres, makerOf, makersFor, modelOf, modelsFor, needsMaker, siteAcres, syncFacility, unitCapacity, unitPrice, unitsReplacementCost, unitValue2024,
} from './units';
import { lenderReview } from './actions';
import { usedValueOfUnits } from './valuation';

type Result = CommandMessage[];
const err = (text: string): Result => [{ level: 'error', text }];

/** What the player asks for on one line. */
export type LineSpec =
  | { modelId: string; brandId?: string; count: number }
  | { land: number }
  | { rebuildUnitId: number };

export interface ProjectSpec {
  /** An existing site, or a new one of `kind` at `townId`. */
  facilityId?: number;
  townId: number;
  kind: FacilityKind;
  lines: LineSpec[];
  /** Consultant hired to manage construction. */
  pmId?: number;
  /** Design this project came from, credited to its consultant. */
  designId?: number;
}

export interface QuotedLine {
  spec: LineSpec;
  label: string;
  component?: ComponentId;
  cost: Cents;
  /** Months of construction after permits and delivery. */
  buildMonths: number;
  /** Months from order to delivery; runs alongside permitting. */
  leadMonths: number;
  capacity: number;
}

export interface ProjectQuote {
  lines: QuotedLine[];
  construction: Cents;
  pmFee: Cents;
  total: Cents;
  permitMonths: number;
  /** Months from approval to the last line finishing (before any delay). */
  months: number;
  capacityAdded: Partial<Record<ComponentId, number>>;
  acresNeeded: number;
  acresAvailable: number;
  problems: string[];
  /** Not wrong, but worth a second look: mismatched leg and dryer, no scale, and so on. */
  warnings: string[];
}

const landCost = (state: GameState, acres: number): Cents =>
  roundCents(midCost('site', yearOf(state.clock.monthIndex)) * acres * constructionLevel(pathFor(state), state.clock.monthIndex) * 100);

/** Cost of rebuilding a unit: a share of a new one of the same capacity. */
export function rebuildCost(state: GameState, u: InstalledUnit): Cents {
  return roundCents(unitsReplacementCost(pathFor(state), state.clock.monthIndex, [u]) * PROJECTS.rebuildCostShare.value);
}

/** Price, schedule and checks for a proposed project; nothing changes. */
export function quoteProject(state: GameState, spec: ProjectSpec): ProjectQuote {
  const mi = state.clock.monthIndex;
  const year = yearOf(mi);
  const path = pathFor(state);
  const town = state.world.towns[spec.townId];
  const f = spec.facilityId !== undefined ? state.coop.facilities.find((x) => x.id === spec.facilityId && x.status !== 'closed') : undefined;
  const kind = f?.kind ?? spec.kind;
  const division = KIND_DIVISION[kind];
  const problems: string[] = [];
  const warnings: string[] = [];
  const lines: QuotedLine[] = [];
  const added: Partial<Record<ComponentId, number>> = {};
  let permitMonths = 0;
  let acresNeeded = 0;
  let acresBought = 0;
  if (!town) problems.push('Unknown town.');
  if (spec.facilityId !== undefined && !f) problems.push('That site is no longer ours.');
  if (!f && state.coop.facilities.some((x) => x.townId === spec.townId && x.kind === kind && x.status !== 'closed')) problems.push(`We already have a ${KIND_LABEL[kind].toLowerCase()} in ${town?.name}; add to it instead.`);
  const rails = town ? town.railLineIds.map((id) => state.world.rail[id]).filter((r) => r.status === 'active') : [];
  const rebuilding = new Set<number>();
  for (const p of state.coop.projects) for (const l of p.lines ?? []) if (l.kind === 'rebuild' && !l.done && l.unitId !== undefined) rebuilding.add(l.unitId);
  for (const ls of spec.lines) {
    if ('land' in ls) {
      if (!(ls.land > 0)) continue;
      acresBought += ls.land;
      lines.push({ spec: ls, label: `${ls.land} acres of land`, component: 'site', cost: landCost(state, ls.land), buildMonths: 1, leadMonths: 0, capacity: ls.land });
      continue;
    }
    if ('rebuildUnitId' in ls) {
      const u = f?.units.find((x) => x.id === ls.rebuildUnitId);
      if (!u || u.component === 'site') { problems.push('That unit is not at this site.'); continue; }
      if (rebuilding.has(u.id)) problems.push(`${modelOf(u.modelId).label} (${u.builtYear}) is already being rebuilt.`);
      if ((u.rebuilds ?? 0) >= PROJECTS.maxRebuilds) problems.push(`${modelOf(u.modelId).label} (${u.builtYear}) has been rebuilt as often as it can be; replace it.`);
      lines.push({ spec: ls, label: `Rebuild ${modelOf(u.modelId).label} (${u.builtYear})`, component: u.component, cost: rebuildCost(state, u), buildMonths: PROJECTS.rebuildMonths, leadMonths: 0, capacity: 0 });
      continue;
    }
    if (!(ls.count >= 1) || !Number.isInteger(ls.count)) { problems.push('Each line needs a whole number of units.'); continue; }
    const m = modelOf(ls.modelId);
    const def = COMPONENTS[m.component];
    if (!def || m.id.startsWith('legacy:')) { problems.push('Unknown equipment.'); continue; }
    if (m.component !== 'site' && def.division !== division) problems.push(`${m.label} does not belong at a ${KIND_LABEL[kind].toLowerCase()}.`);
    if (m.availableFrom > year) problems.push(`${m.label} is not offered until ${m.availableFrom}.`);
    if (m.availableTo !== undefined && year >= m.availableTo) problems.push(`${m.label} is no longer built.`);
    if (def.requires === 'rail' && !rails.length) problems.push(`${m.label} needs a rail line through ${town?.name}.`);
    if (def.requires === 'mainline' && !rails.some((r) => r.kind === 'mainline')) problems.push(`${m.label} needs a Class I main line through ${town?.name}.`);
    let maker = makerOf(undefined, m.component);
    if (needsMaker(m)) {
      const offered = makersFor(m.component, year, m.id);
      const chosen = offered.find((l) => l.brandId === ls.brandId);
      if (!chosen) problems.push(`Choose a maker for the ${m.label.toLowerCase()}.`);
      else maker = chosen;
    }
    const cost = unitPrice(path, mi, m, maker) * ls.count;
    // Bigger orders take a little longer: crews work through them in batches.
    const buildMonths = def.buildMonths + Math.floor(Math.log2(ls.count));
    permitMonths = Math.max(permitMonths, def.permitMonths);
    const cap = unitCapacity(m, maker) * ls.count;
    added[m.component] = (added[m.component] ?? 0) + cap;
    acresNeeded += m.footprintAcres * ls.count;
    lines.push({ spec: ls, label: `${ls.count} × ${m.label}`, component: m.component, cost, buildMonths, leadMonths: maker.leadMonths, capacity: cap });
  }
  if (!lines.length) problems.push('Add something to build.');
  // A new site needs zoning and a site plan review, alongside any other permits.
  if (!f) permitMonths = Math.max(permitMonths, PROJECTS.newSitePermitMonths);
  const existingAcres = f ? siteAcres(f) : 0;
  const usedAcres = f ? footprintAcres(f.units) : 0;
  const acresAvailable = existingAcres + acresBought - usedAcres;
  if (acresNeeded > acresAvailable + 1e-6) problems.push(`Not enough land: the new units need ${acresNeeded.toFixed(1)} acres and ${Math.max(0, acresAvailable).toFixed(1)} are free. Add land to the project.`);
  // Loadouts: one per site; building a smaller one than we have makes no sense.
  const lo = Object.keys(added).find((id) => COMPONENTS[id as ComponentId].loadout);
  if (lo && f) {
    const cur = grainCapacity(f.components).loadout;
    if (LOADOUT_RANK[COMPONENTS[lo as ComponentId].loadout!] <= LOADOUT_RANK[cur]) problems.push(`${f.name} already has an equal or better rail load-out.`);
  }
  if (Object.keys(added).filter((id) => COMPONENTS[id as ComponentId].loadout).length > 1) problems.push('One rail load-out per site.');
  warnings.push(...designWarnings(kind, f?.components ?? {}, added));
  const construction = lines.reduce((a, l) => a + l.cost, 0);
  const pm = spec.pmId !== undefined ? consultantById(state, spec.pmId) : null;
  if (spec.pmId !== undefined && !pm) problems.push('That consultant is not available.');
  const pmFee = pm ? roundCents(construction * pm.pmFeePct) : 0;
  const longest = Math.max(0, ...lines.map((l) => Math.max(0, l.leadMonths - permitMonths) + l.buildMonths));
  return {
    lines, construction, pmFee, total: construction + pmFee, permitMonths, months: Math.max(1, permitMonths + longest),
    capacityAdded: added, acresNeeded, acresAvailable, problems, warnings,
  };
}

/** Checks a careful engineer would raise: equipment that will bottleneck the rest. */
export function designWarnings(kind: FacilityKind, existing: Partial<Record<ComponentId, number>>, added: Partial<Record<ComponentId, number>>): string[] {
  const t = (id: ComponentId) => (existing[id] ?? 0) + (added[id] ?? 0);
  const out: string[] = [];
  if (kind === 'elevator') {
    const storage = t('storage-wood') + t('storage-concrete') + t('storage-steel') + t('storage-flat');
    const leg = t('receiving');
    const dryer = t('dryer');
    if (storage + t('ground-pile') > 0 && leg <= 0) out.push('No receiving pit and leg: the site cannot take in grain.');
    if (leg > 0 && t('truck-scale') <= 0) out.push('No truck scale: every load must be weighed.');
    if (leg > 0 && storage > 0 && storage / leg > 250) out.push(`The leg (${Math.round(leg).toLocaleString('en-US')} bu/hr) is small for ${Math.round(storage).toLocaleString('en-US')} bu of storage: harvest lines will be long.`);
    if (leg > 0 && dryer > 0 && dryer > leg * 0.6) out.push('The dryer is large for the leg; it will sit partly idle.');
    if (leg > 0 && storage > 0 && dryer <= 0) out.push('No dryer: wet corn will be turned away or shipped wet at a discount.');
    if (leg > 0 && dryer > 0 && dryer < leg * 0.08) out.push('The dryer is small for the leg: in a wet fall it will hold up receiving.');
  }
  if (kind === 'agronomy') {
    if (t('applicator') > 0 && t('dry-fert-plant') + t('liquid-fert-tanks') + t('nh3-storage') <= 0) out.push('Application rigs with no fertilizer storage here will run from other sites.');
  }
  if (kind === 'feedmill' && t('feed-mill') > 0 && t('bulk-feed-truck') <= 0) out.push('No bulk feed truck: every ton leaves on farmers\' own trucks.');
  if (kind === 'energy' && t('bulk-fuel-plant') + t('propane-storage') > 0 && t('fuel-truck') <= 0) out.push('No delivery truck: fuel and propane must be picked up.');
  return out;
}

/** Draw the hidden overrun and delay for a project, given its manager (or none). */
function drawOutcome(state: GameState, projectId: number, pmId: number | undefined): { overrun: number; slip: number } {
  const rng = stream(state.setup.gameSeed, state.clock.monthIndex, 'facilities.project', projectId);
  const pm = pmId !== undefined ? consultantById(state, pmId) : null;
  const [om, osd] = CONSULTING.overrunNoPm.value;
  const [sm, ssd] = CONSULTING.slipNoPm.value;
  // A skilled manager narrows and lowers both; an unskilled one widens them. Change orders from
  // a firm that pads its work push costs up.
  const q = pm ? pm.skill : 0.35;
  const k = 1 + CONSULTING.pmEffect * (0.5 - q) * 2;
  const pad = pm ? (1 - pm.integrity) * CONSULTING.goldPlating * 0.3 : 0;
  const overrun = Math.max(-0.06, Math.min(0.6, rng.normal(om * k + pad, osd * Math.max(0.3, k))));
  const slip = Math.max(0, Math.min(10, Math.round(rng.normal(sm * k, ssd * Math.max(0.3, k)))));
  return { overrun, slip };
}

/** Approve and start a project. The term-loan share is drawn at once; the rest is paid as built. */
export function startProject(state: GameState, spec: ProjectSpec, financePct: number): Result {
  const q = quoteProject(state, spec);
  if (q.problems.length) return err(q.problems.join(' '));
  const mi = state.clock.monthIndex;
  const town = state.world.towns[spec.townId];
  const pct = Math.max(0, Math.min(LENDING.maxFinancePct.value, financePct));
  const loan = roundCents(q.total * pct);
  const refused = lenderReview(state, q.total, loan);
  if (refused) return err(refused);
  if (q.total - loan > liquidity(state)) return err(`Not enough cash and line of credit to fund ${formatCents(q.total - loan)} of construction.`);
  let f = spec.facilityId !== undefined ? state.coop.facilities.find((x) => x.id === spec.facilityId)! : undefined;
  const label = f ? `${f.name}: ${q.lines.map((l) => l.label).join(', ')}` : `New ${KIND_LABEL[spec.kind].toLowerCase()} at ${town.name}`;
  if (loan > 0) createTermLoan(state, loan, f ? `Project at ${f.name}` : label);
  if (!f) f = newFacility(state, spec.townId, siteName(town.name, spec.kind), {}, 'underConstruction', yearOf(mi), 100, spec.kind);
  const id = state.coop.nextId++;
  const permitMonth = mi + q.permitMonths;
  // The PM fee rides on the lines in proportion to their cost, and is capitalized with them.
  const fees = q.pmFee > 0 ? allocateCents(q.pmFee, q.lines.map((l) => Math.max(1, l.cost))) : q.lines.map(() => 0);
  const lines: ProjectLine[] = q.lines.map((l, i) => {
    const s = l.spec;
    const base = { label: l.label, budget: l.cost + fees[i], spent: 0, completeMonth: mi + Math.max(q.permitMonths, l.leadMonths) + l.buildMonths, done: false };
    if ('land' in s) return { ...base, kind: 'land', count: 1, acres: s.land, completeMonth: mi + 1 };
    if ('rebuildUnitId' in s) return { ...base, kind: 'rebuild', count: 1, unitId: s.rebuildUnitId, completeMonth: mi + l.buildMonths };
    return { ...base, kind: 'build', modelId: s.modelId, ...(s.brandId ? { brandId: s.brandId } : {}), count: s.count };
  });
  const completeMonth = Math.max(...lines.map((l) => l.completeMonth));
  const outcome = drawOutcome(state, id, spec.pmId);
  state.coop.projects.push({
    id, facilityId: f.id, label, components: q.capacityAdded, budget: q.total, spent: 0, startMonth: mi, completeMonth,
    lines, permitMonth, ...(spec.pmId !== undefined ? { pmId: spec.pmId, pmFee: q.pmFee } : {}),
    overrun: outcome.overrun, slip: outcome.slip, revealMonth: mi + Math.max(1, Math.round((completeMonth - mi) / 2)), revealed: false,
    approvedBudget: q.total, approvedComplete: completeMonth,
  });
  if (spec.designId !== undefined) state.coop.designs = state.coop.designs.filter((d) => d.id !== spec.designId);
  const msgs: Result = [{ level: 'info', text: `Project approved: ${formatCents(q.total)}${q.pmFee ? ` including ${formatCents(q.pmFee)} for project management` : ''}; permits ${q.permitMonths} month${q.permitMonths === 1 ? '' : 's'}, finished in about ${completeMonth - mi} months.` }];
  for (const w of q.warnings) msgs.push({ level: 'warning', text: w });
  return msgs;
}

export const siteName = (town: string, kind: FacilityKind): string =>
  kind === 'elevator' ? `${town} elevator` : `${town} ${KIND_LABEL[kind].toLowerCase()}`;

/**
 * Put units on the asset register: the total is split by replacement value, one asset per
 * unit. Returns the journal debits for the caller to balance.
 */
export function capitalizeUnits(state: GameState, f: Facility, units: InstalledUnit[], total: Cents, remainingLifeShare = 1): JournalLine[] {
  if (!units.length || total === 0) return [];
  const weights = units.map((u) => Math.max(1e-6, u.component === 'site' ? midCost('site', u.builtYear) * u.qty : unitValue2024(u)));
  const parts = allocateCents(total, weights);
  const byAcct = new Map<string, Cents>();
  units.forEach((u, i) => {
    const def = COMPONENTS[u.component];
    const asset: FixedAsset = {
      id: state.coop.nextId++, facilityId: f.id, label: `${f.name}: ${modelOf(u.modelId).label} (${u.builtYear})`, account: def.account, cost: parts[i], accumDep: 0,
      lifeMonths: def.lifeYears > 0 ? Math.max(12, Math.round(def.lifeYears * 12 * remainingLifeShare)) : 0, startMonth: state.clock.monthIndex,
    };
    state.coop.assets.push(asset);
    u.assetId = asset.id;
    byAcct.set(def.account, (byAcct.get(def.account) ?? 0) + parts[i]);
  });
  return [...byAcct.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([account, amount]) => ({ account, division: f.division, amount }));
}

/** Spend on and finish project lines; reveal overruns and delays midway. */
export function stepProjects(ctx: TickContext): void {
  const { state, mi } = ctx;
  for (const p of state.coop.projects) {
    const f = state.coop.facilities.find((x) => x.id === p.facilityId);
    if (!f) continue;
    if (!p.lines) { legacyProjectMonth(ctx, p, f); continue; }
    if (!p.revealed && p.revealMonth !== undefined && mi >= p.revealMonth) revealOutcome(ctx, p, f);
    let spend = 0;
    for (const l of p.lines) {
      if (l.done) continue;
      const left = Math.max(1, l.completeMonth - mi + 1);
      const s = Math.round((l.budget - l.spent) / left);
      if (s !== 0) { l.spent += s; spend += s; }
    }
    if (spend !== 0) {
      post(state, { source: 'capex', memo: `Construction: ${p.label}`, lines: [{ account: '1540', division: f.division, amount: spend }, { account: '1000', division: f.division, amount: -spend }] });
      p.spent += spend;
    }
    for (const l of p.lines) if (!l.done && mi >= l.completeMonth) completeLine(ctx, p, f, l);
  }
  const finished = state.coop.projects.filter((p) => p.lines ? p.lines.every((l) => l.done) : mi >= p.completeMonth);
  for (const p of finished) finishProject(ctx, p);
  if (finished.length) state.coop.projects = state.coop.projects.filter((p) => !finished.includes(p));
}

const DELAY_CAUSES = ['a wet spring kept crews off the site', 'steel deliveries ran behind', 'the electrical contractor was short of crews', 'foundation work ran into soft ground', 'change orders reworked the plans', 'permits came back with conditions'];

function revealOutcome(ctx: TickContext, p: CapitalProject, f: Facility): void {
  p.revealed = true;
  const over = p.overrun ?? 0;
  const slip = p.slip ?? 0;
  const lines = p.lines!.filter((l) => !l.done);
  if (over !== 0) for (const l of lines) l.budget = roundCents(l.budget * (1 + over * (l.budget / Math.max(1, l.budget))));
  if (slip > 0) for (const l of lines) if (l.kind === 'build') l.completeMonth += slip;
  p.budget = p.lines!.reduce((a, l) => a + l.budget, 0);
  p.completeMonth = Math.max(...p.lines!.map((l) => l.completeMonth));
  if (Math.abs(over) < 0.02 && slip === 0) return;
  const cause = DELAY_CAUSES[Math.floor(ctx.rng('facilities.project.cause', p.id).next() * DELAY_CAUSES.length)];
  const pm = p.pmId !== undefined ? consultantById(ctx.state, p.pmId) : null;
  const bits = [
    over >= 0.02 ? `costs are running about ${Math.round(over * 100)}% over budget (now ${formatCents(p.budget)})` : over <= -0.02 ? `costs are coming in about ${Math.round(-over * 100)}% under budget` : '',
    slip > 0 ? `the work is ${slip} month${slip === 1 ? '' : 's'} behind because ${cause}` : '',
  ].filter(Boolean);
  ctx.inbox({ kind: over > 0.08 || slip > 2 ? 'alert' : 'memo', title: `Project update: ${f.name}`, body: `${pm ? `${pm.name} reports` : 'The project report says'} ${bits.join(', and ')}.` });
}

function completeLine(ctx: TickContext, p: CapitalProject, f: Facility, l: ProjectLine): void {
  const { state, mi } = ctx;
  const year = yearOf(mi);
  // Pay any rounding left on the line before it goes on the books.
  const rest = l.budget - l.spent;
  if (rest !== 0) {
    post(state, { source: 'capex', memo: `Construction: ${p.label}`, lines: [{ account: '1540', division: f.division, amount: rest }, { account: '1000', division: f.division, amount: -rest }] });
    l.spent += rest;
    p.spent += rest;
  }
  let debits: JournalLine[] = [];
  if (l.kind === 'land') {
    const u: InstalledUnit = { id: state.coop.nextId++, modelId: 'land', component: 'site', qty: l.acres ?? 0, builtYear: year, condition: 100 };
    f.units.push(u);
    debits = capitalizeUnits(state, f, [u], l.spent);
  } else if (l.kind === 'rebuild') {
    const u = f.units.find((x) => x.id === l.unitId);
    if (u) {
      u.condition = Math.min(PROJECTS.rebuildConditionCap.value, u.condition + PROJECTS.rebuildConditionGain.value);
      u.rebuilds = (u.rebuilds ?? 0) + 1;
      const def = COMPONENTS[u.component];
      const asset: FixedAsset = { id: state.coop.nextId++, facilityId: f.id, label: `${f.name}: rebuild of ${modelOf(u.modelId).label} (${u.builtYear})`, account: def.account, cost: l.spent, accumDep: 0, lifeMonths: Math.max(12, Math.round(def.lifeYears * 12 * PROJECTS.rebuildLifeShare.value)), startMonth: mi };
      state.coop.assets.push(asset);
      debits = [{ account: def.account, division: f.division, amount: l.spent }];
    } else debits = [{ account: '7200', division: f.division, amount: l.spent }];
  } else {
    const m = modelOf(l.modelId!);
    const maker = makerOf(l.brandId, m.component);
    const units: InstalledUnit[] = [];
    for (let i = 0; i < l.count; i++) units.push({ id: state.coop.nextId++, modelId: m.id, ...(l.brandId ? { brandId: l.brandId } : {}), component: m.component, qty: unitCapacity(m, maker), builtYear: year, condition: 100 });
    f.units.push(...units);
    debits = capitalizeUnits(state, f, units, l.spent);
  }
  post(state, { source: 'capex-complete', memo: `Placed in service: ${l.label} at ${f.name}`, lines: [...debits, { account: '1540', division: f.division, amount: -l.spent }] });
  p.capitalized = (p.capitalized ?? 0) + l.spent;
  l.done = true;
  syncFacility(f);
  if (f.status !== 'underConstruction' && l.kind !== 'land') ctx.inbox({ kind: 'memo', title: `In service at ${f.name}`, body: `${l.label} is finished and in service at ${f.name}.` });
}

function finishProject(ctx: TickContext, p: CapitalProject): void {
  const { state, mi } = ctx;
  const f = state.coop.facilities.find((x) => x.id === p.facilityId);
  if (!f) return;
  if (f.status === 'underConstruction') f.status = 'operating';
  if (p.pmId !== undefined) {
    state.coop.consultantLog.push({
      consultantId: p.pmId, projectId: p.id, month: mi, role: 'pm',
      overrun: p.approvedBudget ? p.budget / p.approvedBudget - 1 : 0, slip: Math.max(0, p.completeMonth - (p.approvedComplete ?? p.completeMonth)),
    });
  }
  ctx.inbox({ kind: 'memo', title: `Completed: ${p.label}`, body: `${p.label} is finished${p.approvedBudget ? `: ${formatCents(p.budget)} against ${formatCents(p.approvedBudget)} approved` : ''}.` });
}

/** Projects started before D-129: spend evenly, then add their capacity as units. */
function legacyProjectMonth(ctx: TickContext, p: CapitalProject, f: Facility): void {
  const { state, mi } = ctx;
  const monthsLeft = Math.max(1, p.completeMonth - mi + 1);
  const spend = Math.round((p.budget - p.spent) / monthsLeft);
  if (spend > 0) {
    post(state, { source: 'capex', memo: `Construction: ${p.label}`, lines: [{ account: '1540', division: f.division, amount: spend }, { account: '1000', division: f.division, amount: -spend }] });
    p.spent += spend;
  }
  if (mi < p.completeMonth) return;
  let debits: JournalLine[];
  if (p.renovation) {
    for (const u of f.units) if (u.component !== 'site') u.condition = Math.min(100, u.condition + FACILITY_COSTS.renovateConditionGain.value);
    const asset: FixedAsset = { id: state.coop.nextId++, facilityId: f.id, label: `${f.name}: renovation`, account: '1510', cost: p.spent, accumDep: 0, lifeMonths: FACILITY_COSTS.renovationLifeYears * 12, startMonth: mi };
    state.coop.assets.push(asset);
    debits = [{ account: '1510', division: f.division, amount: p.spent }];
  } else {
    const units = decomposeNew(state, f, p.components, `project|${p.id}`);
    f.units.push(...units);
    debits = capitalizeUnits(state, f, units, p.spent);
  }
  post(state, { source: 'capex-complete', memo: `Placed in service: ${p.label}`, lines: [...debits, { account: '1540', division: f.division, amount: -p.spent }] });
  p.capitalized = p.spent;
  syncFacility(f);
}

/** New units for component totals built this year (legacy projects, bots' quick builds). */
function decomposeNew(state: GameState, f: Facility, comps: Partial<Record<ComponentId, number>>, key: string): InstalledUnit[] {
  const year = yearOf(state.clock.monthIndex);
  // Imported lazily to keep the module graph simple.
  return decomposeUnits(comps, { builtYear: year, nowYear: year, condition: 100, key: `${state.setup.gameSeed}|${f.id}|${key}`, nextId: () => state.coop.nextId++ });
}

import { decompose as decomposeUnits } from './units';

/**
 * Take a unit down and sell what can be salvaged. The asset leaves the register; the
 * difference against book value is a gain or loss.
 */
export function demolishUnit(state: GameState, facilityId: number, unitId: number): Result {
  const f = state.coop.facilities.find((x) => x.id === facilityId && x.status !== 'closed');
  const u = f?.units.find((x) => x.id === unitId);
  if (!f || !u) return err('Unknown unit.');
  if (u.component === 'site') return err('Land is sold with the whole site (close it).');
  if (state.coop.projects.some((p) => p.facilityId === f.id && p.lines?.some((l) => !l.done && l.unitId === u.id))) return err('That unit is being rebuilt.');
  const def = COMPONENTS[u.component];
  if (f.kind === 'elevator' && ['storage-wood', 'storage-concrete', 'storage-steel', 'storage-flat', 'ground-pile'].includes(u.component)) {
    const cap = grainCapacity(f.components);
    if (facilityBu(f) > cap.storageBu + cap.pileBu - u.qty + 1) return err(`Move grain out of ${f.name} first: the rest of the site cannot hold what is in it.`);
  }
  const mi = state.clock.monthIndex;
  const path = pathFor(state);
  const salvage = usedValueOfUnits(path, mi, [u]) * FACILITY_COSTS.salvageShare.value;
  const tearDown = unitsReplacementCost(path, mi, [u]) * PROJECTS.demolitionCostShare.value;
  const net = roundCents(salvage - tearDown);
  const asset = state.coop.assets.find((a) => a.id === u.assetId);
  const lines: JournalLine[] = [{ account: '1000', division: f.division, amount: net }];
  let nbv = 0;
  if (asset) {
    lines.push({ account: asset.account, division: f.division, amount: -asset.cost });
    if (asset.accumDep) lines.push({ account: '1590', division: f.division, amount: asset.accumDep });
    nbv = asset.cost - asset.accumDep;
    state.coop.assets = state.coop.assets.filter((a) => a.id !== asset.id);
  }
  const gain = net - nbv;
  if (gain !== 0) lines.push({ account: '8200', division: f.division, amount: -gain, facilityId: f.id });
  if (lines.some((l) => l.amount !== 0)) post(state, { source: 'disposal', memo: `Demolish ${modelOf(u.modelId).label} at ${f.name}`, lines: lines.filter((l) => l.amount !== 0) });
  f.units = f.units.filter((x) => x.id !== u.id);
  syncFacility(f);
  return [{ level: 'info', text: `${modelOf(u.modelId).label} (${u.builtYear}) at ${f.name} taken down: ${net >= 0 ? `salvage nets ${formatCents(net)}` : `demolition costs ${formatCents(-net)}`}, ${gain >= 0 ? 'a gain' : 'a loss'} of ${formatCents(Math.abs(gain))} against book value. ${def.lifeYears ? '' : ''}`.trim() }];
}

/** Lifecycle score of a maker line for a careful buyer. */
export const makerValueScore = (l: { price: number; durability: number; upkeep: number; leadMonths: number }): number =>
  l.price * (1 + 0.6 * (l.durability - 1) + 0.5 * (l.upkeep - 1)) + l.leadMonths * 0.01;

/**
 * Turn component totals into project lines a careful engineer would order: for each, the
 * cheapest era model and count that covers it (at most ten units), from the best-value maker;
 * plus land if the site needs it. Used by the policy bots and the older build commands.
 */
export function planLines(state: GameState, components: Partial<Record<ComponentId, number>>, f?: Facility): LineSpec[] {
  const year = yearOf(state.clock.monthIndex);
  const out: LineSpec[] = [];
  let acres = 0;
  for (const id of (Object.keys(components) as ComponentId[]).sort()) {
    const need = components[id] ?? 0;
    if (id === 'site' || need <= 0) continue;
    const models = modelsFor(id, year).filter((m) => !m.id.startsWith('bin-hopper'));
    if (!models.length) continue;
    const each = COMPONENTS[id].unit === 'each';
    const options = models.map((m) => {
      const count = Math.max(1, each ? Math.round(need) : Math.ceil(need / m.size - 0.15));
      const waste = (count * m.size) / need;
      return { m, count, score: count * m.size * (m.costFactor ?? 1) * (waste > 1.25 ? waste : 1) };
    }).filter((o) => o.count <= 10 || o.m === models[models.length - 1]);
    const pick = [...options].sort((a, b) => a.score - b.score || a.m.id.localeCompare(b.m.id))[0];
    const makers = makersFor(id, year, pick.m.id);
    const brandId = needsMaker(pick.m) && makers.length ? [...makers].sort((a, b) => makerValueScore(a) - makerValueScore(b) || a.brandId.localeCompare(b.brandId))[0].brandId : undefined;
    out.push({ modelId: pick.m.id, ...(brandId ? { brandId } : {}), count: pick.count });
    acres += pick.m.footprintAcres * pick.count;
  }
  const free = f ? siteAcres(f) - footprintAcres(f.units) : 0;
  const wanted = f ? 0 : components.site ?? 0;
  const land = Math.max(wanted, Math.ceil(acres - free + (f ? 0.5 : 2)));
  if (land > 0 && (!f || acres > free)) out.push({ land });
  return out;
}
