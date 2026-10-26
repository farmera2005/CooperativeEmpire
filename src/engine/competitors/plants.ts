// Competitors' plants, unit by unit (D-131). Every competitor site carries installed units,
// split once from its totals the same way ours are; the totals the rest of the engine reads
// (storage, leg, dryer, load-out, supply capacities, condition) are derived from them. Each
// quarter units wear — faster at firms short of money — healthy firms rebuild worn units and
// replace obsolete ones, and expansions and shuttle loaders go up as catalog units from period
// makers. A plant's condition shows in the service farmers see.

import { COMPETITOR_AI, COMPETITOR_PLANTS as P } from '../../data/competition';
import { COMPONENTS, LOADOUT_RANK, type ComponentId, type LoadoutType } from '../../data/facilities';
import { AGING, PROJECTS } from '../../data/equipment';
import { yearOf } from '../core/calendar';
import { clamp } from '../core/math';
import type { Rng } from '../core/rng';
import type { TickContext } from '../sim/context';
import type { Competitor, CompetitorSite, Facility, GameState, InstalledUnit } from '../types';
import { makerOf, makersFor, modelOf, needsMaker, unitCapacity, unitValue2024 } from '../facilities/units';
import { makerValueScore, planLines } from '../facilities/projects';
import { competitorSiteKey, siteUnits } from '../facilities/valuation';
import { competitorName, siteComponents } from './competitors';

type Components = Partial<Record<ComponentId, number>>;
const STORAGE: ComponentId[] = ['storage-wood', 'storage-concrete', 'storage-steel', 'storage-flat'];
const isGrainSite = (s: CompetitorSite) => (s.division ?? 'GRAIN') === 'GRAIN';
const nextUnitId = (s: CompetitorSite) => Math.max(0, ...(s.units ?? []).map((u) => u.id), ...(s.building?.units ?? []).map((u) => u.id)) + 1;

/** Recompute a site's totals and condition from its units. */
export function syncSite(site: CompetitorSite): void {
  const units = site.units ?? [];
  const comps: Components = {};
  let w = 0;
  let c = 0;
  let loadout: LoadoutType = 'truck';
  for (const u of units) {
    comps[u.component] = (comps[u.component] ?? 0) + u.qty;
    const lo = COMPONENTS[u.component].loadout;
    if (lo && LOADOUT_RANK[lo] > LOADOUT_RANK[loadout]) loadout = lo;
    if (u.component === 'site') continue;
    const v = unitValue2024(u);
    w += v;
    c += v * u.condition;
  }
  site.components = comps;
  if (isGrainSite(site)) {
    site.storageBu = Math.round(STORAGE.reduce((a, id) => a + (comps[id] ?? 0), 0));
    site.receiveBuHr = Math.round(comps.receiving ?? 0);
    site.dryBuHr = Math.round(comps.dryer ?? 0);
    site.loadout = loadout;
  }
  if (w > 0) site.condition = Math.round((c / w) * 10) / 10;
}

/** Give every competitor site its units (new games, older saves, sites added later). */
export function ensureSiteUnits(state: GameState): void {
  for (const comp of state.competitors) {
    for (const site of comp.sites) {
      if (site.units) continue;
      site.units = siteUnits(state, siteComponents(site), site.builtYear, site.condition, competitorSiteKey(comp.id, site.id));
      syncSite(site);
    }
  }
}

/** Units for line items a competitor orders, with makers picked by value with some taste. */
function orderUnits(state: GameState, rng: Rng, site: CompetitorSite, add: Components, readyYear: number): InstalledUnit[] {
  const year = yearOf(state.clock.monthIndex);
  let id = nextUnitId(site);
  const out: InstalledUnit[] = [];
  // Land only if the site has run out of room.
  for (const l of planLines(state, add, { units: site.units ?? [] } as unknown as Facility)) {
    if ('land' in l) { out.push({ id: id++, modelId: 'land', component: 'site', qty: l.land, builtYear: readyYear, condition: 100 }); continue; }
    if ('rebuildUnitId' in l) continue;
    const m = modelOf(l.modelId);
    let brandId = l.brandId;
    const makers = needsMaker(m) ? makersFor(m.component, year, m.id) : [];
    if (makers.length > 1) brandId = rng.weighted(makers, (x) => 1 / makerValueScore(x) ** 8).brandId;
    const maker = makerOf(brandId, m.component);
    for (let i = 0; i < l.count; i++) out.push({ id: id++, modelId: m.id, ...(brandId ? { brandId } : {}), component: m.component, qty: unitCapacity(m, maker), builtYear: readyYear, condition: 100 });
  }
  return out;
}

