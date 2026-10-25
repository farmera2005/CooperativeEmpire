// Consultants and project managers (D-129). A roster of fictional engineering and design-build
// firms comes and goes over the decades. Each has a true skill and integrity the player never
// sees: only years in business, a reputation that is a noisy read of skill, their fees, and our
// own record with them. Skilled firms size a site to its market and pick good-value equipment;
// poor ones misjudge the market, and self-serving ones oversize and favor pricier makers.

import { COMPONENTS, KIND_DIVISION, KIND_LABEL, LOADOUT_RANK, midCost, typicalSite, type ComponentId, type FacilityKind } from '../../data/facilities';
import { CONSULTING, MODELS, type EquipmentModel, type MakerLine } from '../../data/equipment';
import { COMMODITIES, HARVEST_CALENDAR, MAX_HAUL_MILES, OPERATIONS } from '../../data/grain';
import { DIVISION_CONFIG, type SupplyDivision } from '../../data/supply';
import { SURNAMES } from '../../data/names';
import { BRANDS } from '../../data/brands';
import { valueAt } from '../../data/types';
import { yearOf } from '../core/calendar';
import { formatCents } from '../core/format';
import { roundCents, type Cents } from '../core/money';
import { makeRng, stream } from '../core/rng';
import { post } from '../ledger/ledger';
import type { CommandMessage } from '../sim/commands';
import type { DesignProposal, Facility, GameState } from '../types';
import { constructionLevel, nominalCents, pathFor } from '../world/macro';
import { marketValue } from '../world/marketPath';
import { YIELD_SERIES } from '../grain/operate';
import { grainCapacity } from './facilities';
import { footprintAcres, makersFor, modelsFor, needsMaker, siteAcres, unitPrice } from './units';

type Result = CommandMessage[];
const err = (text: string): Result => [{ level: 'error', text }];

export type Specialty = 'grain' | 'agronomy' | 'feed' | 'energy';
const KIND_SPECIALTY: Record<FacilityKind, Specialty> = { elevator: 'grain', agronomy: 'agronomy', feedmill: 'feed', energy: 'energy', station: 'energy', farmstore: 'energy' };

export interface Consultant {
  id: number;
  name: string;
  founded: number;
  /** Exclusive: gone from this year. */
  closes: number;
  specialties: Specialty[];
  /** Hidden: how well they size and run work (0–1), and how straight they are with the owner. */
  skill: number;
  integrity: number;
  /** Visible: stars 1–5 from what the trade says, a noisy read of skill. */
  reputation: number;
  designFee2024: number;
  pmFeePct: number;
  style: 'engineering firm' | 'design-build contractor' | 'independent consultant';
  /** Seed for the maker they lean toward in each category. */
  leanSeed: string;
}

// Surnames that are also equipment brands would read as endorsements; firms avoid them.
const BRAND_WORDS = new Set(BRANDS.flatMap((b) => b.name.split(/[^A-Za-z]+/)).filter((w) => w.length > 3));
const FIRM_PATTERNS = ['{a} & {b} Engineering', '{a} Ag Design', '{a} Grain Engineering', '{a}-{b} Design-Build', '{a} Associates', 'Prairie {a} Engineering', '{a} Agri-Systems Consulting', '{a} & Sons Builders'];
const STYLE: Consultant['style'][] = ['engineering firm', 'engineering firm', 'engineering firm', 'design-build contractor', 'independent consultant', 'engineering firm', 'independent consultant', 'design-build contractor'];

const rosterCache = new Map<string, Consultant[]>();

/** Every firm that will ever work in the region, for this game. Deterministic from the seed. */
export function consultantRoster(state: GameState): Consultant[] {
  const key = `${state.setup.gameSeed}|${state.world.regionId}`;
  const hit = rosterCache.get(key);
  if (hit) return hit;
  const rng = makeRng(`consultants|${key}`);
  const names = SURNAMES.filter((n) => !BRAND_WORDS.has(n));
  const out: Consultant[] = [];
  const span = [1935, 2040];
  const avgLife = (CONSULTING.firmYears[0] + CONSULTING.firmYears[1]) / 2;
  const n = Math.round((CONSULTING.rosterSize * (span[1] - span[0])) / avgLife);
  const used = new Set<string>();
  const kinds: Specialty[] = ['grain', 'agronomy', 'feed', 'energy'];
  for (let i = 0; i < n; i++) {
    const founded = Math.round(span[0] + ((span[1] - span[0]) * i) / n + rng.range(-2, 2));
    const closes = founded + rng.int(CONSULTING.firmYears[0], CONSULTING.firmYears[1]);
    const p = i % FIRM_PATTERNS.length;
    let name = '';
    for (let t = 0; t < 20 && (!name || used.has(name)); t++) name = FIRM_PATTERNS[(p + t) % FIRM_PATTERNS.length].replace('{a}', rng.pick(names)).replace('{b}', rng.pick(names));
    used.add(name);
    const skill = Math.max(0.05, Math.min(0.98, rng.normal(CONSULTING.skillMean, CONSULTING.skillSd)));
    const integrity = Math.max(0.1, Math.min(1, rng.normal(0.72, 0.2)));
    const heard = Math.max(0, Math.min(1, skill + rng.normal(0, CONSULTING.reputationNoise)));
    const main = kinds[i % kinds.length];
    const specialties = [main, ...kinds.filter((k) => k !== main && rng.chance(0.3))];
    // Grain work is the bread and butter: most firms take it.
    if (!specialties.includes('grain') && rng.chance(0.5)) specialties.push('grain');
    const [f0, f1] = CONSULTING.designFee.value;
    const [p0, p1] = CONSULTING.pmFeePct.value;
    const pricey = Math.max(0, Math.min(1, 0.5 * heard + 0.5 * rng.next()));
    out.push({
      id: 1000 + i, name, founded, closes, specialties, skill, integrity,
      reputation: Math.max(1, Math.min(5, Math.round((1 + heard * 4) * 2) / 2)),
      designFee2024: Math.round((f0 + (f1 - f0) * pricey) / 500) * 500,
      pmFeePct: Math.round((p0 + (p1 - p0) * pricey) * 1000) / 1000,
      style: STYLE[i % STYLE.length], leanSeed: `${key}|${i}`,
    });
  }
  rosterCache.set(key, out);
  return out;
}

/** Firms in business this year, by id. */
export function consultantsAvailable(state: GameState): Consultant[] {
  const y = yearOf(state.clock.monthIndex);
  return consultantRoster(state).filter((c) => c.founded <= y && y < c.closes);
}

export function consultantById(state: GameState, id: number): Consultant | null {
  return consultantsAvailable(state).find((c) => c.id === id) ?? null;
}

/** Our record with a firm: how its managed projects came in. */
export function trackRecord(state: GameState, id: number): { designs: number; projects: number; avgOverrun: number | null; avgSlip: number | null } {
  const log = state.coop.consultantLog.filter((r) => r.consultantId === id);
  const pm = log.filter((r) => r.role === 'pm');
  return {
    designs: log.filter((r) => r.role === 'design').length, projects: pm.length,
    avgOverrun: pm.length ? pm.reduce((a, r) => a + (r.overrun ?? 0), 0) / pm.length : null,
    avgSlip: pm.length ? pm.reduce((a, r) => a + (r.slip ?? 0), 0) / pm.length : null,
  };
}

/** Design study fee, nominal cents: smaller for farm-supply sites. */
export function designFee(state: GameState, c: Consultant, kind: FacilityKind): Cents {
  return nominalCents(pathFor(state), state.clock.monthIndex, c.designFee2024 * (kind === 'elevator' ? 1 : 0.6));
}

/** What a site at a town could do: the market a careful study would find. */
export interface SiteMarket {
  /** Grain: bushels a year we could expect to take in; supply: the size of what we'd serve. */
  annual: number;
  unit: string;
  /** Grain only: share of the year's receipts in the busiest week, and corn's share. */
  peakWeekShare: number;
  cornShare: number;
}