const describe = (units: InstalledUnit[]): string => {
  const counts = new Map<string, number>();
  for (const u of units) if (u.component !== 'site') counts.set(modelOf(u.modelId).label, (counts.get(modelOf(u.modelId).label) ?? 0) + 1);
  return [...counts.entries()].map(([label, n]) => (n > 1 ? `${n} × ${label.toLowerCase()}` : `${/^[aeiou]/i.test(label) ? 'an' : 'a'} ${label.toLowerCase()}`)).join(', ');
};

const buildMonths = (units: InstalledUnit[]): number =>
  Math.max(1, ...units.map((u) => COMPONENTS[u.component].buildMonths + COMPONENTS[u.component].permitMonths)) + P.expansionExtraMonths;

/** Grow a site: more storage (and a leg to match) for grain, more of the main line for supply. Returns what is being built. */
export function startExpansion(ctx: TickContext, rng: Rng, c: Competitor, site: CompetitorSite): string | null {
  if (site.building) return null;
  const { state, mi } = ctx;
  const add: Components = {};
  if (isGrainSite(site)) {
    const more = Math.max(30_000, site.storageBu * COMPETITOR_AI.investStorage.value);
    add['storage-steel'] = more;
    const leg = site.receiveBuHr;
    if (leg > 0 && (site.storageBu + more) / leg > P.legRatio) add.receiving = (site.storageBu + more) / (P.legRatio * 0.75) - leg;
  } else {
    const comps = site.components ?? {};
    const main = (Object.keys(comps) as ComponentId[]).filter((id) => id !== 'site' && COMPONENTS[id].unit !== 'each').sort((a, b) => (comps[b] ?? 0) - (comps[a] ?? 0))[0];
    if (!main) return null;
    add[main] = (comps[main] ?? 0) * COMPETITOR_AI.investStorage.value;
  }
  const units = orderUnits(state, rng, site, add, yearOf(mi));
  if (!units.length) return null;
  site.building = { units, readyMonth: mi + buildMonths(units), label: describe(units) };
  void c;
  return site.building.label;
}

/** A shuttle loader at a main-line grain site: loop track, a big leg and storage to match. */
export function startShuttle(ctx: TickContext, rng: Rng, site: CompetitorSite): string | null {
  if (site.building || site.loadout === 'shuttle') return null;
  const add: Components = { 'loadout-shuttle': 1 };
  if (site.receiveBuHr < 40_000) add.receiving = 40_000 - site.receiveBuHr;
  if (site.storageBu < 1_500_000) add['storage-steel'] = 1_500_000 - site.storageBu;
  const units = orderUnits(ctx.state, rng, site, add, yearOf(ctx.mi));
  site.building = { units, readyMonth: ctx.mi + P.shuttleMonths, label: describe(units) };
  return site.building.label;
}