export function siteMarket(state: GameState, townId: number, kind: FacilityKind, facilityId?: number): SiteMarket {
  const year = yearOf(state.clock.monthIndex);
  const division = KIND_DIVISION[kind];
  const dist = state.world.distances;
  const reach = division === 'GRAIN' ? valueAt(MAX_HAUL_MILES, year) : DIVISION_CONFIG[division as SupplyDivision]?.reachMiles ?? 15;
  // Farms nearer another of our sites in the same line go there.
  const ours = state.coop.facilities.filter((f) => f.status !== 'closed' && f.division === division && f.id !== facilityId);
  const nearerOther = (t: number) => ours.some((f) => dist[t][f.townId] < dist[t][townId]);
  if (kind === 'station' || kind === 'farmstore') {
    let pop = 0;
    for (const t of state.world.towns) if (dist[townId][t.id] <= reach && !nearerOther(t.id)) pop += t.population * Math.max(0.2, 1 - dist[townId][t.id] / reach);
    return { annual: pop, unit: 'residents', peakWeekShare: 0, cornShare: 0 };
  }
  const path = pathFor(state);
  const yields = Object.fromEntries(COMMODITIES.map((c) => [c, marketValue(path, YIELD_SERIES[c], state.clock.monthIndex)])) as Record<string, number>;
  let annual = 0;
  let corn = 0;
  let peak = 0;
  for (const m of state.members.list) {
    if (m.status !== 'active') continue;
    const d = dist[townId][m.townId];
    if (d > reach || nearerOther(m.townId)) continue;
    const near = Math.max(0.3, 1 - d / reach);
    if (division === 'GRAIN') {
      for (const c of COMMODITIES) {
        const bu = m.acres[c] * yields[c] * m.weight * CONSULTING.grainShareNew * near;
        annual += bu;
        if (c === 'corn') corn += bu;
        peak += bu * Math.max(...HARVEST_CALENDAR[c]);
      }
    } else if (kind === 'feedmill') {
      annual += (m.livestock.hogs + m.livestock.dairy + m.livestock.beefCows + m.livestock.cattleOnFeed) * m.weight * near;
    } else annual += (m.acres.corn + m.acres.soybeans + m.acres.wheat + m.acres.other) * m.weight * near;
  }
  const unit = division === 'GRAIN' ? 'bu a year' : kind === 'feedmill' ? 'head of livestock' : 'crop acres';
  // The busiest week of the busiest month takes about a third of that month's harvest.
  return { annual, unit, peakWeekShare: annual > 0 ? (peak / annual) * 0.35 : 0, cornShare: annual > 0 ? corn / annual : 0 };
}

/** What a careful engineer would put at the site, by component (total, not additions). */
export function idealCapacity(state: GameState, townId: number, kind: FacilityKind, market: SiteMarket): Partial<Record<ComponentId, number>> {
  const year = yearOf(state.clock.monthIndex);
  if (kind === 'elevator') {
    const R = market.annual;
    const hoursWeek = OPERATIONS.harvestHoursPerDay.value * OPERATIONS.harvestDaysPerWeek.value;
    const peakWeek = R * market.peakWeekShare;
    const leg = peakWeek / hoursWeek / 0.75;
    // Dryers run around the clock; about 60% of the corn comes in needing drying.
    const dryer = (peakWeek * market.cornShare * 0.6) / (24 * 7 * 0.85);
    const town = state.world.towns[townId];
    const rails = town.railLineIds.map((id) => state.world.rail[id]).filter((r) => r.status === 'active');
    const main = rails.some((r) => r.kind === 'mainline');
    const out: Partial<Record<ComponentId, number>> = {
      'storage-steel': R / CONSULTING.turns, receiving: leg, dryer, 'truck-scale': 1 + Math.floor(leg / 15_000),
    };
    if (rails.length) {
      const lo: ComponentId = main && year >= 1996 && R > 4_000_000 ? 'loadout-shuttle' : main && year >= 1982 && R > 2_500_000 ? 'loadout-unit75'
        : year >= 1978 && R > 1_500_000 ? 'loadout-unit50' : year >= 1972 && R > 700_000 ? 'loadout-unit25' : 'loadout-single';
      out[lo] = 1;
    }
    return out;
  }
  const refs = CONSULTING.siteServes.value;
  const scale = Math.max(0.5, Math.min(3, market.annual * (kind === 'station' || kind === 'farmstore' ? 1 : CONSULTING.grainShareNew) / refs[kind]));
  const base = typicalSite(kind, year);
  const out: Partial<Record<ComponentId, number>> = {};
  for (const id of Object.keys(base) as ComponentId[]) {
    if (id === 'site') continue;
    const q = base[id] ?? 0;
    out[id] = COMPONENTS[id].unit === 'each' && ['chem-warehouse', 'seed-warehouse', 'pellet-mill', 'cardtrol'].includes(id) ? q : q * scale;
  }
  return out;
}

/** Lifecycle score of a maker for a careful buyer: price plus what upkeep and wear will cost. */
const valueScore = (l: MakerLine) => l.price * (1 + 0.6 * (l.durability - 1) + 0.5 * (l.upkeep - 1)) + l.leadMonths * 0.01;

/** Pick the model and count to cover `need` of a component: the best value a skilled designer finds. */
function pickModel(models: EquipmentModel[], need: number, skill: number, rng: ReturnType<typeof makeRng>): { model: EquipmentModel; count: number } | null {
  if (!models.length || need <= 0) return null;
  const each = COMPONENTS[models[0].component].unit === 'each';
  const options = models.map((m) => {
    const count = Math.max(1, each ? Math.round(need) : Math.ceil(need / m.size - 0.15));
    return { model: m, count, waste: (count * m.size) / Math.max(1, need), cost: count * m.size * (m.costFactor ?? 1) };
  }).filter((o) => o.count <= 10);
  if (!options.length) return { model: models[models.length - 1], count: Math.max(1, Math.round(need / models[models.length - 1].size)) };
  // A careless designer grabs whatever size they used last time.
  if (rng.next() > skill) return rng.pick(options);
  return [...options].sort((a, b) => a.cost * (a.waste > 1.25 ? a.waste : 1) - b.cost * (b.waste > 1.25 ? b.waste : 1))[0];
}

/** Build a design for a site; deterministic for the firm, site and month. */
export function designFor(state: GameState, c: Consultant, townId: number, kind: FacilityKind, facilityId?: number): Omit<DesignProposal, 'id' | 'fee'> {
  const mi = state.clock.monthIndex;
  const year = yearOf(mi);
  const rng = stream(state.setup.gameSeed, mi, 'facilities.design', `${c.id}|${townId}|${kind}|${facilityId ?? ''}`);
  const f = facilityId !== undefined ? state.coop.facilities.find((x) => x.id === facilityId) : undefined;
  const market = siteMarket(state, townId, kind, facilityId);
  const inField = c.specialties.includes(KIND_SPECIALTY[kind]);
  const skill = c.skill * (inField ? 1 : 0.6);
  const [e0, e1] = CONSULTING.designErrorSd;
  const sd = e0 + (e1 - e0) * skill;
  // One read of the market, wrong by the same factor throughout, plus padding from a firm
  // that profits from bigger jobs.
  const misread = Math.exp(rng.normal(0, sd));
  const pad = 1 + CONSULTING.goldPlating * (1 - c.integrity) * 0.5;
  const seen: typeof market = { ...market, annual: market.annual * misread };
  const ideal = idealCapacity(state, townId, kind, seen);
  const existing = f?.components ?? {};
  const notes: string[] = [];
  const lines: DesignProposal['lines'] = [];
  const lean = makeRng(c.leanSeed);
  const leanFor = new Map<string, number>();
  for (const id of (Object.keys(ideal) as ComponentId[]).sort()) {
    let target = (ideal[id] ?? 0) * (COMPONENTS[id].unit === 'each' ? 1 : pad);
    // Each component also gets its own small error.
    if (COMPONENTS[id].unit !== 'each') target *= Math.exp(rng.normal(0, sd * 0.4));
    const have = COMPONENTS[id].loadout
      ? (LOADOUT_RANK[grainCapacity(existing).loadout] >= LOADOUT_RANK[COMPONENTS[id].loadout!] ? 1 : 0)
      : id === 'storage-steel' ? grainCapacity(existing).storageBu : existing[id] ?? 0;
    const gap = target - have;
    if (gap <= Math.max(target * 0.1, COMPONENTS[id].unit === 'each' ? 0.5 : 0)) continue;
    // Careless designers sometimes leave out the supporting pieces.
    if (['truck-scale', 'dryer', 'bulk-feed-truck', 'fuel-truck'].includes(id) && rng.next() > 0.7 + 0.3 * skill) { notes.push(''); continue; }
    const models = modelsFor(id, year).filter((m) => !m.id.startsWith('bin-hopper'));
    const pick = pickModel(models, gap, skill, rng);
    if (!pick) continue;
    let brandId: string | undefined;
    if (needsMaker(pick.model)) {
      const makers = makersFor(id, year, pick.model.id);
      if (makers.length) {
        if (!leanFor.has(id)) leanFor.set(id, lean.next());
        // Straight firms pick the best value; others lean to a favorite, usually a pricier one.
        if (rng.next() < c.integrity) brandId = [...makers].sort((a, b) => valueScore(a) + rng.normal(0, 0.06 * (1 - skill)) - valueScore(b))[0].brandId;
        else brandId = [...makers].sort((a, b) => b.price - a.price)[Math.floor(leanFor.get(id)! * Math.min(2, makers.length))].brandId;
      }
    }
    lines.push({ modelId: pick.model.id, ...(brandId ? { brandId } : {}), count: pick.count });
  }
  // Worn equipment: rebuild or replace.
  for (const u of f?.units ?? []) if (u.component !== 'site' && u.condition < 35) notes.push(`Unit ${u.id} (${COMPONENTS[u.component].label.toLowerCase()}, ${u.builtYear}) is at condition ${Math.round(u.condition)}: rebuild or replace it.`);
  // Land for what is planned.
  const acresNeeded = lines.reduce((a, l) => a + (MODELS.find((m) => m.id === l.modelId)?.footprintAcres ?? 0) * l.count, 0);
  const free = f ? siteAcres(f) - footprintAcres(f.units) : 0;
  if (acresNeeded > free) lines.push({ modelId: 'land', count: 1, acres: Math.ceil((acresNeeded - free) * 1.3 + (f ? 0 : 2)) });
  const unit = market.unit;
  const basis: DesignProposal['basis'] = [{ label: kind === 'elevator' ? 'Expected receipts' : 'Expected market served', value: Math.round(seen.annual * (kind === 'station' || kind === 'farmstore' ? 1 : 1)), unit }];
  if (kind === 'elevator') {
    basis.push({ label: 'Busiest harvest week', value: Math.round(seen.annual * seen.peakWeekShare), unit: 'bu' });
    basis.push({ label: 'Corn share of receipts', value: Math.round(seen.cornShare * 100), unit: '%' });
  }
  const cleanNotes = notes.filter(Boolean);
  if (!lines.length) cleanNotes.unshift(`${c.name} sees no need to add to ${f?.name ?? 'this site'} for the market it expects.`);
  return { consultantId: c.id, month: mi, townId, kind, ...(facilityId !== undefined ? { facilityId } : {}), lines, basis, notes: cleanNotes };
}