/** Quarterly: wear, rebuilds, replacements, finished projects, and the service plants earn. */
export function stepCompetitorPlants(ctx: TickContext, active: Competitor[], rng: Rng): void {
  const { state, mi } = ctx;
  const year = yearOf(mi);
  for (const c of active) {
    const st = c.strength ?? 50;
    const wear = st >= P.strongAbove ? P.wearStrong.value : st < P.weakBelow ? P.wearWeak.value : 1;
    for (const site of c.sites) {
      if (!site.units || (site.arrivalYear ?? 0) > year) continue;
      for (const u of site.units) {
        if (u.component === 'site') continue;
        const def = COMPONENTS[u.component];
        const over = def.lifeYears > 0 && year - u.builtYear > def.lifeYears ? AGING.overLifeWear.value : 1;
        u.condition = Math.max(0, u.condition - (def.decayPerYear * makerOf(u.brandId, u.component).durability * over * wear) / 4);
      }
      // A finished project comes into service.
      if (site.building && mi >= site.building.readyMonth) {
        const b = site.building;
        site.units = [...site.units, ...b.units];
        delete site.building;
        const shuttle = b.units.some((u) => u.component === 'loadout-shuttle');
        if (shuttle) c.service = clamp(c.service + 0.15, -1, 1);
        c.lastMove = shuttle ? 'opened a shuttle loader' : 'finished an expansion';
        // Word reaches us of shuttle loaders anywhere and of anything finished near our sites.
        if (shuttle || state.coop.facilities.some((f) => f.status !== 'closed' && (state.world.distances[f.townId]?.[site.townId] ?? Infinity) <= P.newsMiles)) ctx.inbox({ kind: 'news', title: `${competitorName(state, c)} ${shuttle ? 'opens a shuttle loader' : 'finishes an expansion'}`, body: `${competitorName(state, c)} has put ${b.label} into service at ${state.world.towns[site.townId].name}.` });
      }
      // Healthy firms rebuild their worst unit; strong ones replace worn-out obsolete equipment.
      const worst = [...site.units].filter((u) => u.component !== 'site').sort((a, b) => a.condition - b.condition || a.id - b.id)[0];
      if (worst && st > P.rebuildAbove && worst.condition < P.rebuildBelow && (worst.rebuilds ?? 0) < PROJECTS.maxRebuilds && rng.chance(P.rebuildProb.value)) {
        worst.condition = Math.min(PROJECTS.rebuildConditionCap.value, worst.condition + PROJECTS.rebuildConditionGain.value);
        worst.rebuilds = (worst.rebuilds ?? 0) + 1;
        c.strength = st - P.rebuildCost;
      } else if (worst && st > P.replaceAbove && !site.building && worst.condition < P.rebuildBelow + 5 && isObsolete(worst, year) && rng.chance(P.replaceProb.value)) {
        // Like for like in today's equipment: old storage becomes steel bins.
        const add: Components = { [STORAGE.includes(worst.component) ? 'storage-steel' : worst.component]: worst.qty };
        const units = orderUnits(state, rng, site, add, year);
        if (units.length) {
          site.units = site.units.filter((u) => u.id !== worst.id);
          site.building = { units, readyMonth: mi + buildMonths(units), label: describe(units) };
          c.strength = st - P.replaceCost;
          c.lastMove = `replacing old ${COMPONENTS[worst.component].label.toLowerCase()}`;
        }
      }
      syncSite(site);
    }
    c.plantService = plantService(c, year);
  }
}

const isObsolete = (u: InstalledUnit, year: number): boolean => {
  const m = modelOf(u.modelId);
  const life = COMPONENTS[u.component].lifeYears;
  return u.modelId.startsWith('legacy:') || (m.availableTo !== undefined && year >= m.availableTo) || (life > 0 && year - u.builtYear > life);
};

/** Service from the state of a firm's plants: well-kept plants run without delays and breakdowns. */
export function plantService(c: Competitor, year: number): number {
  let w = 0;
  let cond = 0;
  for (const s of c.sites) for (const u of (s.arrivalYear ?? 0) <= year ? s.units ?? [] : []) {
    if (u.component === 'site') continue;
    const v = unitValue2024(u);
    w += v;
    cond += v * u.condition;
  }
  if (w <= 0) return 0;
  return clamp((cond / w - P.servicePivot) * P.serviceScale.value, P.serviceBounds[0], P.serviceBounds[1]);
}

/** Service farmers see from a competitor: its company service plus what its plants earn. */
export const serviceOf = (c: Competitor): number => c.service + (c.plantService ?? 0);