/** Commission a design study; the fee is expensed and the design kept until used. */
export function commissionDesign(state: GameState, consultantId: number, townId: number, kind: FacilityKind, facilityId?: number): Result {
  const c = consultantById(state, consultantId);
  if (!c) return err('That firm is not available.');
  const town = state.world.towns[townId];
  if (!town) return err('Unknown town.');
  const f = facilityId !== undefined ? state.coop.facilities.find((x) => x.id === facilityId && x.status !== 'closed') : undefined;
  if (facilityId !== undefined && !f) return err('Unknown site.');
  const fee = designFee(state, c, f?.kind ?? kind);
  const division = KIND_DIVISION[f?.kind ?? kind];
  post(state, { source: 'consulting', memo: `Design study: ${c.name}`, lines: [{ account: '7670', division, amount: fee }, { account: '1000', division, amount: -fee }] });
  const d = designFor(state, c, f?.townId ?? townId, f?.kind ?? kind, f?.id);
  const id = state.coop.nextId++;
  state.coop.designs.push({ ...d, id, fee });
  state.coop.consultantLog.push({ consultantId: c.id, designId: id, month: state.clock.monthIndex, role: 'design' });
  return [{ level: 'info', text: `${c.name} delivered a design for ${f ? f.name : `a ${KIND_LABEL[kind].toLowerCase()} at ${town.name}`} (fee ${formatCents(fee)}). Review it under Designs on hand (Buy or build).` }];
}

/** Price of a design's lines at today's prices (cents), for showing it. */
export function designCost(state: GameState, d: DesignProposal): Cents {
  const mi = state.clock.monthIndex;
  const path = pathFor(state);
  let t = 0;
  for (const l of d.lines) {
    if (l.modelId === 'land') { t += roundCents(midCost('site', yearOf(mi)) * (l.acres ?? 0) * constructionLevel(path, mi) * 100); continue; }
    const m = MODELS.find((x) => x.id === l.modelId);
    if (!m) continue;
    const maker = makersFor(m.component, yearOf(mi)).find((x) => x.brandId === l.brandId);
    t += unitPrice(path, mi, m, maker ?? { brandId: '', components: [], price: 1, durability: 1, upkeep: 1, leadMonths: 0, note: '', confidence: 'low' }) * l.count;
  }
  return t;
}

export type { Facility };
